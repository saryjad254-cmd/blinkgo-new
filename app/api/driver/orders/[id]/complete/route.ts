/**
 * Driver Order Delivery Confirmation
 * ───────────────────────────────────
 * POST /api/driver/orders/[id]/complete
 * Body: { delivery_photo?: string (base64 or URL) }
 *
 * Marks the order as 'delivered' when the driver hands it to the customer.
 * Sets delivered_at timestamp, optional delivery_photo for proof of delivery.
 *
 * Side effects:
 *  - Updates order status to 'delivered' + delivered_at
 *  - Frees the driver (driver_status.is_on_delivery = false)
 *  - Triggers loyalty points award (DB trigger)
 *  - Sends customer + restaurant notifications
 *
 * Driver-only. Driver must be the assigned driver for this order.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FROM = ['picked_up', 'delivering'];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Auth
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const supabase = createServiceClient();
    const orderId = params.id;

    // 2) Parse body (optional delivery photo)
    const body = await req.json().catch(() => ({}));
    const deliveryPhoto = typeof body.delivery_photo === 'string'
      ? body.delivery_photo.slice(0, 500_000) // cap at ~500KB
      : null;

    // 3) Load order
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error || !order) throw new NotFoundError('Order');

    // 4) Verify driver owns the order
    if (order.driver_id !== user.id) {
      throw new AuthorizationError('You are not the assigned driver');
    }

    // 5) Verify state transition is valid
    if (!ALLOWED_FROM.includes(order.status)) {
      throw new ConflictError(
        `Cannot complete order in status: ${order.status}`,
        { current_status: order.status, code: 'INVALID_TRANSITION' },
      );
    }

    // 6) Atomic update (only if still in expected state)
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: 'delivered',
      delivered_at: now,
      updated_at: now,
    };
    if (deliveryPhoto) updates.delivery_photo = deliveryPhoto;

    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .in('status', ALLOWED_FROM)
      .select()
      .single();
    if (updErr || !updated) {
      throw new ConflictError('Order state changed — please refresh');
    }

    // 7) Free the driver
    try {
      await supabase
        .from('driver_status')
        .update({
          is_on_delivery: false,
          current_order_id: null,
          updated_at: now,
        })
        .eq('driver_id', user.id)
        .eq('current_order_id', orderId);
    } catch (e) {
      logger.warn('driver_status free-up failed (non-fatal)', { orderId }, e);
    }

    // 8) Log tracking event
    try {
      await supabase.from('order_tracking_events').insert({
        order_id: orderId,
        driver_id: user.id,
        event_type: 'status_change',
        status: 'delivered',
        metadata: { has_photo: !!deliveryPhoto },
      });
    } catch (e) {
      logger.warn('Tracking event insert failed (non-fatal)', { orderId }, e);
    }

    // 9) Notify customer
    try {
      await supabase.from('notifications').insert({
        user_id: order.customer_id,
        type: 'delivered',
        title: 'Bestellung geliefert!',
        body: `Ihre Bestellung #${updated.order_number} wurde geliefert. Guten Appetit!`,
        data: { order_id: orderId, order_number: updated.order_number },
        is_read: false,
      });
    } catch (e) {
      logger.warn('Customer notification failed (non-fatal)', { orderId }, e);
    }

    // 10) Notify restaurant
    try {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('owner_id')
        .eq('id', updated.restaurant_id)
        .single();
      if (restaurant?.owner_id) {
        await supabase.from('notifications').insert({
          user_id: restaurant.owner_id,
          type: 'delivered',
          title: 'Bestellung geliefert',
          body: `Bestellung #${updated.order_number} wurde erfolgreich zugestellt`,
          data: { order_id: orderId, order_number: updated.order_number },
          is_read: false,
        });
      }
    } catch (e) {
      logger.warn('Restaurant notification failed (non-fatal)', { orderId }, e);
    }

    return ok({ order: updated });
  });
}
