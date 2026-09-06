/**
 * Order Tracking Endpoint
 * ───────────────────────
 * Returns live tracking info for an order.
 * 
 * Auth: Required. Only the order's customer, driver, or admin can view.
 * 
 * Data returned:
 * - orders.driver_latitude/longitude (real-time GPS)
 * - orders.restaurant_latitude/longitude (pickup)
 * - orders.customer_latitude/longitude (delivery)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { calculateDistance, estimateTravelTime } from '@/lib/maps/google-maps';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { assertCanReadOrder } from '@/lib/api/ownership';
import { ok, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createDeliveryPin } from '@/lib/services/delivery-pin';
import { extractPreparationPlan, preparationState, remainingPreparationMinutes } from '@/lib/restaurant/preparation-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const wrapped = withSecurity(
    secureRoute('tracking', ['customer', 'driver', 'restaurant', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => trackOrder(r as NextRequest, ctx) as any,
  );
  return (await wrapped(req)) as unknown as NextResponse;
}

async function trackOrder(
  req: NextRequest,
  ctx: { auth: { user: { id: string; role: string } } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const orderId = req.nextUrl.searchParams.get('order_id');
    if (!orderId) {
      throw new ValidationError('order_id required');
    }

    // Ownership check: throws 404 if not found, 403 if not allowed
    await assertCanReadOrder(ctx.auth.user, orderId);

    const supabase = createServiceClient();

    // Re-fetch with restaurant relation for response shape
    const { data: fullOrder, error: orderErr } = await supabase
      .from('orders')
      .select('*, restaurants(name, address, phone, latitude, longitude)')
      .eq('id', orderId)
      .single();
    if (orderErr || !fullOrder) throw new NotFoundError('Order');
    const isPickup = fullOrder.fulfillment_type === 'pickup';

    // Some deployments do not expose all restaurant columns through the
    // relation select (and local data uses lat/lng instead of latitude/longitude).
    // Fetch the canonical row as a safe fallback so tracking never invents a
    // restaurant position.
    let restaurant = Array.isArray(fullOrder.restaurants) ? fullOrder.restaurants[0] : fullOrder.restaurants;
    if (fullOrder.restaurant_id && (!restaurant || (!restaurant.latitude && !restaurant.lat))) {
      const { data: restaurantRow } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', fullOrder.restaurant_id)
        .maybeSingle();
      if (restaurantRow) restaurant = restaurantRow;
    }

    // Get driver info from auth.users
    let driverInfo: { name?: string; phone?: string | null } = {};
    let driverMetadata: Record<string, unknown> = {};
    if (fullOrder.driver_id) {
      const { data: driverUser } = await supabase.auth.admin.getUserById(fullOrder.driver_id);
      const meta = driverUser?.user?.user_metadata || {};
      driverMetadata = meta;
      driverInfo = {
        name: meta.full_name || meta.name || 'Driver',
        phone: meta.phone || null,
      };
    }

    // Build positions
    const restaurantLat = restaurant?.latitude ?? restaurant?.lat;
    const restaurantLng = restaurant?.longitude ?? restaurant?.lng;
    const restLoc = fullOrder.restaurant_latitude && fullOrder.restaurant_longitude
      ? { lat: fullOrder.restaurant_latitude, lng: fullOrder.restaurant_longitude }
      : (restaurantLat && restaurantLng
        ? { lat: Number(restaurantLat), lng: Number(restaurantLng) }
        : null);

    let customerLoc = null;
    if (!isPickup && fullOrder.customer_latitude && fullOrder.customer_longitude) {
      customerLoc = { lat: fullOrder.customer_latitude, lng: fullOrder.customer_longitude };
    } else if (!isPickup && typeof fullOrder.delivery_address === 'object' && fullOrder.delivery_address?.lat && fullOrder.delivery_address?.lng) {
      customerLoc = { lat: fullOrder.delivery_address.lat, lng: fullOrder.delivery_address.lng };
    } else if (!isPickup && fullOrder.customer_id) {
      const { data: custUser } = await supabase.auth.admin.getUserById(fullOrder.customer_id);
      const meta = custUser?.user?.user_metadata || {};
      if (meta.default_delivery_lat && meta.default_delivery_lng) {
        customerLoc = { lat: meta.default_delivery_lat, lng: meta.default_delivery_lng };
      }
    }

    let driverLoc = null;
    if (fullOrder.driver_latitude && fullOrder.driver_longitude) {
      driverLoc = { lat: fullOrder.driver_latitude, lng: fullOrder.driver_longitude };
    } else if (fullOrder.driver_id) {
      if (driverMetadata.last_location_lat && driverMetadata.last_location_lng) {
        driverLoc = { lat: Number(driverMetadata.last_location_lat), lng: Number(driverMetadata.last_location_lng) };
      }
    }

    // Calculate distances
    let driverToCustomer: number | null = null;
    let driverToPickup: number | null = null;
    let etaMinutes: number | null = null;
    let restaurantToCustomer: number | null = null;

    if (driverLoc && customerLoc) {
      driverToCustomer = calculateDistance(driverLoc.lat, driverLoc.lng, customerLoc.lat, customerLoc.lng);
    }

    if (driverLoc && restLoc) {
      driverToPickup = calculateDistance(driverLoc.lat, driverLoc.lng, restLoc.lat, restLoc.lng);
    }

    if (restLoc && customerLoc) {
      restaurantToCustomer = calculateDistance(restLoc.lat, restLoc.lng, customerLoc.lat, customerLoc.lng);
    }

    // One bounded read supplies the public timeline and the derived journey
    // state. The previous implementation made three separate PostgREST calls
    // on every polling request, which added avoidable latency to live tracking.
    const { data: trackingEvents } = await supabase
      .from('order_tracking_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(100);
    const events = trackingEvents?.slice(0, 10) ?? [];
    const journeyEvents = trackingEvents?.filter((event) =>
      ['driver_arrived_pickup', 'driver_arrived_dropoff', 'driver_issue_reported'].includes(event.event_type),
    ) ?? [];
    const preparationEvents = trackingEvents?.filter((event) => event.event_type === 'status_change').slice(0, 20) ?? [];
    const pickupArrival = journeyEvents?.find((event) => event.event_type === 'driver_arrived_pickup') ?? null;
    const dropoffArrival = journeyEvents?.find((event) => event.event_type === 'driver_arrived_dropoff') ?? null;
    const latestIssueEvent = journeyEvents?.find((event) => event.event_type === 'driver_issue_reported') ?? null;
    const issueMetadata = latestIssueEvent?.metadata && typeof latestIssueEvent.metadata === 'object'
      ? latestIssueEvent.metadata as Record<string, unknown>
      : {};
    const latestIssueCode = typeof issueMetadata.code === 'string' ? issueMetadata.code : null;
    const preparationPlan = extractPreparationPlan(preparationEvents);
    const remainingPrepMinutes = remainingPreparationMinutes(preparationPlan?.estimatedReadyAt);
    const restaurantEtaMinutes = parseEtaMinutes(restaurant?.estimated_delivery_time ?? restaurant?.delivery_time_min);
    const status = String(fullOrder.status || 'pending');
    const pickupTravelMinutes = driverToPickup === null ? null : estimateTravelTime(driverToPickup);
    const deliveryTravelMinutes = restaurantToCustomer === null ? null : estimateTravelTime(restaurantToCustomer);
    const routeMinutes = pickupTravelMinutes !== null && deliveryTravelMinutes !== null ? pickupTravelMinutes + deliveryTravelMinutes : null;
    let etaSource: 'live_route' | 'restaurant_live' | 'restaurant_estimate' | 'unavailable' = 'unavailable';
    if (isPickup && ['picked_up', 'delivered'].includes(status)) {
      etaMinutes = 0;
      etaSource = 'live_route';
    } else if (isPickup && remainingPrepMinutes !== null) {
      etaMinutes = remainingPrepMinutes;
      etaSource = 'restaurant_live';
    } else if (status === 'delivered' || dropoffArrival) {
      etaMinutes = 0;
      etaSource = 'live_route';
    } else if (['picked_up', 'delivering', 'on_the_way'].includes(status) && driverToCustomer !== null) {
      etaMinutes = estimateTravelTime(driverToCustomer);
      etaSource = 'live_route';
    } else if (deliveryTravelMinutes !== null && ['confirmed', 'preparing'].includes(status) && remainingPrepMinutes !== null) {
      etaMinutes = Math.max(remainingPrepMinutes, pickupTravelMinutes ?? 0) + deliveryTravelMinutes;
      etaSource = 'restaurant_live';
    } else if (routeMinutes !== null) {
      etaMinutes = ['confirmed', 'preparing'].includes(status) && restaurantEtaMinutes !== null
        ? Math.max(routeMinutes, restaurantEtaMinutes)
        : routeMinutes;
      etaSource = 'live_route';
    } else if (restaurantEtaMinutes !== null) {
      etaMinutes = restaurantEtaMinutes;
      etaSource = 'restaurant_estimate';
    }
    const canViewDeliveryPin = ['customer', 'admin', 'super_admin', 'manager'].includes(ctx.auth.user.role)
      && Boolean(fullOrder.customer_id && fullOrder.created_at)
      && ['picked_up', 'delivering'].includes(fullOrder.status);

    return ok({
      order: {
        id: fullOrder.id,
        order_number: fullOrder.order_number,
        restaurant_name: restaurant?.name ?? null,
        restaurant_phone: restaurant?.phone ?? null,
        restaurant_eta_minutes: restaurantEtaMinutes,
        status: fullOrder.status,
        fulfillment_type: isPickup ? 'pickup' : 'delivery',
        pickup_code: isPickup ? fullOrder.pickup_code ?? null : null,
        restaurant_address: restaurant?.address ?? null,
        delivery_address: fullOrder.delivery_address,
        customer_id: fullOrder.customer_id,
        driver_id: fullOrder.driver_id,
        created_at: fullOrder.created_at,
        delivered_at: fullOrder.delivered_at,
        cancelled_at: fullOrder.cancelled_at,
      },
      positions: {
        restaurant: restLoc ? { ...restLoc, name: restaurant?.name, type: 'restaurant' } : null,
        customer: customerLoc ? { ...customerLoc, type: 'customer' } : null,
        driver: driverLoc ? {
          ...driverLoc,
          name: driverInfo.name,
          phone: driverInfo.phone,
          updated_at: fullOrder.last_location_update,
          type: 'driver',
        } : null,
      },
      distances: {
        driver_to_customer: driverToCustomer,
        driver_to_pickup: driverToPickup,
        restaurant_to_customer: restaurantToCustomer,
        eta_minutes: etaMinutes,
      },
      events,
      journey: {
        arrived_pickup_at: pickupArrival?.created_at ?? null,
        arrived_dropoff_at: dropoffArrival?.created_at ?? null,
        driver_stage: dropoffArrival ? 'at_dropoff' : pickupArrival ? 'at_pickup' : ['picked_up', 'delivering'].includes(fullOrder.status) ? 'to_dropoff' : fullOrder.driver_id ? 'to_pickup' : 'unassigned',
        delivery_pin: canViewDeliveryPin ? createDeliveryPin({ orderId, customerId: fullOrder.customer_id, createdAt: fullOrder.created_at }) : null,
        eta: {
          minutes: etaMinutes,
          source: etaSource,
          delayed: ['restaurant_delay', 'order_not_ready'].includes(latestIssueCode ?? ''),
          updated_at: latestIssueEvent?.created_at ?? fullOrder.last_location_update ?? fullOrder.updated_at ?? fullOrder.created_at,
        },
        preparation: preparationPlan ? {
          estimated_prep_minutes: preparationPlan.estimatedPrepMinutes,
          estimated_ready_at: preparationPlan.estimatedReadyAt,
          remaining_minutes: remainingPrepMinutes,
          state: preparationState(status, preparationPlan.estimatedReadyAt),
        } : null,
        latest_issue: latestIssueCode ? { code: latestIssueCode, reported_at: latestIssueEvent?.created_at ?? null } : null,
      },
    });
  });
}

function parseEtaMinutes(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 && value <= 180 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const values = value.match(/\d+/g)?.map(Number).filter((item) => item > 0 && item <= 180) ?? [];
  return values.length ? Math.max(...values) : null;
}
