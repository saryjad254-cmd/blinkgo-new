/**
 * Order Status Update
 * ───────────────────
 * PATCH /api/orders/status with { order_id, status }
 * Validates transition, updates DB with timestamps, logs tracking event, fires notifications.
 *
 * State machine (see ORDER_ALLOWED_TRANSITIONS in @/lib/services/order-service):
 *   pending → confirmed → preparing → ready → assigned → picked_up → delivering → delivered
 *   Pre-preparation states may transition to cancelled.
 *   picked_up / delivering may transition to could_not_deliver (driver failure path).
 *   delivered / cancelled / could_not_deliver may transition to refunded (admin only).
 *
 * Auth: required. Driver, restaurant, or admin can update.
 *   - Driver: only their own orders, only from picked_up onwards
 *   - Restaurant: only their own restaurant's orders
 *   - Admin: any order, can override transitions
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { notifyOrderEvent, type NotificationType } from '@/lib/notifications';
import { rateLimit } from '@/lib/rate-limit';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { assertCanReadOrder } from '@/lib/api/ownership';
import { ValidationError, AuthorizationError, NotFoundError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { ORDER_ALLOWED_TRANSITIONS } from '@/lib/services/order-service';
import { createPreparationPlan } from '@/lib/restaurant/preparation-policy';
// v82: use the canonical transitions graph from OrderService. The previous
// in-route copy drifted (no delivered→refunded path) which blocked post-
// delivery refund audits.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// v82: include `could_not_deliver` and `refunded` so the driver-failure
// path (v80 BLOCKER fix) and the post-delivery refund path (v82 audit)
// are reachable via this route. Without these the driver could not
// signal a failed pickup, and admins could not record a refund on a
// delivered order. The canonical transition graph still rejects illegal
// transitions (e.g. delivered → pending) via ORDER_ALLOWED_TRANSITIONS.
//
// v83: also include `cancel_refund_pending` so admins can reconcile
// orders stuck in this state (the Stripe refund call failed during
// customer cancel). Admins can either complete the refund manually
// (then transition to 'cancelled' or 'refunded') or fail-and-revert.
const VALID_STATUSES = [
  'pending', 'confirmed', 'preparing', 'ready', 'assigned',
  'picked_up', 'delivering', 'delivered', 'cancelled',
  'could_not_deliver', 'refunded', 'cancel_refund_pending',
] as const;

/**
 * Pick the best translation for a transition error based on Accept-Language.
 */
function localeAwareError(current: string, target: string, acceptLang: string | null): string {
  const lang = (acceptLang || '').toLowerCase();
  const isAr = lang.startsWith('ar');
  const isDe = lang.startsWith('de');
  if (isAr) return `لا يمكن الانتقال من "${current}" إلى "${target}"`;
  if (isDe) return `Übergang von „${current}" zu „${target}" nicht erlaubt`;
  return `Cannot transition from "${current}" to "${target}"`;
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate', ['driver', 'restaurant', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => updateStatus(r as NextRequest, ctx) as any,
  )(req)) as unknown as NextResponse;
}

async function updateStatus(
  req: NextRequest,
  ctx: { auth: { user: { id: string; role: string } } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Auth is provided by withSecurity. Rate limit inline.
    const limited = rateLimit({ limit: 60, windowSec: 15 * 60, name: 'order-status' }, req);
    if (limited) return limited;

    // 2) Parse + validate
    const body = await req.json().catch(() => ({}));
    const { order_id, status, driver_id, metadata } = body;
    if (!order_id || !status) {
      throw new ValidationError('order_id and status required');
    }
    if (!VALID_STATUSES.includes(status)) {
      throw new ValidationError(`Invalid status: ${status}`);
    }

    // 3) Load order
    const supabase = createServiceClient();
    const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
    if (!order) throw new NotFoundError('Order');

    // 4) Role-based authorization
    const role = ctx.auth.user.role;
    const isAdmin = role === 'admin' || role === 'super_admin' || role === 'manager';
    const isDriver = role === 'driver' && order.driver_id === ctx.auth.user.id;
    let isRestaurant = false;
    if (role === 'restaurant') {
      const { data: ownedRestaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('owner_id', ctx.auth.user.id)
        .eq('id', order.restaurant_id)
        .maybeSingle();
      isRestaurant = Boolean(ownedRestaurant && ownedRestaurant.id === order.restaurant_id);
    }

    // F10: customers must NOT use this PATCH to cancel
    if (role === 'customer') {
      throw new AuthorizationError(
        'Customers must use POST /api/orders/[id]/cancel to cancel an order',
      );
    }

    if (!isAdmin && !isDriver && !isRestaurant) {
      throw new AuthorizationError('Forbidden');
    }
    if (isDriver && order.driver_id && order.driver_id !== ctx.auth.user.id) {
      throw new AuthorizationError('Not your order');
    }

    // Drivers never control the restaurant workflow. They can only move their
    // own assigned order through driver-owned delivery transitions. This runs
    // before the idempotent branch so kitchen-owned states remain read-only.
    if (isDriver) {
      const driverTransitions: Record<string, string[]> = {
        ready: ['picked_up'],
        assigned: ['picked_up'],
        picked_up: ['delivering', 'delivered', 'could_not_deliver'],
        delivering: ['delivered', 'could_not_deliver'],
      };
      if (!driverTransitions[order.status]?.includes(status)) {
        throw new AuthorizationError('Drivers cannot update restaurant-owned order states');
      }
    }

    // 5) Idempotent same-status transition: just refresh timestamp + return current order.
    if (order.status === status) {
      const nowSame = new Date().toISOString();
      await supabase.from('orders').update({ updated_at: nowSame }).eq('id', order_id);
      return ok({ order, idempotent: true });
    }

    // 6) Validate transition.
    // We keep the route's own copy of ALLOWED_TRANSITIONS (kept identical to
    // the OrderService's) so route logic stays self-contained. For non-admins
    // enforce; admins can override.
    // v80 BLOCKER fix: picked_up and delivering no longer allow 'cancelled'.
    // Customer-cancel from these states is rejected (driver or admin must
    // transition to 'could_not_deliver' to trigger refund).
    //
    // v82: the canonical transitions graph is now exported by OrderService
    // so this route and any future callers cannot drift.
    const ALLOWED = ORDER_ALLOWED_TRANSITIONS as unknown as Record<string, string[]>;
    const pickupHandover = isRestaurant && order.fulfillment_type === 'pickup' && order.status === 'ready' && status === 'delivered';
    if (!isAdmin && !pickupHandover && !ALLOWED[order.status]?.includes(status)) {
      throw new ConflictError(
        localeAwareError(order.status, status, req.headers.get('accept-language')),
        { meta: { from: order.status, to: status }, code: 'INVALID_TRANSITION' },
      );
    }

    // 7) Build updates
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status, updated_at: now };
    const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata as Record<string, unknown>
      : {};
    const preparationPlan = status === 'confirmed' && (isRestaurant || isAdmin)
      ? createPreparationPlan(now, safeMetadata.estimated_prep_minutes)
      : null;
    const trackingMetadata = preparationPlan
      ? {
          ...safeMetadata,
          estimated_prep_minutes: preparationPlan.estimatedPrepMinutes,
          estimated_ready_at: preparationPlan.estimatedReadyAt,
          preparation_source: 'restaurant',
        }
      : safeMetadata;
    if (driver_id && (isAdmin || isRestaurant)) updates.driver_id = driver_id;
    if (status === 'confirmed' && !order.accepted_at) updates.accepted_at = now;
    if (status === 'preparing' && !order.prepared_at) updates.prepared_at = now;
    if (status === 'ready' && !order.prepared_at) updates.prepared_at = now;
    if (status === 'picked_up' && !order.picked_up_at) updates.picked_up_at = now;
    if (status === 'delivered' && !order.delivered_at) updates.delivered_at = now;
    if (status === 'cancelled' && !order.cancelled_at) updates.cancelled_at = now;

    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', order_id)
      .select()
      .single();
    if (updateErr) {
      logger.error('Order status update failed', { order_id, status }, updateErr);
      return fail(new Error('Failed to update order'));
    }

    // 8) Record the explicit assignment stage. A driver may have been
    // reserved before the kitchen reached `ready`; once it does, delivery
    // orders enter the canonical `assigned` state.
    if (status === 'ready' && updated.fulfillment_type !== 'pickup' && updated.driver_id) {
      const { data: assignedOrder, error: assignStateError } = await supabase
        .from('orders')
        .update({ status: 'assigned', updated_at: new Date().toISOString() })
        .eq('id', order_id)
        .eq('status', 'ready')
        .eq('driver_id', updated.driver_id)
        .select('status')
        .maybeSingle();
      if (assignStateError || !assignedOrder) {
        logger.warn('Pre-assigned order could not enter assigned state', {
          order_id,
          driver_id: updated.driver_id,
          error: assignStateError?.message,
        });
      } else {
        updated.status = 'assigned';
      }
    }

    // 9) AUTO-ASSIGN: When status becomes "ready" and no driver is assigned,
    //    automatically pick the closest available online driver using the
    //    driver_status table (proximity-based + status-aware).
    if (status === 'ready' && updated.fulfillment_type !== 'pickup' && !updated.driver_id) {
      try {
        // Get all online drivers from driver_status
        const { data: onlineDrivers } = await supabase
          .from('driver_status')
          .select('driver_id, latitude, longitude, current_order_id')
          .eq('is_online', true)
          .eq('is_on_delivery', false)
          .is('current_order_id', null);

        if (onlineDrivers && onlineDrivers.length > 0) {
          // If we have restaurant coords, pick the closest driver
          let bestDriverId: string | null = null;
          let bestDistance = Infinity;
          const restLat = updated.restaurant_latitude ?? order.restaurant_latitude;
          const restLng = updated.restaurant_longitude ?? order.restaurant_longitude;

          if (Number.isFinite(restLat) && Number.isFinite(restLng)) {
            for (const d of onlineDrivers) {
              if (!Number.isFinite(d.latitude) || !Number.isFinite(d.longitude)) continue;
              // Haversine distance (km)
              const R = 6371;
              const dLat = ((d.latitude - restLat) * Math.PI) / 180;
              const dLng = ((d.longitude - restLng) * Math.PI) / 180;
              const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos((restLat * Math.PI) / 180) *
                  Math.cos((d.latitude * Math.PI) / 180) *
                  Math.sin(dLng / 2) ** 2;
              const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              if (dist < bestDistance) {
                bestDistance = dist;
                bestDriverId = d.driver_id;
              }
            }
          }
          // Location improves ranking but must never prevent assignment. This
          // also covers new drivers that have not published their first GPS fix.
          bestDriverId ??= onlineDrivers[0].driver_id;

          if (bestDriverId) {
            const { data: assignedOrder, error: assignError } = await supabase
              .from('orders')
              .update({
                driver_id: bestDriverId,
                status: 'assigned',
                updated_at: new Date().toISOString(),
              })
              .eq('id', order_id)
              .eq('status', 'ready')
              .is('driver_id', null)
              .select('id, driver_id, status')
              .maybeSingle();
            if (assignError || !assignedOrder) {
              logger.warn('Auto-assignment lost race or failed', {
                order_id,
                driver_id: bestDriverId,
                error: assignError?.message,
              });
              bestDriverId = null;
            } else {
              updated.driver_id = bestDriverId;
              updated.status = 'assigned';
            }

            // Notify the driver
            if (bestDriverId) try {
              await supabase.from('notifications').insert({
                user_id: bestDriverId,
                type: 'driver',
                title: 'Neue Bestellung',
                body: `Eine neue Bestellung wurde dir zugewiesen (#${updated.order_number})`,
                data: {
                  subtype: 'new_order_assigned',
                  order_id: updated.id,
                  distance_km: bestDistance !== Infinity ? Number(bestDistance.toFixed(2)) : null,
                },
                is_read: false,
              });
            } catch (e) {
              logger.warn('Driver notification failed (non-fatal)', { order_id }, e);
            }

            // Update driver_status to mark them as on a delivery
            if (bestDriverId) try {
              await supabase
                .from('driver_status')
                .update({ is_on_delivery: true, current_order_id: order_id })
                .eq('driver_id', bestDriverId);
            } catch (e) {
              logger.warn('driver_status update failed (non-fatal)', { order_id }, e);
            }
          }
        }
      } catch (e) {
        logger.error('Auto-assign error', { order_id }, e);
      }
    }

    // 9) Log tracking event (best-effort)
    try {
      await supabase.from('order_tracking_events').insert({
        order_id,
        driver_id: updated.driver_id,
        event_type: 'status_change',
        status,
        metadata: trackingMetadata,
      });
    } catch {}

    // 9b) On delivered or cancelled: free up the driver so they can accept new orders
    if ((status === 'delivered' || status === 'cancelled') && updated.driver_id) {
      try {
        await supabase
          .from('driver_status')
          .update({
            is_on_delivery: false,
            current_order_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('driver_id', updated.driver_id)
          .eq('current_order_id', order_id);
      } catch (e) {
        logger.warn('driver_status free-up failed (non-fatal)', { order_id }, e);
      }
    }

    // 10) Send notifications
    const notifMap: Record<string, { type: NotificationType; customer?: string; driver?: string; restaurant?: string }> = {
      confirmed: { type: 'order_accepted', customer: 'Order confirmed', driver: 'New delivery assigned', restaurant: 'New order confirmed' },
      preparing: { type: 'order_accepted', customer: 'Restaurant is preparing your order', restaurant: 'Started preparing' },
      ready: { type: 'order_accepted', customer: 'Order ready for pickup', driver: 'Order ready for pickup' },
      picked_up: { type: 'picked_up', customer: 'Driver picked up your order', driver: 'You picked up the order' },
      delivering: { type: 'nearby', customer: 'Driver is on the way', driver: 'Heading to customer' },
      delivered: { type: 'delivered', customer: 'Order delivered! Enjoy!', driver: 'Delivery complete', restaurant: 'Order delivered' },
      cancelled: { type: 'order_cancelled', customer: 'Order was cancelled', driver: 'Order cancelled', restaurant: 'Order cancelled' },
    };

    const notif = notifMap[status];
    if (notif) {
      try {
        await notifyOrderEvent(
          updated,
          notif.type,
          { customer: notif.customer, driver: notif.driver, restaurant: notif.restaurant },
          { customer: notif.customer, driver: notif.driver, restaurant: notif.restaurant },
        );
      } catch {}
    }

    return ok({ order: updated, preparation_plan: preparationPlan });
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['customer', 'driver', 'restaurant', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => getStatus(r as NextRequest, ctx) as any,
  )(req)) as unknown as NextResponse;
}

async function getStatus(
  req: NextRequest,
  ctx: { auth: { user: { id: string; role: string } } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const orderId = url.searchParams.get('order_id');
    if (!orderId) throw new ValidationError('order_id required');

    // Ownership: only parties to the order may read its status
    await assertCanReadOrder(ctx.auth.user, orderId);

    const supabase = createServiceClient();
    const { data: order, error } = await supabase.from('orders').select('status').eq('id', orderId).single();
    if (error || !order) throw new NotFoundError('Order');

    return ok({ status: order.status });
  });
}
