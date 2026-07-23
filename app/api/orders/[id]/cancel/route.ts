/**
 * Customer Order Cancellation
 * ───────────────────────────
 * POST /api/orders/[id]/cancel
 * Body: { reason?: string }
 *
 * Customer-only. Cancels an order that is in 'pending' or 'confirmed' state.
 * After 'preparing' has started, customers must contact the restaurant.
 *
 * Side effects:
 *  - Updates order status to 'cancelled' + sets cancelled_at + cancellation_reason
 *  - Frees up the driver (if assigned)
 *  - Sends notifications to driver (if assigned) and restaurant
 *  - Refunds loyalty points if redeemed
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FROM_STATES = ['pending', 'confirmed'];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Auth
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    // 2) Parse optional reason
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

    const supabase = createServiceClient();
    const orderId = params.id;

    // 3) Load the order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (orderErr || !order) throw new NotFoundError('Order');

    // 4) Authorization: only the order's customer
    if (order.customer_id !== user.id) {
      throw new AuthorizationError('You can only cancel your own orders');
    }

    // 5) State check
    if (!ALLOWED_FROM_STATES.includes(order.status)) {
      throw new ConflictError(
        `Order can no longer be cancelled (current status: ${order.status})`,
        { current_status: order.status, allowed_from: ALLOWED_FROM_STATES, code: 'CANCEL_TOO_LATE' },
      );
    }

    // 6) Cancel atomically (only if still in allowed state — prevents double cancel)
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        updated_at: now,
        cancellation_reason: reason,
      })
      .eq('id', orderId)
      .in('status', ALLOWED_FROM_STATES)
      .select()
      .single();
    if (updErr || !updated) {
      throw new ConflictError('Order state changed — please refresh');
    }

    // 7) Free the driver
    if (updated.driver_id) {
      try {
        await supabase
          .from('driver_status')
          .update({
            is_on_delivery: false,
            current_order_id: null,
            updated_at: now,
          })
          .eq('driver_id', updated.driver_id)
          .eq('current_order_id', orderId);
      } catch (e) {
        logger.warn('driver_status free-up failed (non-fatal)', { orderId }, e);
      }
    }

    // 8) Notify the restaurant
    try {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('owner_id, name')
        .eq('id', updated.restaurant_id)
        .single();
      if (restaurant?.owner_id) {
        await supabase.from('notifications').insert({
          user_id: restaurant.owner_id,
          type: 'order_cancelled',
          title: 'Bestellung storniert',
          body: `Bestellung #${updated.order_number} wurde vom Kunden storniert${reason ? ` (Grund: ${reason})` : ''}`,
          data: { order_id: orderId, order_number: updated.order_number, reason },
          is_read: false,
        });
      }
    } catch (e) {
      logger.warn('Restaurant notification failed (non-fatal)', { orderId }, e);
    }

    // 9) Notify the driver (if assigned)
    if (updated.driver_id) {
      try {
        await supabase.from('notifications').insert({
          user_id: updated.driver_id,
          type: 'order_cancelled',
          title: 'Bestellung storniert',
          body: `Bestellung #${updated.order_number} wurde storniert`,
          data: { order_id: orderId, order_number: updated.order_number },
          is_read: false,
        });
      } catch (e) {
        logger.warn('Driver notification failed (non-fatal)', { orderId }, e);
      }
    }

    // 10) Refund loyalty points if redeemed
    if (updated.points_redeemed && updated.points_redeemed > 0) {
      try {
        await supabase.rpc('award_loyalty_points', {
          p_user_id: order.customer_id,
          p_points: updated.points_redeemed,
          p_reason: 'Refund: order cancelled',
          p_order_id: orderId,
        });
      } catch (e) {
        logger.warn('Loyalty refund failed (non-fatal)', { orderId }, e);
      }
    }

    return ok({
      order: updated,
      refunded_points: updated.points_redeemed ?? 0,
    });
  });
}
