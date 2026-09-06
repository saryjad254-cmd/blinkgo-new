import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { PageHeader } from '@/components/shared/PageHeader';
import { DriverEarningsDashboard, type DeliveryEarning } from '@/components/driver/DriverEarningsDashboard';
import { computeEarnings } from '@/lib/services/driver-earnings';

// Cache for 30s to reduce Supabase load
export const revalidate = 30;
export const dynamic = 'force-dynamic';

async function detectLocale(): Promise<'de' | 'ar' | 'en'> {
  const c = (await cookies()).get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

async function getEarningsData(driverId: string, locale: 'de' | 'ar' | 'en') {
  const supabase = await createServerClient();

  // All-time delivered orders for this driver
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, total, tip, delivery_fee, delivered_at, customer_id, restaurant_id, customer_latitude, customer_longitude, restaurant_latitude, restaurant_longitude, accepted_at, picked_up_at, restaurants(name)')
    .eq('driver_id', driverId)
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false })
    .limit(500);

  const list: DeliveryEarning[] = [];
  for (const o of orders ?? []) {
    // Use canonical formula
    const earnings = computeEarnings(o);
    // Real distance: restaurant → customer (Haversine)
    const distance_km = earnings.distanceKm ?? 0;
    // Real duration: accepted_at → delivered_at (minutes)
    let duration_min = 0;
    if (o.accepted_at && o.delivered_at) {
      duration_min = Math.round((new Date(o.delivered_at).getTime() - new Date(o.accepted_at).getTime()) / 60000);
    }
    const restaurant = Array.isArray(o.restaurants) ? o.restaurants[0] : o.restaurants;
    list.push({
      id: o.id,
      order_id: o.id,
      order_number: o.order_number,
      amount: earnings.base,
      tip: earnings.tip,
      distance_km,
      duration_min,
      delivered_at: o.delivered_at,
      restaurant_name: restaurant?.name,
      customer_name: undefined,
    });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 30);

  const todayList = list.filter((d) => new Date(d.delivered_at) >= todayStart);
  const weekList = list.filter((d) => new Date(d.delivered_at) >= weekStart);
  const monthList = list.filter((d) => new Date(d.delivered_at) >= monthStart);

  // Generate weekly data (7 days)
  const localeCode = locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE';
  const weeklyEarnings = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - (6 - i));
    const dayList = list.filter((e) => {
      const ed = new Date(e.delivered_at);
      return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && ed.getDate() === d.getDate();
    });
    return {
      day: d.toLocaleDateString(localeCode, { weekday: 'short' }),
      amount: dayList.reduce((s, e) => s + e.amount + e.tip, 0),
      count: dayList.length,
    };
  });

  // Generate hourly data (24h)
  const hourlyEarnings = Array.from({ length: 24 }).map((_, hour) => {
    const hourList = list.filter((e) => new Date(e.delivered_at).getHours() === hour);
    return {
      hour,
      amount: hourList.reduce((s, e) => s + e.amount + e.tip, 0),
      count: hourList.length,
    };
  });

  // Generate 30-day monthly data
  const monthlyEarnings = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - (29 - i));
    const dayList = list.filter((e) => {
      const ed = new Date(e.delivered_at);
      return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && ed.getDate() === d.getDate();
    });
    return {
      day: String(d.getDate()),
      amount: dayList.reduce((s, e) => s + e.amount + e.tip, 0),
      count: dayList.length,
    };
  });

  // Compute last-week for trend
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekList = list.filter((d) => {
    const t = new Date(d.delivered_at);
    return t >= lastWeekStart && t < weekStart;
  });
  const thisWeekTotal = weekList.reduce((s, e) => s + e.amount + e.tip, 0);
  const lastWeekTotal = lastWeekList.reduce((s, e) => s + e.amount + e.tip, 0);
  const weekTrendPct = lastWeekTotal > 0
    ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100
    : null;

  // Peak hours (top 3 hours)
  const peakHours = [...hourlyEarnings]
    .sort((a, b) => b.count - a.count)
    .filter((h) => h.count > 0)
    .slice(0, 3)
    .map((h) => h.hour);

  // Average time
  const deliveriesWithTime = list.filter((d) => d.duration_min > 0);
  const avgTime = deliveriesWithTime.length > 0
    ? deliveriesWithTime.reduce((s, d) => s + d.duration_min, 0) / deliveriesWithTime.length
    : 0;

  // Avg earnings per delivery
  const avgEarnings = list.length > 0
    ? list.reduce((s, e) => s + e.amount + e.tip, 0) / list.length
    : 0;

  return {
    earnings: list,
    todayTotal: todayList.reduce((s, e) => s + e.amount + e.tip, 0),
    todayCount: todayList.length,
    weekTotal: thisWeekTotal,
    weekCount: weekList.length,
    monthTotal: monthList.reduce((s, e) => s + e.amount + e.tip, 0),
    monthCount: monthList.length,
    allTimeTotal: list.reduce((s, e) => s + e.amount + e.tip, 0),
    allTimeCount: list.length,
    recentDeliveries: list.slice(0, 8),
    weeklyEarnings,
    hourlyEarnings,
    monthlyEarnings,
    weekTrendPct,
    peakHours,
    avgTime,
    avgEarnings,
  };
}

const T = {
  de: {
    title: 'Verdienst',
    subtitle: 'Deine Einnahmen-Übersicht',
  },
  ar: {
    title: 'الأرباح',
    subtitle: 'ملخص دخلك',
  },
  en: {
    title: 'Earnings',
    subtitle: 'Your income overview',
  },
} as const;

export default async function DriverEarningsPage() {
  const { id: driverId } = await requireRole('driver');
  const locale = await detectLocale();
  const t = T[locale];

  const data = await getEarningsData(driverId, locale);

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <DriverEarningsDashboard
          earnings={data.earnings}
          todayTotal={data.todayTotal}
          todayCount={data.todayCount}
          weekTotal={data.weekTotal}
          weekCount={data.weekCount}
          monthTotal={data.monthTotal}
          monthCount={data.monthCount}
          allTimeTotal={data.allTimeTotal}
          allTimeCount={data.allTimeCount}
          recentDeliveries={data.recentDeliveries}
          weeklyEarnings={data.weeklyEarnings}
          hourlyEarnings={data.hourlyEarnings}
          weekTrendPct={data.weekTrendPct}
          avgTime={data.avgTime}
          locale={locale}
        />
      </div>
    </>
  );
}
