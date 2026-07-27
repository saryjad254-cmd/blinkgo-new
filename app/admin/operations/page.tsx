import { requireRole } from '@/lib/rbac';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { OperationsConsoleV2 } from '@/components/admin/OperationsConsoleV2';
import { AIInsightsPanel } from '@/components/admin/AIInsightsPanel';
import type { Locale } from '@/lib/i18n/server-translations';

export const revalidate = 10; // Live data, refresh every 10s
export const dynamic = 'force-dynamic';

function detectLocale(): Locale {
  const c = cookies().get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

async function getOpsData() {
  const supabase = createServerClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  // Run all queries in parallel
  const [activeRes, driversRes, restaurantsRes, todayRes, yesterdayRes, pendingRes, incidentsRes, prepRes] = await Promise.all([
    supabase.from('orders').select('id, status', { count: 'exact' }).in('status', ['pending', 'confirmed', 'preparing', 'ready', 'picked_up']),
    supabase.from('users').select('id, name, rating, is_active, last_seen_at, online_status, current_order_id, total_deliveries_today').eq('role', 'driver'),
    supabase.from('restaurants').select('id, name, is_active, is_paused, busy_mode, busy_mode_until, rating, today_orders_count, today_revenue, avg_prep_min, pending_orders'),
    supabase.from('orders').select('id, total, status').gte('created_at', todayStart.toISOString()),
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

  // Driver status mapping
  const drivers = (driversRes.data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name ?? 'Driver',
    status: !d.is_active ? 'offline' : d.current_order_id ? 'on_delivery' : 'idle',
    active_order_id: d.current_order_id ?? undefined,
    last_seen: d.last_seen_at ?? new Date().toISOString(),
    rating: Number(d.rating ?? 5),
    total_today: d.total_deliveries_today ?? 0,
  }));
  const onlineDrivers = drivers.filter((d) => d.status !== 'offline').length;

  // Restaurant status mapping
  const restaurants = (restaurantsRes.data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name ?? 'Restaurant',
    is_online: !!r.is_active,
    is_paused: !!r.is_paused,
    busy_mode: !!r.busy_mode,
    active_orders: r.today_orders_count ?? 0,
    pending: r.pending_orders ?? 0,
    avg_prep_min: r.avg_prep_min ?? 0,
    total_today: r.today_revenue ?? 0,
    rating: Number(r.rating ?? 5),
  }));
  const onlineRestaurants = restaurants.filter((r) => r.is_online).length;

  // Incidents mapping
  const incidents = (incidentsRes.data ?? []).map((i: any) => ({
    id: i.id,
    type: (i.event_type ?? 'system_alert') as any,
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
  const locale = detectLocale();

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
      initialDrivers={data.drivers as any}
      initialRestaurants={data.restaurants as any}
      initialIncidents={data.incidents as any}
    />
  );
}
