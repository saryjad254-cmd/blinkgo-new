import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { OperationsConsoleV2, type DriverStatus, type Incident, type RestaurantStatus } from '@/components/admin/OperationsConsoleV2';

export const revalidate = 10; // Live data, refresh every 10s
export const dynamic = 'force-dynamic';

async function getOpsData() {
  const supabase = await createServerClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  // Run all queries in parallel
  const [activeRes, driversRes, restaurantsRes, todayRes, yesterdayRes, pendingRes, incidentsRes, prepRes] = await Promise.all([
    supabase.from('orders').select('id, status', { count: 'exact' }).in('status', ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up']),
    supabase.from('drivers').select('id, user_id, full_name, rating, is_active, is_online, is_available, last_seen_at, total_deliveries, users(name)'),
    supabase.from('restaurants').select('id, name, is_active, is_online, is_paused, busy_mode, busy_mode_until, rating, avg_prep_minutes'),
    supabase.from('orders').select('id, total, status, restaurant_id, driver_id').gte('created_at', todayStart.toISOString()),
    supabase.from('orders').select('id, total, status').gte('created_at', yesterdayStart.toISOString()).lt('created_at', todayStart.toISOString()),
    supabase.from('orders').select('id, created_at').in('status', ['pending']).lt('created_at', new Date(Date.now() - 60_000).toISOString()),
    supabase.from('security_audit_log').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('orders').select('accepted_at, prepared_at').eq('status', 'ready').gte('prepared_at', todayStart.toISOString()).limit(100),
  ]);

  // Calculate KPIs
  const activeOrders = activeRes.data?.length ?? 0;
  const pendingAcceptance = pendingRes.data?.length ?? 0;
  const todayOrders = todayRes.data ?? [];
  const yesterdayOrders = yesterdayRes.data ?? [];
  const totalRevenueToday = todayOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const totalOrdersToday = todayOrders.length;
  const totalRevenueYesterday = yesterdayOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const totalOrdersYesterday = yesterdayOrders.length;
  const cancelRateToday = todayOrders.length > 0
    ? (todayOrders.filter((o) => o.status === 'cancelled').length / todayOrders.length) * 100
    : 0;
  const avgPrepMin = (() => {
    const data = prepRes.data ?? [];
    if (data.length === 0) return 0;
    const durations = data
      .filter((o) => o.accepted_at && o.prepared_at)
      .map((o) => (new Date(o.prepared_at).getTime() - new Date(o.accepted_at).getTime()) / 60_000);
    if (durations.length === 0) return 0;
    return Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
  })();
  const driverActiveOrder = new Map<string, string>();
  const driverDeliveriesToday = new Map<string, number>();
  const restaurantToday = new Map<string, { orders: number; pending: number; revenue: number }>();
  for (const order of todayOrders) {
    if (order.driver_id) {
      if (['assigned', 'picked_up', 'delivering'].includes(String(order.status))) driverActiveOrder.set(order.driver_id, order.id);
      if (order.status === 'delivered') driverDeliveriesToday.set(order.driver_id, (driverDeliveriesToday.get(order.driver_id) ?? 0) + 1);
    }
    if (order.restaurant_id) {
      const current = restaurantToday.get(order.restaurant_id) ?? { orders: 0, pending: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += Number(order.total ?? 0);
      if (['pending', 'confirmed', 'preparing', 'ready'].includes(String(order.status))) current.pending += 1;
      restaurantToday.set(order.restaurant_id, current);
    }
  }

  // Driver status mapping
  const drivers: DriverStatus[] = (driversRes.data ?? []).map((d): DriverStatus => ({
    id: d.user_id ?? d.id,
    name: d.full_name ?? d.users?.[0]?.name ?? 'Driver',
    status: !d.is_active || !d.is_online ? 'offline' : driverActiveOrder.has(d.user_id ?? d.id) ? 'on_delivery' : 'idle',
    active_order_id: driverActiveOrder.get(d.user_id ?? d.id),
    last_seen: d.last_seen_at ?? new Date().toISOString(),
    rating: Number(d.rating ?? 5),
    total_today: driverDeliveriesToday.get(d.user_id ?? d.id) ?? 0,
  }));
  const onlineDrivers = drivers.filter((d) => d.status !== 'offline').length;

  // Restaurant status mapping
  const restaurants: RestaurantStatus[] = (restaurantsRes.data ?? []).map((r): RestaurantStatus => ({
    id: r.id,
    name: r.name ?? 'Restaurant',
    is_online: !!r.is_active && r.is_online !== false,
    is_paused: !!r.is_paused,
    busy_mode: !!r.busy_mode,
    active_orders: restaurantToday.get(r.id)?.orders ?? 0,
    pending: restaurantToday.get(r.id)?.pending ?? 0,
    avg_prep_min: Number(r.avg_prep_minutes ?? 0),
    total_today: restaurantToday.get(r.id)?.revenue ?? 0,
    rating: Number(r.rating ?? 5),
  }));
  const onlineRestaurants = restaurants.filter((r) => r.is_online).length;

  // Incidents mapping
  const incidents: Incident[] = (incidentsRes.data ?? []).map((i): Incident => ({
    id: i.id,
    type: i.event_type === 'order_late' || i.event_type === 'driver_offline' || i.event_type === 'restaurant_offline' ? i.event_type : 'system_alert',
    message: i.message ?? i.event_type ?? 'Event',
    severity: (i.severity ?? 'low') as 'low' | 'medium' | 'high',
    created_at: i.created_at ?? new Date().toISOString(),
  }));

  return {
    kpis: {
      activeOrders,
      onlineDrivers,
      onlineRestaurants,
      pendingAcceptance,
      avgPrepMin,
      totalRevenueToday,
      totalOrdersToday,
      cancelRateToday,
    },
    drivers,
    restaurants,
    incidents,
    prevPeriod: {
      total_revenue: totalRevenueYesterday,
      total_orders: totalOrdersYesterday,
      avg_order_value: totalOrdersYesterday > 0 ? totalRevenueYesterday / totalOrdersYesterday : 0,
    },
  };
}

export default async function OperationsCenterPage() {
  await requireRole('admin');
  let data;
  try {
    data = await getOpsData();
  } catch (e) {
    console.error('[operations] getOpsData failed:', e);
    data = {
      kpis: { activeOrders: 0, onlineDrivers: 0, onlineRestaurants: 0, pendingAcceptance: 0, avgPrepMin: 0, totalRevenueToday: 0, totalOrdersToday: 0, cancelRateToday: 0 },
      drivers: [],
      restaurants: [],
      incidents: [],
      prevPeriod: { total_revenue: 0, total_orders: 0, avg_order_value: 0 },
    };
  }

  return (
    <OperationsConsoleV2
      initialKPIs={data.kpis}
      initialDrivers={data.drivers}
      initialRestaurants={data.restaurants}
      initialIncidents={data.incidents}
    />
  );
}
