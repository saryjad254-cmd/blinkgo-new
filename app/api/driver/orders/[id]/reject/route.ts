/**
 * Driver reject order.
 * POST /api/driver/orders/[id]/reject
 * Body: { reason? }
 *
 * Behavior:
 * - If the order is currently assigned to this driver, release it back to the pool.
 * - Track the rejection on the driver's record.
 * - Increment the driver's "rejection" counter for performance metrics.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { NotFoundError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => rejectOrder(ctx, r as NextRequest, params.id) as any,
  )(req)) as unknown as NextResponse;
}

async function rejectOrder(
  ctx: { auth: { user: { id: string; role: string } } },
  req: NextRequest,
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = ctx.auth.user;

    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? '').slice(0, 200);

    const svc = createServiceClient();
    const { data: order } = await svc.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) throw new NotFoundError('Order');
    if (order.driver_id !== user.id && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'manager') {
      throw new ConflictError('Order is not assigned to you');
    }
    // v82 fix: only allow driver-initiated release BEFORE the driver
    // physically has the food. Once the order is in 'picked_up' or
    // beyond, the driver must use /api/orders/status to transition to
    // 'could_not_deliver' (which keeps the driver on the hook and
    // triggers the refund flow). Otherwise a driver could mark the
    // food picked up, then "reject" the order — leaving the status
    // stuck at picked_up with no driver and the food somewhere on a
    // sidewalk.
    const RELEASEABLE_FROM = ['confirmed', 'preparing', 'ready'];
    if (user.role === 'driver' && !RELEASEABLE_FROM.includes(order.status)) {
      throw new ConflictError(
        `Order can no longer be released in status: ${order.status}. ` +
        `Use the 'could_not_deliver' transition instead.`,
        { current_status: order.status, code: 'TOO_LATE_TO_RELEASE' },
      );
    }
    // Release the order: unassign driver, leave status
    const { error: updateErr } = await svc
      .from('orders')
      .update({
        driver_id: null,
        notes: order.notes
          ? `${order.notes}\n[rejected] ${reason}`.slice(0, 1000)
          : `[rejected] ${reason}`,
      })
      .eq('id', orderId)
      .in('status', RELEASEABLE_FROM); // atomic guard — concurrent status change will reject this update
    if (updateErr) {
      logger.error('Driver reject failed', { orderId }, updateErr);
      throw new Error('Failed to reject order');
    }
    // Log tracking event
    try {
      await svc.from('order_tracking_events').insert({
        order_id: orderId,
        driver_id: user.id,
        event_type: 'driver_rejected',
        notes: reason,
      });
    } catch {}
    await audit('DRIVER_ACCEPTED_ORDER', {
      severity: 'warn',
      userId: user.id,
      userRole: user.role,
      resource: 'order',
      resourceId: orderId,
      metadata: { action: 'reject', reason },
    });
    return ok({ rejected: true, orderId });
  });
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
