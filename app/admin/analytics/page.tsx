import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { RestaurantAnalytics } from '@/components/admin/RestaurantAnalytics';

export const revalidate = 300; // 5 min cache for analytics
export const dynamic = 'force-dynamic';

async function getAnalyticsData(periodDays: 7 | 30) {
  const supabase = await createServerClient();
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - periodDays);
  const prevStartDate = new Date(startDate);
  prevStartDate.setDate(prevStartDate.getDate() - periodDays);

  // Aggregate queries
  const [ordersRes, prevOrdersRes, customersRes, hourlyRes, topRestaurantsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total, status, customer_id, restaurant_id, created_at')
      .gte('created_at', startDate.toISOString())
      .neq('status', 'cancelled'),
    supabase
      .from('orders')
      .select('id, total, status')
      .gte('created_at', prevStartDate.toISOString())
      .lt('created_at', startDate.toISOString())
      .neq('status', 'cancelled'),
    supabase
      .from('orders')
      .select('customer_id')
      .gte('created_at', startDate.toISOString())
      .neq('status', 'cancelled'),
    supabase
      .from('orders')
      .select('created_at, total')
      .gte('created_at', startDate.toISOString())
      .neq('status', 'cancelled'),
    supabase
      .from('restaurants')
      .select('id, name, rating')
      .eq('is_active', true)
      .limit(500),
    supabase
      .from('orders')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .neq('status', 'cancelled'),
  ]);

  const orders = ordersRes.data ?? [];
  const prevOrders = prevOrdersRes.data ?? [];
  const hourly = hourlyRes.data ?? [];
  const customers = new Set((customersRes.data ?? []).map((order) => order.customer_id).filter(Boolean));

  // Aggregate by day
  const revenueByDay: Record<string, { revenue: number; orders: number }> = {};
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    revenueByDay[key] = { revenue: 0, orders: 0 };
  }
  for (const o of orders) {
    const key = new Date(o.created_at).toISOString().slice(0, 10);
    if (revenueByDay[key]) {
      revenueByDay[key].revenue += o.total ?? 0;
      revenueByDay[key].orders += 1;
    }
  }

  // Aggregate by hour
  const ordersByHour: Array<{ hour: number; orders: number; revenue: number }> = [];
  for (let h = 0; h < 24; h++) {
    ordersByHour.push({ hour: h, orders: 0, revenue: 0 });
  }
  for (const o of hourly) {
    const h = new Date(o.created_at).getHours();
    ordersByHour[h].orders += 1;
    ordersByHour[h].revenue += o.total ?? 0;
  }
  const peakHourEntry = ordersByHour.reduce((max, h) => (h.orders > max.orders ? h : max), { hour: 12, orders: 0 });
  const peakHour = peakHourEntry.hour;
  const peakHourOrders = peakHourEntry.orders;

  // Repeat rate: customers with > 1 order
  const customerOrderCount: Record<string, number> = {};
  for (const o of orders) {
    if (o.customer_id) {
      customerOrderCount[o.customer_id] = (customerOrderCount[o.customer_id] ?? 0) + 1;
    }
  }
  const repeatCustomers = Object.values(customerOrderCount).filter((c) => c > 1).length;
  const repeatRate = customers.size > 0 ? (repeatCustomers / customers.size) * 100 : 0;

  const totalRevenue = orders.reduce((s, o) => s + (o.total ?? 0), 0);
  const totalOrdersCount = orders.length;
  const avgOrderValue = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;
  const prevRevenue = prevOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const prevOrderCount = prevOrders.length;
  const prevAvgOrder = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;

  const restaurantTotals = new Map<string, { revenue: number; orders: number }>();
  for (const order of orders) {
    if (!order.restaurant_id) continue;
    const current = restaurantTotals.get(order.restaurant_id) ?? { revenue: 0, orders: 0 };
    current.revenue += Number(order.total ?? 0);
    current.orders += 1;
    restaurantTotals.set(order.restaurant_id, current);
  }
  const topRestaurants = (topRestaurantsRes.data ?? [])
    .map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      revenue: restaurantTotals.get(restaurant.id)?.revenue ?? 0,
      orders: restaurantTotals.get(restaurant.id)?.orders ?? 0,
      rating: Number(restaurant.rating ?? 0),
    }))
    .filter((restaurant) => restaurant.orders > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    period_days: periodDays,
    total_revenue: totalRevenue,
    total_orders: totalOrdersCount,
    avg_order_value: avgOrderValue,
    unique_customers: customers.size,
    repeat_rate: repeatRate,
    peak_hour: peakHour,
    peak_hour_orders: peakHourOrders,
    revenue_by_day: Object.entries(revenueByDay)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    orders_by_hour: ordersByHour,
    top_restaurants: topRestaurants,
    prev_period: {
      total_revenue: prevRevenue,
      total_orders: prevOrderCount,
      avg_order_value: prevAvgOrder,
    },
  };
}

export default async function AdminAnalyticsPage() {
  await requireRole('admin');
  let data;
  try {
    data = await getAnalyticsData(7);
  } catch (e) {
    console.error('[analytics] failed:', e);
    data = {
      period_days: 7,
      total_revenue: 0,
      total_orders: 0,
      avg_order_value: 0,
      unique_customers: 0,
      repeat_rate: 0,
      peak_hour: 12,
      peak_hour_orders: 0,
      revenue_by_day: [],
      orders_by_hour: Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 })),
      top_restaurants: [],
      prev_period: { total_revenue: 0, total_orders: 0, avg_order_value: 0 },
    };
  }
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <PageHeader title="Analytics" subtitle="Performance insights" />
        <div className="mt-6">
          <RestaurantAnalytics data={data} />
        </div>
      </div>
    </div>
  );
}
