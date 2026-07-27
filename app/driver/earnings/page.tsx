import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { PageHeader } from '@/components/shared/PageHeader';
import { DriverEarningsDashboard, type DeliveryEarning } from '@/components/driver/DriverEarningsDashboard';
import { computeEarnings, DRIVER_EARNINGS_CONFIG } from '@/lib/services/driver-earnings';

// Cache for 30s to reduce Supabase load
export const revalidate = 30;
export const dynamic = 'force-dynamic';

function detectLocale(): 'de' | 'ar' | 'en' {
  const c = cookies().get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getEarningsData(driverId: string) {
  const supabase = createServerClient();

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
    const earnings = computeEarnings({ delivery_fee: o.delivery_fee, tip: o.tip });
    // Real distance: restaurant → customer (Haversine)
    const restLat = Number(o.restaurant_latitude ?? 0);
    const restLng = Number(o.restaurant_longitude ?? 0);
    const custLat = Number(o.customer_latitude ?? 0);
    const custLng = Number(o.customer_longitude ?? 0);
    const distance_km = restLat && custLat
      ? haversineKm(restLat, restLng, custLat, custLng)
      : 0;
    // Real duration: accepted_at → delivered_at (minutes)
    let duration_min = 0;
    if (o.accepted_at && o.delivered_at) {
      duration_min = Math.round((new Date(o.delivered_at).getTime() - new Date(o.accepted_at).getTime()) / 60000);
    }
    list.push({
      id: o.id,
      order_id: o.id,
      order_number: o.order_number,
      amount: earnings.base,
      tip: earnings.tip,
      distance_km,
      duration_min,
      delivered_at: o.delivered_at,
      restaurant_name: (o as any).restaurants?.name,
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
  const days = localeDayNames(detectLocale());
  const weeklyEarnings = days.map((day, i) => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - (6 - i));
    const dayList = list.filter((e) => {
      const ed = new Date(e.delivered_at);
      return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && ed.getDate() === d.getDate();
    });
    return {
      day,
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
    : 0;

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
    weeklyGoal: DRIVER_EARNINGS_CONFIG.defaultWeeklyGoal,
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

function localeDayNames(locale: 'de' | 'ar' | 'en'): string[] {
  if (locale === 'ar') return ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  if (locale === 'en') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
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
  const locale = detectLocale();
  const t = T[locale];

  const data = await getEarningsData(driverId);

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
          weeklyGoal={data.weeklyGoal}
          recentDeliveries={data.recentDeliveries}
          weeklyEarnings={data.weeklyEarnings}
          hourlyEarnings={data.hourlyEarnings}
          monthlyEarnings={data.monthlyEarnings}
          weekTrendPct={data.weekTrendPct}
          peakHours={data.peakHours}
          avgTime={data.avgTime}
          avgEarnings={data.avgEarnings}
          locale={locale}
        />
      </div>
    </>
  );
}
