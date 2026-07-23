import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;

  try {
    const svc = createServiceClient();

    // Drivers — pull from driver_status (preferred) plus last_login for fallback
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: users } = await svc
      .from('users')
      .select('id, name, phone, last_login_at')
      .eq('role', 'driver');

    // Get live positions from driver_status (this is the table the GPS broadcaster writes to)
    let driverStatusMap = new Map<string, { lat: number; lng: number; updated_at: string; is_online: boolean; is_on_delivery: boolean; current_order_id: string | null }>();
    try {
      const { data: status } = await svc
        .from('driver_status')
        .select('driver_id, latitude, longitude, updated_at, is_online, is_on_delivery, current_order_id')
        .eq('is_online', true);
      for (const s of status ?? []) {
        if (s.latitude != null && s.longitude != null) {
          driverStatusMap.set(s.driver_id, {
            lat: Number(s.latitude),
            lng: Number(s.longitude),
            updated_at: s.updated_at,
            is_online: !!s.is_online,
            is_on_delivery: !!s.is_on_delivery,
            current_order_id: s.current_order_id ?? null,
          });
        }
      }
    } catch {
      // table might not exist — fall back to users
    }

    const drivers = (users ?? []).map((u: any) => {
      const live = driverStatusMap.get(u.id);
      // Read user_metadata for last_location_* as additional fallback
      // (read separately so missing-column errors don't kill the whole query)
      const lat = live?.lat ?? null;
      const lng = live?.lng ?? null;
      const updatedAt = live?.updated_at ?? u.last_login_at;
      // is_online: ONLY true if the driver has explicitly toggled online
      // via /api/driver/online. last_login_at is not authoritative — a driver
      // can be logged in but offline (e.g. just opened the app to check).
      // Fall back to last_login only if the driver_status record doesn't exist.
      const isOnline = !!live?.is_online;
      return {
        id: u.id,
        name: u.name,
        phone: u.phone,
        last_login_at: u.last_login_at,
        last_location_at: updatedAt,
        is_online: isOnline,
        is_on_delivery: live?.is_on_delivery ?? false,
        current_order_id: live?.current_order_id ?? null,
        latitude: lat,
        longitude: lng,
      };
    });

    // Active orders (with driver assigned) — for the active_delivery markers
    const { data: activeOrders } = await svc
      .from('orders')
      .select('id, order_number, status, customer_lat, customer_lng, customer_latitude, customer_longitude, restaurant_lat, restaurant_lng, restaurant_latitude, restaurant_longitude, customer_address, driver_id, driver_latitude, driver_longitude, driver_bearing, restaurants(name)')
      .in('status', ['confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'on_the_way']);

    // Normalize customer/restaurant lat/lng (backwards compat)
    const normalizedOrders = (activeOrders ?? []).map((o: any) => ({
      ...o,
      customer_lat: o.customer_lat ?? o.customer_latitude,
      customer_lng: o.customer_lng ?? o.customer_longitude,
      restaurant_lat: o.restaurant_lat ?? o.restaurant_latitude,
      restaurant_lng: o.restaurant_lng ?? o.restaurant_longitude,
    }));

    // Active restaurants (we use their main location)
    const { data: restaurants } = await svc
      .from('restaurants')
      .select('id, name, latitude, longitude, is_active')
      .eq('is_active', true);

    return NextResponse.json({
      ok: true,
      drivers: drivers.filter((d) => d.is_online),
      activeOrders: normalizedOrders.filter((o: any) => o.customer_lat && o.customer_lng),
      restaurants: (restaurants ?? []).filter((r: any) => r.latitude && r.longitude),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
