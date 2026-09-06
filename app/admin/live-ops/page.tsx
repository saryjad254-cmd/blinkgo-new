/**
 * Admin live operations dashboard.
 *
 * Reads canonical staging/production tables directly from the Server Component.
 * This avoids an internal HTTP waterfall and keeps service-role access server-only.
 */

import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { LiveOpsConsole } from './LiveOpsConsole';

export const revalidate = 10;
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'assigned',
  'picked_up',
  'delivering',
] as const;

function minutesUntil(value: string | null): number {
  if (!value) return 0;
  const delta = new Date(value).getTime() - Date.now();
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 60_000)) : 0;
}

function districtFromAddress(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const address = value as Record<string, unknown>;
  const candidate = address.district ?? address.city ?? address.postal_code ?? address.zip;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

async function fetchLiveOpsData() {
  const supabase = createServiceClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const fifteenMinAgo = new Date(Date.now() - 15 * 60_000);

  const [activeRes, statusesRes, todayRes, recentRes, ordersRes, restaurantsRes, usersRes, yesterdayRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id,status,total,customer_id,restaurant_id,driver_id,created_at,delivery_address,estimated_delivery')
      .in('status', [...ACTIVE_STATUSES])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('driver_status')
      .select('driver_id,is_online,is_on_delivery,current_order_id,latitude,longitude,current_lat,current_lng'),
    supabase
      .from('orders')
      .select('id,total,status,created_at')
      .gte('created_at', todayStart.toISOString()),
    supabase
      .from('orders')
      .select('id,status')
      .gte('created_at', fifteenMinAgo.toISOString())
      .in('status', [...ACTIVE_STATUSES]),
    supabase
      .from('orders')
      .select('id,order_number,status,total,created_at,estimated_delivery,delivery_address,restaurant_id,driver_id')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('restaurants')
      .select('id,name,address,city,latitude,longitude,is_active')
      .eq('is_active', true)
      .limit(50),
    supabase
      .from('users')
      .select('id,name')
      .eq('role', 'driver'),
    supabase
      .from('orders')
      .select('total')
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayStart.toISOString()),
  ]);

  const activeOrders = activeRes.data ?? [];
  const driverStatuses = statusesRes.data ?? [];
  const todayOrders = todayRes.data ?? [];
  const recentActiveOrders = recentRes.data ?? [];
  const orders = ordersRes.data ?? [];
  const restaurants = restaurantsRes.data ?? [];
  const driverUsers = usersRes.data ?? [];
  const yesterdayOrders = yesterdayRes.data ?? [];

  const restaurantsById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
  const driversById = new Map(driverUsers.map((driver) => [driver.id, driver]));
  const driversOnline = driverStatuses.filter((driver) => driver.is_online);
  const totalRevenue = todayOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const yesterdayRevenue = yesterdayOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const etaValues = activeOrders.map((order) => minutesUntil(order.estimated_delivery)).filter((eta) => eta > 0);
  const avgEta = etaValues.length
    ? Math.round(etaValues.reduce((sum, eta) => sum + eta, 0) / etaValues.length)
    : 0;

  const liveFeed = orders.slice(0, 10).map((order) => {
    const restaurant = restaurantsById.get(order.restaurant_id);
    const driver = order.driver_id ? driversById.get(order.driver_id) : undefined;
    return {
      id: order.id,
      orderNumber: order.order_number || `#${order.id.slice(0, 6)}`,
      status: order.status || 'pending',
      total: Number(order.total) || 0,
      etaMinutes: minutesUntil(order.estimated_delivery),
      restaurantName: restaurant?.name,
      district: restaurant?.city || districtFromAddress(order.delivery_address),
      driverName: driver?.name || undefined,
      driverId: order.driver_id || undefined,
    };
  });

  const driverMarkers = driversOnline
    .map((driver) => ({
      id: driver.driver_id,
      name: driversById.get(driver.driver_id)?.name || 'Driver',
      lat: Number(driver.latitude ?? driver.current_lat),
      lng: Number(driver.longitude ?? driver.current_lng),
    }))
    .filter((driver) => Number.isFinite(driver.lat) && Number.isFinite(driver.lng));

  const restaurantMarkers = restaurants
    .map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      lat: Number(restaurant.latitude),
      lng: Number(restaurant.longitude),
    }))
    .filter((restaurant) => Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng));

  return {
    kpis: {
      activeOrders: activeOrders.length,
      activeDelta: activeOrders.length - recentActiveOrders.length,
      driversOnline: driversOnline.length,
      driverDelta: 0,
      avgEta,
      avgEtaDelta: 0,
      revenueToday: totalRevenue,
      revenueDelta: yesterdayRevenue > 0
        ? Math.round(((totalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
        : 0,
    },
    liveFeed,
    driverMarkers,
    restaurantMarkers,
  };
}

export default async function LiveOpsPage() {
  const user = await requireRole(['admin', 'super_admin', 'manager']);
  const data = await fetchLiveOpsData();

  return (
    <LiveOpsConsole
      kpis={data.kpis}
      liveFeed={data.liveFeed}
      driverMarkers={data.driverMarkers}
      restaurantMarkers={data.restaurantMarkers}
      userName={user.name || user.email?.split('@')[0] || 'Admin'}
      userAvatar={null}
      canViewPaymentOperations={user.role === 'super_admin' || user.permissions.includes('payment_support')}
    />
  );
}
