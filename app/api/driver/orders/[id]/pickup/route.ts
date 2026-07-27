/**
 * Driver Order Pickup
 * ───────────────────
 * POST /api/driver/orders/[id]/pickup
 *
 * Marks the order as 'picked_up' after the driver collects it from the restaurant.
 * Sets picked_up_at timestamp and triggers customer notification.
 *
 * Driver-only. Driver must be the assigned driver for this order.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { AuthorizationError, ConflictError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FROM = ['ready'];

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => pickupOrder(ctx, params.id) as any,
  )(_req)) as unknown as NextResponse;
}

async function pickupOrder(
  ctx: { auth: { user: { id: string; role: string } } },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServiceClient();
    const user = ctx.auth.user;

    // 1) Load order
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error || !order) throw new NotFoundError('Order');

    // 2) Verify driver owns the order
    if (order.driver_id !== user.id && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'manager') {
      throw new AuthorizationError('You are not the assigned driver');
    }

    // 4) Verify state transition is valid
    if (!ALLOWED_FROM.includes(order.status)) {
      throw new ConflictError(
        `Cannot pickup order in status: ${order.status}`,
        { current_status: order.status, code: 'INVALID_TRANSITION' },
      );
    }

    // 5) Atomic update (only if still in 'ready' state)
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({
        status: 'picked_up',
        picked_up_at: now,
        updated_at: now,
      })
      .eq('id', orderId)
      .eq('status', 'ready')
      .select()
      .single();
    if (updErr || !updated) {
      throw new ConflictError('Order state changed — please refresh');
    }

    // 6) Log tracking event
    try {
      await supabase.from('order_tracking_events').insert({
        order_id: orderId,
        driver_id: user.id,
        event_type: 'status_change',
        status: 'picked_up',
      });
    } catch (e) {
      logger.warn('Tracking event insert failed (non-fatal)', { orderId }, e);
    }

    // 7) Notify customer
    try {
      await supabase.from('notifications').insert({
        user_id: order.customer_id,
        type: 'picked_up',
        title: 'Fahrer hat Ihre Bestellung abgeholt',
        body: `Ihre Bestellung #${updated.order_number} ist auf dem Weg zu Ihnen`,
        data: { order_id: orderId, order_number: updated.order_number },
        is_read: false,
      });
    } catch (e) {
      logger.warn('Customer notification failed (non-fatal)', { orderId }, e);
    }

    await audit('DRIVER_PICKED_UP', {
      severity: 'info',
      userId: user.id,
      userRole: user.role,
      resource: 'order',
      resourceId: orderId,
    });

    return ok({ order: updated });
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
