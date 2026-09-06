import { apiRoute, ok, tier, z, ValidationError, ConflictError, AppError, RateLimitError } from '@/lib/api/canonical';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCheckoutDraftSignature } from '@/lib/checkout/draft-signature';
import { requireFeatureFlag } from '@/lib/platform/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CashCheckoutSchema = z.object({ draft_id: z.string() });

interface CashDraftPayload extends Record<string, unknown> {
  payment_method?: string;
  can_place_order?: boolean;
  restaurant_id?: string;
  fulfillment_type?: 'delivery' | 'pickup';
  delivery_address?: unknown;
  tip?: number;
  coupon?: { code?: string } | null;
  scheduled_for?: string | null;
  points_redeemed?: number;
  group_order_id?: string;
  lines?: Array<{
    product_id?: string;
    quantity?: number;
    config_key?: string;
    configuration?: Record<string, unknown>;
  }>;
}

export const POST = apiRoute({
  method: 'POST',
  auth: 'required',
  roles: ['customer', 'admin', 'super_admin'],
  rateLimit: tier('strict'),
  bodySchema: CashCheckoutSchema,
  handler: async ({ req, body, user }) => {
    if (!user) throw new ValidationError('Authentication required');
    const draftId = String((body as { draft_id: string }).draft_id ?? '');
    if (!/^DRF-\d{14}-[0-9A-F]{8}-[0-9A-F]{4}$/.test(draftId)) {
      throw new ValidationError('Invalid checkout draft');
    }
    await requireFeatureFlag('orders.create.enabled', { userId: user.id, role: user.role, activeOrder: false });
    await requireFeatureFlag('payments.cash.enabled', { userId: user.id, role: user.role, activeOrder: false });

    const service = createServiceClient();
    const { data: row, error } = await service
      .from('order_drafts')
      .select('id,customer_id,draft,signature,expires_at,used,confirmed_by,deleted_at')
      .eq('id', draftId)
      .maybeSingle();
    const draft = row?.draft as CashDraftPayload | undefined;
    if (
      error || !row || !draft || row.customer_id !== user.id || row.deleted_at ||
      new Date(row.expires_at).getTime() <= Date.now() || draft.payment_method !== 'cash' ||
      draft.can_place_order !== true || !verifyCheckoutDraftSignature(draft, row.signature)
    ) {
      throw new ValidationError('Checkout draft is invalid or expired');
    }

    // A previously burned cash draft is resumable by its owner. The orders
    // endpoint derives a deterministic order number and returns the existing
    // order when the first response was lost.
    if (!row.used) {
      const { data: burned, error: burnError } = await service.rpc('burn_order_draft', {
        p_draft_id: draftId,
        p_confirmed_by: user.id,
      });
      if (burnError || burned !== true) {
        // Another request may have won the atomic burn a few milliseconds
        // earlier. Resume the same deterministic order for the same owner.
        const { data: claimed } = await service
          .from('order_drafts')
          .select('used,confirmed_by')
          .eq('id', draftId)
          .maybeSingle();
        if (claimed?.used !== true || claimed.confirmed_by !== user.id) {
          throw new ConflictError('Checkout is already being confirmed');
        }
      }
    } else if (row.confirmed_by !== user.id) {
      throw new ConflictError('Checkout was already confirmed');
    }

    const headers = new Headers({
      'Content-Type': 'application/json',
      'Origin': new URL(req.url).origin,
      'X-Idempotency-Key': `cash-draft:${draftId}`,
    });
    const authorization = req.headers.get('authorization');
    const cookie = req.headers.get('cookie');
    if (authorization) headers.set('Authorization', authorization);
    if (cookie) headers.set('Cookie', cookie);

    const orderBody = JSON.stringify({
      restaurant_id: draft.restaurant_id,
      items: (draft.lines ?? []).map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity,
        config_key: line.config_key,
        configuration: line.configuration ?? {},
      })),
      payment_method: 'cash',
      fulfillment_type: draft.fulfillment_type,
      delivery_address: draft.delivery_address ?? undefined,
      tip: draft.tip,
      coupon_code: draft.coupon?.code,
      ...(draft.scheduled_for ? { scheduled_for: draft.scheduled_for } : {}),
      ...(typeof draft.points_redeemed === 'number' ? { points_redeemed: draft.points_redeemed } : {}),
      ...(draft.group_order_id ? { group_order_id: draft.group_order_id } : {}),
      checkout_draft_id: draftId,
    });
    let orderResponse: Response | null = null;
    let payload: {
      ok?: boolean;
      data?: { order?: { id?: string } };
      error?: { code?: string; message?: string; details?: { retryAfter?: number } };
      message?: string;
    } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      orderResponse = await fetch(new URL('/api/orders', req.url), {
        method: 'POST',
        headers,
        body: orderBody,
      });
      payload = await orderResponse.json().catch(() => null);
      if (
        orderResponse.status !== 409
        || payload?.error?.code !== 'IDEMPOTENCY_IN_PROGRESS'
        || attempt === 3
      ) break;
      const retryAfter = Number(orderResponse.headers.get('Retry-After'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 2_000)
        : 250 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (!orderResponse) throw new ConflictError('Order could not be created');
    if (!orderResponse.ok || !payload?.ok || !payload?.data?.order?.id) {
      if (payload?.error?.code === 'IDEMPOTENCY_IN_PROGRESS') {
        throw new AppError('The original request is still being processed', {
          statusCode: 409,
          code: 'IDEMPOTENCY_IN_PROGRESS',
        });
      }
      if (payload?.error?.code === 'RATE_LIMITED') {
        throw new RateLimitError(payload.error.details?.retryAfter);
      }
      throw new ConflictError('Order could not be created');
    }
    return ok({ order: payload.data.order, draft_id: draftId });
  },
});
