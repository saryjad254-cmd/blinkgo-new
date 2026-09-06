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

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { computeEarnings } from '@/lib/services/driver-earnings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeliveryAddress = {
  formatted_address?: string;
  address?: string;
  lat?: number | string;
  lng?: number | string;
  floor?: string;
  door?: string;
};

function isDeliveryAddress(value: unknown): value is DeliveryAddress {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => getActiveOrder() as any,
  )(req)) as unknown as NextResponse;
}

async function getActiveOrder(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['driver', 'admin', 'super_admin', 'manager']);
    if (!user) throw new AuthenticationError();

    // SECURITY: read role from public.users (authoritative) not user_metadata (mutable)
    const supabaseAuth = await createServerClient();
    const { data: profile } = await supabaseAuth
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    const role = profile?.role || 'customer';
    if (role !== 'driver' && role !== 'admin' && role !== 'super_admin' && role !== 'manager') {
      throw new AuthorizationError('Driver or admin only');
    }

    const serviceClient = createServiceClient();
    const driverId = user.id;

    // STEP 1: Check the authoritative dispatch state. User metadata is kept
    // only for audit information and must not decide live availability.
    const { data: userData } = await serviceClient.auth.admin.getUserById(driverId);
    const meta = userData?.user?.user_metadata || {};
    const { data: dispatchStatus, error: dispatchStatusError } = await serviceClient
      .from('driver_status')
      .select('is_online')
      .eq('driver_id', driverId)
      .maybeSingle();
    if (dispatchStatusError) throw new Error(safeErrorMessage(dispatchStatusError));
    const isOnline = Boolean(dispatchStatus?.is_online);
    const onlineChangedBy = meta.online_changed_by || null;

    if (!isOnline) {
      // Driver is OFFLINE - never return any order
      return ok({
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
      .in('status', ['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(safeErrorMessage(error));
    }

    if (!order) {
      return ok({ order: null, driver_online: true });
    }

    const { data: arrivalEvents } = await serviceClient
      .from('order_tracking_events')
      .select('event_type, created_at')
      .eq('order_id', order.id)
      .in('event_type', ['driver_arrived_pickup', 'driver_arrived_dropoff'])
      .order('created_at', { ascending: false });
    const arrivedPickupAt = arrivalEvents?.find((event) => event.event_type === 'driver_arrived_pickup')?.created_at ?? null;
    const arrivedDropoffAt = arrivalEvents?.find((event) => event.event_type === 'driver_arrived_dropoff')?.created_at ?? null;

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
    let deliveryAddress: unknown = order.delivery_address;
    if (typeof deliveryAddress === 'string') {
      try { deliveryAddress = JSON.parse(deliveryAddress); } catch { /* keep string */ }
    }

    const addressString = isDeliveryAddress(deliveryAddress)
      ? (deliveryAddress.formatted_address || deliveryAddress.address || JSON.stringify(deliveryAddress))
      : (typeof deliveryAddress === 'string' ? deliveryAddress : '');

    // Customer lat/lng with multi-fallback:
    // 1. order.customer_latitude/longitude
    // 2. delivery_address.lat/lng (JSON)
    // 3. user_metadata.default_delivery_lat/lng
    let customerLat: number | null = order.customer_latitude ?? null;
    let customerLng: number | null = order.customer_longitude ?? null;
    if (isDeliveryAddress(deliveryAddress)) {
      if (customerLat === null && deliveryAddress.lat !== undefined) customerLat = Number(deliveryAddress.lat);
      if (customerLng === null && deliveryAddress.lng !== undefined) customerLng = Number(deliveryAddress.lng);
    }
    if ((!customerLat || !customerLng) && order.customer_id) {
      const { data: cu } = await serviceClient.auth.admin.getUserById(order.customer_id);
      const cMeta = cu?.user?.user_metadata || {};
      if (customerLat === null && cMeta.default_delivery_lat !== undefined) customerLat = Number(cMeta.default_delivery_lat);
      if (customerLng === null && cMeta.default_delivery_lng !== undefined) customerLng = Number(cMeta.default_delivery_lng);
    }

    const restaurantRelation = Array.isArray(order.restaurants) ? order.restaurants[0] : order.restaurants;
    const restaurantLatitude = restaurantRelation?.latitude || order.restaurant_latitude || null;
    const restaurantLongitude = restaurantRelation?.longitude || order.restaurant_longitude || null;
    const earnings = computeEarnings({
      ...order,
      customer_latitude: customerLat,
      customer_longitude: customerLng,
      restaurant_latitude: restaurantLatitude,
      restaurant_longitude: restaurantLongitude,
    });

    return ok({
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
        delivery_floor: isDeliveryAddress(deliveryAddress) ? deliveryAddress.floor || null : null,
        delivery_door: isDeliveryAddress(deliveryAddress) ? deliveryAddress.door || null : null,
        payment_method: order.payment_method || 'cash',
        payment_status: order.payment_status || 'pending',
        delivery_fee: Number(order.delivery_fee || 0),
        driver_earnings: earnings.total,
        driver_base_earnings: earnings.base,
        priced_distance_km: earnings.distanceKm,
        subtotal: Number(order.subtotal || 0),
        total: Number(order.total || 0),
        tip: Number(order.tip || 0),
        distance_km: Number(order.distance_km || 0),
        restaurant_id: order.restaurant_id,
        restaurant_name: restaurantRelation?.name || 'Restaurant',
        restaurant_phone: restaurantRelation?.phone || null,
        restaurant_address: restaurantRelation?.address || '',
        restaurant_latitude: restaurantLatitude || 0,
        restaurant_longitude: restaurantLongitude || 0,
        driver_latitude: order.driver_latitude || null,
        driver_longitude: order.driver_longitude || null,
        driver_bearing: order.driver_bearing || null,
        driver_speed: order.driver_speed || null,
        accepted_at: order.accepted_at || null,
        prepared_at: order.prepared_at || null,
        picked_up_at: order.picked_up_at || null,
        delivered_at: order.delivered_at || null,
        arrived_pickup_at: arrivedPickupAt,
        arrived_dropoff_at: arrivedDropoffAt,
        created_at: order.created_at,
      },
      driver_online: true,
      online_changed_by: onlineChangedBy,
    });
  });
}
