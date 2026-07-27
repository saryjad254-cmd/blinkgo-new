/**
 * Customer Refund Request
 * ────────────────────────
 * POST /api/orders/[id]/refund
 * Body: { reason: string }
 *
 * Customer-only. Submits a refund request for an order.
 * After restaurant review/admin approval, the refund is processed.
 *
 * Refund rules:
 *  - Order must be 'delivered' or 'cancelled'
 *  - Within 7 days of order placement
 *  - One refund request per order
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity, type AuthedContext } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { assertCanReadOrder } from '@/lib/api/ownership';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFUND_WINDOW_DAYS = 7;
const REFUND_REASONS = [
  'food_quality',
  'wrong_order',
  'missing_items',
  'late_delivery',
  'damaged',
  'other',
] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => requestRefund(r as NextRequest, ctx, params.id) as any,
  )(req)) as unknown as NextResponse;
}

async function requestRefund(
  req: NextRequest,
  ctx: { auth: AuthedContext },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Ownership check
    await assertCanReadOrder(ctx.auth.user, orderId);

    // 2) Parse reason
    const body = await req.json().catch(() => ({}));
    const reasonKey = String(body.reason ?? '');
    if (!REFUND_REASONS.includes(reasonKey as any)) {
      throw new ValidationError('Invalid refund reason');
    }
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;

    // 3) Get order
    const supabase = createServiceClient();
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, customer_id, status, total, created_at')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new NotFoundError('Order not found');

    // 4) Check eligibility
    if (!['delivered', 'cancelled'].includes(order.status)) {
      throw new ValidationError(`Refunds can only be requested for delivered or cancelled orders (current: ${order.status})`);
    }

    const orderDate = new Date(order.created_at);
    const now = new Date();
    const daysSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceOrder > REFUND_WINDOW_DAYS) {
      throw new ValidationError(`Refund window has expired (${REFUND_WINDOW_DAYS} days)`);
    }

    // 5) v84: the refund REQUEST now lives in the `payments` table
    //    (status='refund_requested'). The v84 migration 56-schema-reconcile
    //    defines a `request_refund` RPC that does an atomic INSERT and
    //    is idempotent on retries. We try the RPC first; if it is
    //    missing in production (e.g. migration 56 not yet applied) we
    //    fall back to a direct INSERT with an existence check.
    const svc = createServiceClient();
    const reasonText = `${reasonKey}${notes ? `: ${notes}` : ''}`;
    let refundRow: { refund_id: string; order_id: string; amount: number; reason: string; status: string; already_exists: boolean } | null = null;

    const { data: rpcResult, error: rpcErr } = await svc.rpc('request_refund', {
      p_order_id: orderId,
      p_user_id: ctx.auth.user.id,
      p_amount: order.total,
      p_reason: reasonText,
    });

    if (!rpcErr && rpcResult) {
      refundRow = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    } else {
      // v84 fallback: direct INSERT into payments with the partial
      // unique index as the DB-level guard. Matches the logic of the
      // v84 request_refund RPC without depending on it.
      logger.warn('request_refund RPC failed, using direct INSERT fallback', { orderId, error: rpcErr?.message });
      const { data: existing } = await svc
        .from('payments')
        .select('id, order_id, amount_cents, currency, status, metadata, created_at')
        .eq('order_id', orderId)
        .eq('status', 'refund_requested')
        .maybeSingle();
      if (existing) {
        refundRow = {
          refund_id: existing.id,
          order_id: existing.order_id,
          amount: (existing.amount_cents ?? 0) / 100,
          reason: (existing.metadata as any)?.refund_reason ?? reasonText,
          status: existing.status,
          already_exists: true,
        };
      } else {
        const newId = crypto.randomUUID();
        const { data: inserted, error: insErr } = await svc
          .from('payments')
          .insert({
            id: newId,
            order_id: orderId,
            customer_id: ctx.auth.user.id,
            amount_cents: Math.round(Number(order.total) * 100),
            currency: 'EUR',
            payment_method: 'refund_request',
            payment_provider: 'internal',
            provider_payment_id: newId,
            stripe_payment_intent_id: null,
            status: 'refund_requested',
            metadata: { refund_reason: reasonText, requested_by: ctx.auth.user.id },
          })
          .select()
          .single();
        if (insErr) {
          // Most likely a race: another request beat us to the partial
          // unique index. Re-read.
          if (insErr.code === '23505' || /duplicate/i.test(insErr.message ?? '')) {
            const { data: re } = await svc
              .from('payments')
              .select('id, order_id, amount_cents, currency, status, metadata, created_at')
              .eq('order_id', orderId)
              .eq('status', 'refund_requested')
              .maybeSingle();
            if (re) {
              refundRow = {
                refund_id: re.id,
                order_id: re.order_id,
                amount: (re.amount_cents ?? 0) / 100,
                reason: (re.metadata as any)?.refund_reason ?? reasonText,
                status: re.status,
                already_exists: true,
              };
            } else {
              logger.error('Refund INSERT failed even after race recovery', { orderId, error: insErr });
              throw new Error('Failed to create refund request');
            }
          } else {
            logger.error('Refund INSERT failed', { orderId, error: insErr });
            throw new Error('Failed to create refund request');
          }
        } else {
          refundRow = {
            refund_id: inserted.id,
            order_id: inserted.order_id,
            amount: (inserted.amount_cents ?? 0) / 100,
            reason: reasonText,
            status: inserted.status,
            already_exists: false,
          };
        }
      }
    }

    if (!refundRow) {
      throw new Error('Failed to create refund request');
    }
    const refund = {
      id: refundRow.refund_id,
      order_id: refundRow.order_id,
      amount: refundRow.amount,
      reason: refundRow.reason,
      status: refundRow.status,
    };
    const alreadyExists = Boolean(refundRow.already_exists);

    // 7) Notify admins (in-app) — skip if this was an idempotent retry
    //    (the existing refund request was already notified the first time).
    if (!alreadyExists) {
      try {
        const { data: admins } = await svc.from('users').select('id').in('role', ['admin', 'super_admin']);
        if (admins && admins.length > 0) {
          const notifications = admins.map((a: any) => ({
            user_id: a.id,
            type: 'refund_request',
            title: 'Neue Rückerstattungsanfrage',
            body: `Bestellung #${order.id.slice(0, 8)} · €${order.total.toFixed(2)}`,
            data: { refund_id: refund.id, order_id: order.id },
          }));
          await svc.from('notifications').insert(notifications);
        }
      } catch (e) {
        // Non-fatal
        logger.warn('Failed to notify admins of refund', { refundId: refund.id, error: (e as Error).message });
      }
    }

    return ok({ refund, idempotent: alreadyExists });
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => listRefunds(ctx, params.id) as any,
  )(_req)) as unknown as NextResponse;
}

async function listRefunds(
  ctx: { auth: { user: { id: string; role: string } } },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // Ownership check
    await assertCanReadOrder(ctx.auth.user, orderId);

    // v84: refund REQUEST workflow now lives in the `payments` table
    // (status='refund_requested'). The legacy `refunds` table from
    // migration-22 was never deployed to production. The migration
    // 56-schema-reconcile defines a `request_refund` RPC that
    // inserts into payments atomically.
    const supabase = createServiceClient();
    const { data: refundRows, error } = await supabase
      .from('payments')
      .select('id, order_id, amount_cents, currency, status, metadata, created_at')
      .eq('order_id', orderId)
      .in('status', ['refund_requested', 'refund_processing', 'refund_succeeded', 'refund_failed'])
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn('listRefunds: payments query failed (table missing?)', { orderId, error: error.message });
      return ok({ refunds: [] });
    }

    // Project to the legacy refunds shape so the client UI doesn't break
    const refunds = (refundRows ?? []).map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      amount: (r.amount_cents ?? 0) / 100,
      currency: r.currency ?? 'EUR',
      status: r.status,
      reason: r.metadata?.refund_reason ?? null,
      created_at: r.created_at,
    }));
    return ok({ refunds });
  });
}
