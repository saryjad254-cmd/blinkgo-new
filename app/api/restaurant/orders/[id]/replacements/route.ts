import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, type HandlerContext } from '@/lib/api/security';
import { ok, withErrorHandling } from '@/lib/api/response';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownedOrder(userId: string, orderId: string) {
  const lookup = createServiceClient();
  const { data: candidate } = await lookup.from('orders').select('id,status,restaurant_id').eq('id', orderId).maybeSingle();
  if (!candidate) throw new NotFoundError('Order');
  const { service, restaurantId } = await resolveOwnedRestaurant(userId, candidate.restaurant_id);
  if (!restaurantId) throw new NotFoundError('Order');
  return { service, order: candidate };
}

function rpcError(message: string) {
  if (/FORBIDDEN/.test(message)) return new NotFoundError('Order');
  if (/ORDER_NOT_FOUND|ITEM_NOT_FOUND|REPLACEMENT_UNAVAILABLE/.test(message)) return new NotFoundError('Replacement resource');
  if (/ORDER_STATE_LOCKED|CUSTOMER_REQUESTED_REFUND|SAME_PRODUCT|REPLACEMENT_MORE_EXPENSIVE|INVALID_EXPIRY/.test(message)) return new ConflictError(message);
  return new ValidationError(message || 'Replacement proposal failed');
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  const wrapped = withSecurity({ roles: ['restaurant'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const { service } = await ownedOrder(ctx.auth.user.id, id);
    const { data, error } = await service.from('order_item_replacements').select('*').eq('order_id', id).order('created_at', { ascending: false });
    if (error) throw error;
    return ok({ replacements: data ?? [] });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  const wrapped = withSecurity({ roles: ['restaurant'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const body = await ctx.req.json().catch(() => null) as Record<string, unknown> | null;
    const orderItemId = String(body?.order_item_id ?? '');
    const productId = String(body?.replacement_product_id ?? '');
    const quantity = Number(body?.replacement_quantity ?? 1);
    const reason = String(body?.reason ?? '').trim();
    if (!UUID.test(id) || !UUID.test(orderItemId) || !UUID.test(productId)) throw new ValidationError('Valid order, item and product IDs are required');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new ValidationError('Quantity must be between 1 and 99');
    if (reason.length > 240) throw new ValidationError('Reason is too long');
    const { service } = await ownedOrder(ctx.auth.user.id, id);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { data, error } = await service.rpc('propose_order_item_replacement', {
      p_order_id: id,
      p_order_item_id: orderItemId,
      p_replacement_product_id: productId,
      p_replacement_quantity: quantity,
      p_reason: reason || null,
      p_actor_id: ctx.auth.user.id,
      p_expires_at: expiresAt,
    });
    if (error) throw rpcError(error.message);
    return ok({ replacement: Array.isArray(data) ? data[0] : data });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}
