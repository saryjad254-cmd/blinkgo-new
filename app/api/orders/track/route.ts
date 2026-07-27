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
import { createServerClient } from '@/lib/supabase/server';
import { calculateDistance, estimateTravelTime } from '@/lib/maps/google-maps';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { assertCanReadOrder } from '@/lib/api/ownership';
import { fail, ok, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError, AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const wrapped = withSecurity(
    secureRoute('lenient', ['customer', 'driver', 'restaurant', 'admin', 'super_admin', 'manager']),
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
    const order = await assertCanReadOrder(ctx.auth.user, orderId) as any;

    const supabase = createServiceClient();

    // Re-fetch with restaurant relation for response shape
    const { data: fullOrder, error: orderErr } = await supabase
      .from('orders')
      .select('*, restaurants(name, address, phone, latitude, longitude)')
      .eq('id', orderId)
      .single();
    if (orderErr || !fullOrder) throw new NotFoundError('Order');

    // Get driver info from auth.users
    let driverInfo: { name?: string; phone?: string } = {};
    if (fullOrder.driver_id) {
      const { data: driverUser } = await supabase.auth.admin.getUserById(fullOrder.driver_id);
      const meta = driverUser?.user?.user_metadata || {};
      driverInfo = {
        name: meta.full_name || meta.name || 'Driver',
        phone: meta.phone || null,
      };
    }

    // Build positions
    const restLoc = fullOrder.restaurant_latitude && fullOrder.restaurant_longitude
      ? { lat: fullOrder.restaurant_latitude, lng: fullOrder.restaurant_longitude }
      : (fullOrder.restaurants?.latitude && fullOrder.restaurants?.longitude
        ? { lat: fullOrder.restaurants.latitude, lng: fullOrder.restaurants.longitude }
        : null);

    let customerLoc = null;
    if (fullOrder.customer_latitude && fullOrder.customer_longitude) {
      customerLoc = { lat: fullOrder.customer_latitude, lng: fullOrder.customer_longitude };
    } else if (typeof fullOrder.delivery_address === 'object' && fullOrder.delivery_address?.lat && fullOrder.delivery_address?.lng) {
      customerLoc = { lat: fullOrder.delivery_address.lat, lng: fullOrder.delivery_address.lng };
    } else if (fullOrder.customer_id) {
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
      const { data: driverUser } = await supabase.auth.admin.getUserById(fullOrder.driver_id);
      const meta = driverUser?.user?.user_metadata || {};
      if (meta.last_location_lat && meta.last_location_lng) {
        driverLoc = { lat: meta.last_location_lat, lng: meta.last_location_lng };
      }
    }

    // Calculate distances
    let driverToCustomer: number | null = null;
    let driverToPickup: number | null = null;
    let etaMinutes: number | null = null;

    if (driverLoc && customerLoc) {
      driverToCustomer = calculateDistance(driverLoc.lat, driverLoc.lng, customerLoc.lat, customerLoc.lng);
      etaMinutes = estimateTravelTime(driverToCustomer);
    }

    if (driverLoc && restLoc) {
      driverToPickup = calculateDistance(driverLoc.lat, driverLoc.lng, restLoc.lat, restLoc.lng);
    }

    // Get latest tracking events
    const { data: events } = await supabase
      .from('order_tracking_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(10);

    return ok({
      order: {
        id: fullOrder.id,
        order_number: fullOrder.order_number,
        status: fullOrder.status,
        delivery_address: fullOrder.delivery_address,
        customer_id: fullOrder.customer_id,
        driver_id: fullOrder.driver_id,
        created_at: fullOrder.created_at,
        delivered_at: fullOrder.delivered_at,
        cancelled_at: fullOrder.cancelled_at,
      },
      positions: {
        restaurant: restLoc ? { ...restLoc, name: fullOrder.restaurants?.name, type: 'restaurant' } : null,
        customer: customerLoc ? { ...customerLoc, name: driverInfo.name, type: 'customer' } : null,
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
        eta_minutes: etaMinutes,
      },
      events: events || [],
    });
  });
}
