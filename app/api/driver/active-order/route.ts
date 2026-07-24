/**
 * Driver Active Order
 * 
 * Returns the current active order for the driver (if any).
 * 
 * CRITICAL: This endpoint ONLY returns the order if the driver is currently ONLINE.
 * If the driver is offline, it returns null regardless of whether there's an order in the DB.
 * 
 * This is enforced at the server level to prevent any caching or stale state issues.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: read role from public.users (authoritative) not user_metadata (mutable)
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    const role = profile?.role || 'customer';
    if (role !== 'driver' && role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const serviceClient = createServiceClient();
    const driverId = user.id;

    // STEP 1: Check if driver is online
    const { data: userData } = await serviceClient.auth.admin.getUserById(driverId);
    const meta = userData?.user?.user_metadata || {};
    const isOnline = !!meta.is_online;
    const onlineChangedBy = meta.online_changed_by || null;

    if (!isOnline) {
      // Driver is OFFLINE - never return any order
      return NextResponse.json({
        ok: true,
        order: null,
        driver_online: false,
        online_changed_by: onlineChangedBy,
      });
    }

    // STEP 2: Driver is online, fetch active order
    const { data: order, error } = await serviceClient
      .from('orders')
      .select('*, restaurants(name, address, phone, latitude, longitude)')
      .eq('driver_id', driverId)
      .in('status', ['confirmed', 'preparing', 'ready', 'picked_up', 'delivering'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[active-order] db error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ ok: true, order: null, driver_online: true });
    }

    // Fetch customer info
    let customerName = 'Customer';
    let customerPhone: string | null = null;
    if (order.customer_id) {
      const { data: cu } = await serviceClient.auth.admin.getUserById(order.customer_id);
      const cMeta = cu?.user?.user_metadata || {};
      customerName = cMeta.full_name || cMeta.name || cu?.user?.email?.split('@')[0] || 'Customer';
      customerPhone = cMeta.phone || cu?.user?.phone || null;
    }

    // Parse delivery_address
    let deliveryAddress: any = order.delivery_address;
    if (typeof deliveryAddress === 'string') {
      try { deliveryAddress = JSON.parse(deliveryAddress); } catch { /* keep string */ }
    }

    const addressString = typeof deliveryAddress === 'object' && deliveryAddress !== null
      ? (deliveryAddress.formatted_address || deliveryAddress.address || JSON.stringify(deliveryAddress))
      : (deliveryAddress || '');

    // Customer lat/lng with multi-fallback:
    // 1. order.customer_latitude/longitude
    // 2. delivery_address.lat/lng (JSON)
    // 3. user_metadata.default_delivery_lat/lng
    let customerLat: number | null = order.customer_latitude ?? null;
    let customerLng: number | null = order.customer_longitude ?? null;
    if (typeof deliveryAddress === 'object' && deliveryAddress) {
      if (!customerLat && deliveryAddress.lat) customerLat = Number(deliveryAddress.lat);
      if (!customerLng && deliveryAddress.lng) customerLng = Number(deliveryAddress.lng);
    }
    if ((!customerLat || !customerLng) && order.customer_id) {
      const { data: cu } = await serviceClient.auth.admin.getUserById(order.customer_id);
      const cMeta = cu?.user?.user_metadata || {};
      if (!customerLat && cMeta.default_delivery_lat) customerLat = Number(cMeta.default_delivery_lat);
      if (!customerLng && cMeta.default_delivery_lng) customerLng = Number(cMeta.default_delivery_lng);
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        customer_id: order.customer_id,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_latitude: customerLat,
        customer_longitude: customerLng,
        delivery_address: addressString,
        delivery_instructions: order.delivery_instructions || null,
        delivery_floor: (typeof deliveryAddress === 'object' && deliveryAddress?.floor) || null,
        delivery_door: (typeof deliveryAddress === 'object' && deliveryAddress?.door) || null,
        payment_method: order.payment_method || 'cash',
        payment_status: order.payment_status || 'pending',
        delivery_fee: Number(order.delivery_fee || 0),
        driver_earnings: Number(order.delivery_fee || 0) + Number(order.tip || 0),
        subtotal: Number(order.subtotal || 0),
        total: Number(order.total || 0),
        tip: Number(order.tip || 0),
        distance_km: Number(order.distance_km || 0),
        restaurant_id: order.restaurant_id,
        restaurant_name: order.restaurants?.name || 'Restaurant',
        restaurant_phone: order.restaurants?.phone || null,
        restaurant_address: order.restaurants?.address || '',
        restaurant_latitude: order.restaurants?.latitude || order.restaurant_latitude || 0,
        restaurant_longitude: order.restaurants?.longitude || order.restaurant_longitude || 0,
        driver_latitude: order.driver_latitude || null,
        driver_longitude: order.driver_longitude || null,
        driver_bearing: order.driver_bearing || null,
        driver_speed: order.driver_speed || null,
        accepted_at: order.accepted_at || null,
        prepared_at: order.prepared_at || null,
        picked_up_at: order.picked_up_at || null,
        delivered_at: order.delivered_at || null,
        created_at: order.created_at,
      },
      driver_online: true,
      online_changed_by: onlineChangedBy,
    });
  } catch (err: any) {
    console.error('[active-order] error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
