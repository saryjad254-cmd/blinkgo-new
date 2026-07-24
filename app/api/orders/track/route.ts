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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('order_id');
    if (!orderId) {
      return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 });
    }

    // Authenticate the user
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Fetch order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, restaurants(name, address, phone, latitude, longitude)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
    }

    // Authorization: only the customer who placed the order, the assigned driver, or an admin
    // SECURITY: Role is read from public.users (NEVER from user_metadata which is user-controllable).
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    const role = profile?.role;
    const isCustomer = order.customer_id === user.id;
    const isDriver = order.driver_id === user.id;
    const isAdmin = role === 'admin' || role === 'super_admin' || role === 'manager';

    if (!isCustomer && !isDriver && !isAdmin) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // Get driver info from auth.users
    let driverInfo: { name?: string; phone?: string } = {};
    if (order.driver_id) {
      const { data: driverUser } = await supabase.auth.admin.getUserById(order.driver_id);
      const meta = driverUser?.user?.user_metadata || {};
      driverInfo = {
        name: meta.full_name || meta.name || 'Driver',
        phone: meta.phone || null,
      };
    }

    // Build positions
    const restLoc = order.restaurant_latitude && order.restaurant_longitude
      ? { lat: order.restaurant_latitude, lng: order.restaurant_longitude }
      : (order.restaurants?.latitude && order.restaurants?.longitude
        ? { lat: order.restaurants.latitude, lng: order.restaurants.longitude }
        : null);

    let customerLoc = null;
    if (order.customer_latitude && order.customer_longitude) {
      customerLoc = { lat: order.customer_latitude, lng: order.customer_longitude };
    } else if (typeof order.delivery_address === 'object' && order.delivery_address?.lat && order.delivery_address?.lng) {
      customerLoc = { lat: order.delivery_address.lat, lng: order.delivery_address.lng };
    } else if (order.customer_id) {
      const { data: custUser } = await supabase.auth.admin.getUserById(order.customer_id);
      const meta = custUser?.user?.user_metadata || {};
      if (meta.default_delivery_lat && meta.default_delivery_lng) {
        customerLoc = { lat: meta.default_delivery_lat, lng: meta.default_delivery_lng };
      }
    }

    let driverLoc = null;
    if (order.driver_latitude && order.driver_longitude) {
      driverLoc = { lat: order.driver_latitude, lng: order.driver_longitude };
    } else if (order.driver_id) {
      const { data: driverUser } = await supabase.auth.admin.getUserById(order.driver_id);
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

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        delivery_address: order.delivery_address,
        customer_id: order.customer_id,
        driver_id: order.driver_id,
        created_at: order.created_at,
        delivered_at: order.delivered_at,
        cancelled_at: order.cancelled_at,
      },
      positions: {
        restaurant: restLoc ? { ...restLoc, name: order.restaurants?.name, type: 'restaurant' } : null,
        customer: customerLoc ? { ...customerLoc, name: driverInfo.name, type: 'customer' } : null,
        driver: driverLoc ? {
          ...driverLoc,
          name: driverInfo.name,
          phone: driverInfo.phone,
          updated_at: order.last_location_update,
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
  } catch (err: any) {
    console.error('[track] error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
