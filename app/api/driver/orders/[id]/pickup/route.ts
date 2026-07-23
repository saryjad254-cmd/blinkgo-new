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
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FROM = ['ready'];

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Auth
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const supabase = createServiceClient();
    const orderId = params.id;

    // 2) Load order
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error || !order) throw new NotFoundError('Order');

    // 3) Verify driver owns the order
    if (order.driver_id !== user.id) {
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

    return ok({ order: updated });
  });
}
