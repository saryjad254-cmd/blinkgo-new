/**
 * Admin Dashboard — Production rebuild
 * ────────────────────────────────────
 * Modern admin dashboard for the platform operator.
 * Shows:
 *   - Today/Week/Month revenue KPIs
 *   - Active orders
 *   - Online drivers, active restaurants
 *   - User growth by role
 *   - Recent orders feed
 *   - Quick actions
 */
import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminDashboardClient } from '@/components/admin/AdminDashboardClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadAdminData() {
  const supabase = createServiceClient();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfMonth = new Date(now);
  startOfMonth.setHours(0, 0, 0, 0);
  startOfMonth.setDate(1);

  const [
    todayOrders,
    weekOrders,
    monthOrders,
    activeOrders,
    allUsers,
    driverUsers,
    driverStatuses,
    restaurants,
    recentOrders,
    allOrdersForChart,
  ] = await Promise.all([
    supabase.from('orders').select('id, total, status, created_at').gte('created_at', startOfDay.toISOString()),
    supabase.from('orders').select('id, total, status, created_at').gte('created_at', startOfWeek.toISOString()),
    supabase.from('orders').select('id, total, status, created_at').gte('created_at', startOfMonth.toISOString()),
    supabase
      .from('orders')
      .select('id, order_number, total, status, customer:customer_id(name), restaurants:restaurant_id(name)', { count: 'exact' })
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('users').select('id, role, is_active, created_at'),
    supabase.from('users').select('id, is_active').eq('role', 'driver'),
    supabase.from('driver_status').select('driver_id, is_online, is_on_delivery, current_order_id'),
    supabase.from('restaurants').select('id, is_active, is_paused, rating, review_count, name'),
    supabase
      .from('orders')
      .select(`
        id, order_number, total, status, created_at, delivered_at,
        customer:customer_id(name), restaurants:restaurant_id(name)
      `)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('orders')
      .select('id, total, created_at, status')
      .gte('created_at', startOfWeek.toISOString()),
  ]);

  const sumRevenue = (orders: Array<{ status: string; total: number | string | null }> | null) => {
    if (!orders) return 0;
    return orders
      .filter((order) => order.status === 'delivered')
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
  };

  // User breakdown by role
  const userBreakdown: Record<string, { total: number; active: number }> = {};
  for (const u of allUsers.data || []) {
    if (!userBreakdown[u.role]) userBreakdown[u.role] = { total: 0, active: 0 };
    userBreakdown[u.role].total++;
    if (u.is_active !== false) userBreakdown[u.role].active++;
  }

  // Order status breakdown
  const orderStatusBreakdown: Record<string, number> = {};
  for (const o of (todayOrders.data || [])) {
    orderStatusBreakdown[o.status] = (orderStatusBreakdown[o.status] || 0) + 1;
  }

  // Daily revenue chart (last 7 days)
  const dailyRevenue: { date: string; revenue: number; orders: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dayOrders = (allOrdersForChart.data || []).filter((o) => {
      const t = new Date(o.created_at);
      return t >= d && t < next;
    });
    dailyRevenue.push({
      date: d.toISOString().slice(0, 10),
      revenue: sumRevenue(dayOrders),
      orders: dayOrders.length,
    });
  }

  return {
    today: { orders: todayOrders.data?.length || 0, revenue: sumRevenue(todayOrders.data) },
    week: { orders: weekOrders.data?.length || 0, revenue: sumRevenue(weekOrders.data) },
    month: { orders: monthOrders.data?.length || 0, revenue: sumRevenue(monthOrders.data) },
    activeOrders: activeOrders.data || [],
    activeOrderCount: activeOrders.count ?? activeOrders.data?.length ?? 0,
    users: {
      total: allUsers.data?.length || 0,
      breakdown: userBreakdown,
    },
    drivers: {
      total: (driverUsers.data || []).filter((driver) => driver.is_active !== false).length,
      online: (driverStatuses.data || []).filter((driver) => driver.is_online).length,
      available: (driverStatuses.data || []).filter((driver) => driver.is_online && !driver.is_on_delivery && !driver.current_order_id).length,
    },
    restaurants: {
      total: restaurants.data?.length || 0,
      active: (restaurants.data || []).filter((restaurant) => restaurant.is_active && !restaurant.is_paused).length,
      top: (restaurants.data || [])
        .filter((restaurant) => restaurant.rating)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 5),
    },
    recentOrders: recentOrders.data || [],
    orderStatusBreakdown,
    dailyRevenue,
  };
}

export default async function AdminDashboardPage() {
  const user = await requireRole('admin');
  const data = await loadAdminData();

  return (
    <AdminDashboardClient
      initialData={data}
      userName={user.name || user.email || 'Admin'}
    />
  );
}
