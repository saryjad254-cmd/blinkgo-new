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
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { normalizeDriverReleaseInput } from '@/lib/driver/rejection-reasons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
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

    const body = await req.json().catch(() => null);
    const release = normalizeDriverReleaseInput(body);
    if (!release) throw new ValidationError('Choose a valid release reason');
    const note = `[driver_release:${release.reason}]${release.details ? ` ${release.details}` : ''}`;

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
    const RELEASEABLE_FROM = ['confirmed', 'preparing', 'ready', 'assigned'];
    if (user.role === 'driver' && !RELEASEABLE_FROM.includes(order.status)) {
      throw new ConflictError(
        `Order can no longer be released in status: ${order.status}. ` +
        `Use the 'could_not_deliver' transition instead.`,
        { current_status: order.status, code: 'TOO_LATE_TO_RELEASE' },
      );
    }
    // Release the order: unassign driver, leave status
    const { data: releasedOrder, error: updateErr } = await svc
      .from('orders')
      .update({
        driver_id: null,
        ...(order.status === 'assigned' ? { status: 'ready' } : {}),
        notes: order.notes
          ? `${order.notes}\n${note}`.slice(0, 1000)
          : note,
      })
      .eq('id', orderId)
      .eq('driver_id', order.driver_id)
      .in('status', RELEASEABLE_FROM)
      .select('id')
      .maybeSingle();
    if (updateErr) {
      logger.error('Driver reject failed', { orderId }, updateErr);
      throw new Error('Failed to reject order');
    }
    if (!releasedOrder) {
      throw new ConflictError('Order changed before it could be released', {
        code: 'RELEASE_RACE',
      });
    }

    const { error: statusError } = await svc
      .from('driver_status')
      .update({
        is_on_delivery: false,
        current_order_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('driver_id', order.driver_id)
      .eq('current_order_id', orderId);
    if (statusError) {
      logger.warn('Driver status cleanup after release failed', {
        orderId,
        driverId: order.driver_id,
        error: statusError.message,
      });
    }
    // Log tracking event
    try {
      await svc.from('order_tracking_events').insert({
        order_id: orderId,
        driver_id: user.id,
        event_type: 'driver_rejected',
        notes: note,
        metadata: {
          reason_code: release.reason,
          details: release.details || null,
        },
      });
    } catch {}
    await audit('DRIVER_RELEASED_ORDER', {
      severity: 'warn',
      userId: user.id,
      userRole: user.role,
      resource: 'order',
      resourceId: orderId,
      metadata: {
        action: 'release',
        reason_code: release.reason,
        details: release.details || null,
      },
    });
    return ok({ rejected: true, orderId, reason: release.reason });
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
