import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { DriverDashboardV2 } from '@/components/driver/DriverDashboardV2';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';
import { computeEarnings } from '@/lib/services/driver-earnings';

// Cache for 30s — driver dashboard data is fresh enough at 30s granularity
// (active order + earnings) and dramatically reduces Supabase load.
export const revalidate = 30;
export const dynamic = 'force-dynamic';

function detectLocale(): 'de' | 'ar' | 'en' {
  const c = cookies().get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

async function getDashboardData(driverId: string) {
  const supabase = createServerClient();

  // Run auth + all data queries in parallel for fast page load
  const [userResult, activeResult, deliveredResult, totalCountResult, hoursResult] = await Promise.all([
    supabase.auth.getUser(),
    // Active order
    supabase
      .from('orders')
      .select(
        'id, order_number, status, total, tip, delivery_fee, payment_method, customer_latitude, customer_longitude, restaurant_latitude, restaurant_longitude, delivery_address, delivery_instructions, customer:customer_id(name, phone), restaurants:restaurant_id(name, address, phone)',
      )
      .eq('driver_id', driverId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'])
      .order('accepted_at', { ascending: false })
      .limit(1),
    // Recent completed (delivered) for this driver — last 30 days
    (() => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return supabase
        .from('orders')
        .select(
          'id, order_number, status, total, tip, delivery_fee, delivered_at, created_at, restaurants:restaurant_id(name), accepted_at, cancelled_at',
        )
        .eq('driver_id', driverId)
        .in('status', ['delivered', 'cancelled'])
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('delivered_at', { ascending: false })
        .limit(100);
    })(),
    // All-time delivered count
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .eq('status', 'delivered'),
    // Working hours
    supabase
      .from('driver_working_hours')
      .select('*')
      .eq('driver_id', driverId),
  ]);

  const { data: { user } } = userResult;
  const { data: activeRows } = activeResult;
  const { data: delivered } = deliveredResult;
  const { count: allTimeCount } = totalCountResult;
  const { data: hours } = hoursResult;

  const meta = user?.user_metadata ?? {};
  const isOnline = !!meta.is_online;
  const driverName = meta.full_name || meta.name || 'Driver';
  const rating = Number(meta.rating ?? 5.0);

  const activeOrder = (activeRows ?? [])[0] ?? null;

  // Compute stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 30);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  let todayEarnings = 0;
  let todayDeliveries = 0;
  let weekEarnings = 0;
  let monthEarnings = 0;
  let lastWeekEarnings = 0;
  let cancelledCount = 0;
  let acceptedCount = 0;
  let completedCount = 0;

  for (const o of delivered ?? []) {
    const earnings = computeEarnings({ delivery_fee: o.delivery_fee, tip: o.tip }).total;
    const d = new Date(o.delivered_at ?? o.created_at);
    if (d >= todayStart) {
      todayEarnings += earnings;
      if (o.status === 'delivered') todayDeliveries += 1;
    }
    if (d >= weekStart) {
      weekEarnings += earnings;
    }
    if (d >= monthStart) {
      monthEarnings += earnings;
    }
    if (d >= prevWeekStart && d < weekStart) {
      lastWeekEarnings += earnings;
    }
    if (o.status === 'cancelled') cancelledCount += 1;
    if (o.status === 'delivered') completedCount += 1;
    if (o.accepted_at) acceptedCount += 1;
  }

  // All-time totals (already fetched in parallel above)
  const totalDeliveries = allTimeCount ?? 0;

  // Acceptance rate: deliveries / offers
  // We don't track offers explicitly; use completion rate as proxy:
  // (delivered) / (delivered + cancelled)
  const total = completedCount + cancelledCount;
  const completionRate = total > 0 ? (completedCount / total) * 100 : 100;
  // Acceptance rate proxy: completed / accepted (some accepted may be cancelled)
  const acceptanceRate = acceptedCount > 0 ? (completedCount / acceptedCount) * 100 : 100;

  // Working hours (already fetched in parallel above)
  let workingHours: Array<{ day: string; start: string; end: string; enabled: boolean }> = [];
  try {
    if (hours) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      workingHours = hours.map((h: any) => ({
        day: dayNames[h.day_of_week] ?? `Day ${h.day_of_week}`,
        start: h.start_time?.slice(0, 5) ?? '—',
        end: h.end_time?.slice(0, 5) ?? '—',
        enabled: !!h.is_enabled,
      }));
    }
  } catch {
    // table might not exist
  }

  // Week-over-week trend
  const weekTrendPct = lastWeekEarnings > 0
    ? ((weekEarnings - lastWeekEarnings) / lastWeekEarnings) * 100
    : 0;

  // Available count (from API)
  let availableCount = 0;
  try {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .is('driver_id', null)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready']);
    availableCount = count ?? 0;
  } catch {
    availableCount = 0;
  }

  return {
    driverId,
    driverName,
    isOnline,
    onlineSince: meta.online_since ?? null,
    availableCount,
    rating,
    todayEarnings,
    todayDeliveries,
    weekEarnings,
    monthEarnings,
    totalDeliveries,
    activeOrder,
    recentOrders: (delivered ?? []).slice(0, 8),
    acceptanceRate,
    completionRate,
    workingHours,
    weekTrendPct,
  };
}

export default async function DriverDashboardPage() {
  const { id: driverId } = await requireRole('driver');
  const { locale } = await getServerTranslations();
  let data;
  try {
    data = await getDashboardData(driverId);
  } catch (e) {
    console.error('[driver-dashboard] getDashboardData failed:', e);
    // Fallback to empty data so the page still renders
    data = {
      driverId,
      driverName: 'Driver',
      isOnline: false,
      onlineSince: null,
      availableCount: 0,
      todayEarnings: 0,
      todayDeliveries: 0,
      weekEarnings: 0,
      monthEarnings: 0,
      totalDeliveries: 0,
      rating: 5,
      acceptanceRate: 100,
      completionRate: 100,
      workingHours: [],
      weekTrendPct: 0,
      activeOrder: null,
      recentOrders: [],
    } as any;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
      <DriverDashboardV2
        driverId={data.driverId}
        driverName={data.driverName}
        isOnline={data.isOnline}
        initialActiveOrder={data.activeOrder}
        initialAvailableCount={data.availableCount}
        initialShiftEarnings={data.todayEarnings}
        initialShiftDeliveries={data.todayDeliveries}
        onlineSince={data.onlineSince}
      />
    </div>
  );
}
