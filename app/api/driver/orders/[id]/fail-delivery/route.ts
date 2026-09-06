import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { isFailedDeliveryReason } from '@/lib/driver/delivery-outcome-policy';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  return (await withSecurity(
    secureRoute('strict', ['driver', 'admin', 'super_admin']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, request) => failDelivery(ctx, request as NextRequest, id) as any,
  )(req)) as unknown as NextResponse;
}

async function failDelivery(
  ctx: { auth: { user: { id: string; role: string } } },
  req: NextRequest,
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const body = await req.json().catch(() => ({}));
    if (!isFailedDeliveryReason(body.reason_code)) throw new ValidationError('Invalid failed-delivery reason');
    const reasonCode = body.reason_code;
    const details = typeof body.details === 'string' ? body.details.trim().slice(0, 500) : '';
    const contactAttempts = Number.isInteger(body.contact_attempts) ? Math.max(0, Math.min(9, body.contact_attempts)) : 0;
    if (reasonCode === 'customer_unreachable' && contactAttempts < 2) {
      throw new ValidationError('Try to contact the customer at least twice before ending the delivery');
    }
    if (['unsafe_location', 'recipient_refused', 'damaged_order', 'other'].includes(reasonCode) && details.length < 5) {
      throw new ValidationError('Please add a short description');
    }

    const service = createServiceClient();
    const { data: order, error: orderError } = await service
      .from('orders')
      .select('id,order_number,status,driver_id,customer_id,restaurant_id')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError || !order) throw new NotFoundError('Order');
    const isAdmin = ['admin', 'super_admin'].includes(ctx.auth.user.role);
    if (order.driver_id !== ctx.auth.user.id && !isAdmin) throw new AuthorizationError('You are not the assigned driver');
    if (!['picked_up', 'delivering'].includes(order.status)) {
      throw new ConflictError(`Cannot fail delivery in status: ${order.status}`, { code: 'INVALID_TRANSITION' });
    }

    const { data: arrival } = await service
      .from('order_tracking_events')
      .select('id')
      .eq('order_id', orderId)
      .eq('event_type', 'driver_arrived_dropoff')
      .limit(1)
      .maybeSingle();
    if (!arrival && !isAdmin && reasonCode !== 'unsafe_location') {
      throw new ValidationError('Record arrival at the delivery location first');
    }

    const { data: failedOrder, error: failError } = await service
      .rpc('fail_driver_delivery', {
        p_order_id: orderId,
        p_driver_id: order.driver_id,
        p_reason_code: reasonCode,
        p_details: details,
        p_contact_attempts: contactAttempts,
      })
      .single();
    if (failError || !failedOrder) throw new ConflictError('Order state changed — please refresh', { code: 'DELIVERY_STATE_CHANGED' });

    const now = new Date().toISOString();
    await Promise.allSettled([
      service.from('order_tracking_events').insert({
        order_id: orderId,
        driver_id: order.driver_id,
        event_type: 'delivery_failed',
        status: 'could_not_deliver',
        metadata: { reason_code: reasonCode, details: details || null, contact_attempts: contactAttempts },
        created_at: now,
      }),
      service.from('support_tickets').insert({
        user_id: order.driver_id,
        user_role: 'driver',
        category: 'failed_delivery',
        subject: `Failed delivery: ${reasonCode}`,
        message: details || `Order #${order.order_number || order.id} could not be delivered.`,
        priority: ['unsafe_location', 'damaged_order'].includes(reasonCode) ? 'urgent' : 'high',
        order_id: orderId,
        status: 'open',
        created_at: now,
        updated_at: now,
      }),
      order.customer_id ? service.from('notifications').insert({
        user_id: order.customer_id,
        type: 'order_cancelled',
        title: 'Zustellung nicht möglich',
        body: `Bestellung #${order.order_number || order.id.slice(0, 8)} konnte nicht übergeben werden. Der Support prüft den Vorgang.`,
        data: { order_id: orderId, reason_code: reasonCode },
        is_read: false,
      }) : Promise.resolve(),
    ]).then((results) => {
      if (results.some((result) => result.status === 'rejected')) logger.warn('Failed-delivery side effect failed', { orderId, reasonCode });
    });

    await audit('DRIVER_FAILED_DELIVERY', {
      severity: ['unsafe_location', 'damaged_order'].includes(reasonCode) ? 'critical' : 'warn',
      userId: ctx.auth.user.id,
      userRole: ctx.auth.user.role,
      resource: 'order',
      resourceId: orderId,
      metadata: { reason_code: reasonCode, contact_attempts: contactAttempts },
    });

    return ok({ order: failedOrder, outcome: { reason_code: reasonCode, contact_attempts: contactAttempts, support_escalated: true } });
  });
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
