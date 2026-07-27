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
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthorizationError, ConflictError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { withSecurity, HandlerContext } from '@/lib/api/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FROM = ['picked_up', 'delivering'];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // v81 SECURITY: wrapped in withSecurity so the driver role + JWT
    // signature are verified centrally. The inner authorisation check
    // (driver_id === user.id) is preserved.
    const wrapped = withSecurity(
      { roles: ['driver', 'admin', 'super_admin'] },
      async (ctx: HandlerContext) => {
        const supabase = createServiceClient();
        const orderId = params.id;

        // 2) Parse body (optional delivery photo). v81: cap base64
        //    payload at 100KB to avoid abuse (500KB was overly
        //    generous for a proof-of-delivery image).
        const body = await ctx.req.json().catch(() => ({}));
        const deliveryPhoto = typeof body.delivery_photo === 'string'
          ? body.delivery_photo.slice(0, 100_000) // cap at ~100KB
          : null;

        // 3) Load order
        const { data: order, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();
        if (error || !order) throw new NotFoundError('Order');

        // 4) Verify driver owns the order
        if (order.driver_id !== ctx.auth.user.id) {
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
            .eq('driver_id', ctx.auth.user.id)
            .eq('current_order_id', orderId);
        } catch (e) {
          logger.warn('driver_status free-up failed (non-fatal)', { orderId }, e);
        }

        // 8) Log tracking event
        try {
          await supabase.from('order_tracking_events').insert({
            order_id: orderId,
            driver_id: ctx.auth.user.id,
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
      },
    );
    return wrapped(req);
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
