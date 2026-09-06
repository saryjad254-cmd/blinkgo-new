import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, type HandlerContext } from '@/lib/api/security';
import { ok, withErrorHandling } from '@/lib/api/response';
import { createServiceClient } from '@/lib/supabase/service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function customerOrder(userId: string, orderId: string) {
  const service = createServiceClient();
  const { data: order } = await service.from('orders').select('id,status,customer_id').eq('id', orderId).eq('customer_id', userId).maybeSingle();
  if (!order) throw new NotFoundError('Order');
  return { service, order };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  const wrapped = withSecurity({ roles: ['customer'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const { service } = await customerOrder(ctx.auth.user.id, id);
    const { data, error } = await service.from('order_item_replacements').select('*').eq('order_id', id).order('created_at', { ascending: false });
    if (error) throw error;
    return ok({ replacements: data ?? [] });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  const wrapped = withSecurity({ roles: ['customer'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const body = await ctx.req.json().catch(() => null) as Record<string, unknown> | null;
    const replacementId = String(body?.replacement_id ?? '');
    const action = String(body?.action ?? '');
    if (!UUID.test(id) || !UUID.test(replacementId)) throw new ValidationError('Valid order and replacement IDs are required');
    if (!['accept', 'reject'].includes(action)) throw new ValidationError('Action must be accept or reject');
    const { service } = await customerOrder(ctx.auth.user.id, id);
    const { data, error } = await service.rpc('respond_order_item_replacement', {
      p_order_id: id,
      p_replacement_id: replacementId,
      p_action: action,
      p_actor_id: ctx.auth.user.id,
    });
    if (error) {
      if (/FORBIDDEN|REPLACEMENT_NOT_FOUND/.test(error.message)) throw new NotFoundError('Replacement');
      if (/ALREADY_RESOLVED|PROPOSAL_EXPIRED|ORDER_STATE_LOCKED/.test(error.message)) throw new ConflictError(error.message);
      throw new ValidationError(error.message || 'Replacement response failed');
    }
    return ok({ replacement: Array.isArray(data) ? data[0] : data });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}
