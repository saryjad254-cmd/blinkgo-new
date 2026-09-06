/**
 * Unified Portal Stats API
 * ─────────────────────────
 * Single endpoint that returns the right stats for each portal:
 *   - driver    → driver's own KPIs (orders today, earnings, etc.)
 *   - restaurant → restaurant's KPIs (orders today, revenue, etc.)
 *   - admin     → platform-wide KPIs (total orders, revenue, users, etc.)
 *
 * Migrated to apiRoute() — the canonical API entry point.
 */
import { apiRoute, ok, tier } from '@/lib/api/canonical';
import { createServiceClient } from '@/lib/supabase/service';
import { computeEarnings, type EarningsInput } from '@/lib/services/driver-earnings';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RevenueOrder {
  total?: number | string | null;
}

interface UserRoleRow {
  role: string;
}

interface DriverAvailabilityRow {
  is_online?: boolean | null;
  is_available?: boolean | null;
}

interface RestaurantAvailabilityRow {
  is_active?: boolean | null;
  is_paused?: boolean | null;
}

function startOfDay(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function startOfWeek(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - 7);
  return x.toISOString();
}

function startOfMonth(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(1);
  return x.toISOString();
}

async function driverStats(supabase: ReturnType<typeof createServiceClient>, driverId: string) {
  const today = startOfDay();
  const week = startOfWeek();
  const month = startOfMonth();

  const [ordersToday, ordersWeek, ordersMonth, active, recent] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total, delivery_fee, tip, status, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', today),
    supabase
      .from('orders')
      .select('id, total, delivery_fee, tip, status, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', week),
    supabase
      .from('orders')
      .select('id, total, delivery_fee, tip, status, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', month),
    supabase
      .from('orders')
      .select('id')
      .eq('driver_id', driverId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up'])
      .limit(1),
    supabase
      .from('orders')
      .select('id, order_number, total, status, created_at, restaurants:restaurant_id(name)')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const sumEarnings = (orders: EarningsInput[] | null) => {
    if (!orders) return 0;
    return orders.reduce((sum, order) => sum + computeEarnings(order).total, 0);
  };

  return {
    today: { orders: ordersToday.data?.length || 0, earnings: sumEarnings(ordersToday.data) },
    week: { orders: ordersWeek.data?.length || 0, earnings: sumEarnings(ordersWeek.data) },
    month: { orders: ordersMonth.data?.length || 0, earnings: sumEarnings(ordersMonth.data) },
    activeOrder: (active.data && active.data.length > 0) ? active.data[0] : null,
    recentOrders: recent.data || [],
  };
}

async function restaurantStats(supabase: ReturnType<typeof createServiceClient>, restaurantId: string) {
  const today = startOfDay();
  const week = startOfWeek();

  const [restaurant, ordersToday, ordersWeek, pending, recent, menu] = await Promise.all([
    supabase.from('restaurants').select('id, name, is_active, rating').eq('id', restaurantId).maybeSingle(),
    supabase.from('orders').select('id, total, status, delivery_fee').eq('restaurant_id', restaurantId).gte('created_at', today),
    supabase.from('orders').select('id, total, status, delivery_fee').eq('restaurant_id', restaurantId).gte('created_at', week),
    supabase.from('orders').select('id').eq('restaurant_id', restaurantId).in('status', ['pending', 'confirmed', 'preparing']).limit(5),
    supabase.from('orders').select('id, order_number, total, status, created_at, customer_id').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(10),
    supabase.from('products').select('id, name, is_available').eq('restaurant_id', restaurantId).limit(100),
  ]);

  const sumRevenue = (orders: RevenueOrder[] | null) => {
    if (!orders) return 0;
    return orders.reduce((s, o) => s + Number(o.total || 0), 0);
  };

  return {
    restaurant: restaurant.data,
    today: { orders: ordersToday.data?.length || 0, revenue: sumRevenue(ordersToday.data) },
    week: { orders: ordersWeek.data?.length || 0, revenue: sumRevenue(ordersWeek.data) },
    pendingOrders: pending.data || [],
    recentOrders: recent.data || [],
    menuItems: menu.data?.length || 0,
  };
}

async function adminStats(supabase: ReturnType<typeof createServiceClient>) {
  const today = startOfDay();
  const week = startOfWeek();
  const month = startOfMonth();

  const [
    ordersToday, ordersWeek, ordersMonth,
    active, allUsers, drivers, restaurants, recentOrders,
  ] = await Promise.all([
    supabase.from('orders').select('id, total, status').gte('created_at', today),
    supabase.from('orders').select('id, total, status').gte('created_at', week),
    supabase.from('orders').select('id, total, status').gte('created_at', month),
    supabase.from('orders').select('id').in('status', ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up']).limit(1000),
    supabase.from('users').select('id, role, created_at, is_active'),
    supabase.from('drivers').select('id, is_online, is_available'),
    supabase.from('restaurants').select('id, is_active, is_paused'),
    supabase.from('orders').select('id, order_number, total, status, created_at').order('created_at', { ascending: false }).limit(20),
  ]);

  const sumRevenue = (orders: RevenueOrder[] | null) => {
    if (!orders) return 0;
    return orders.reduce((s, o) => s + Number(o.total || 0), 0);
  };

  const userCounts = (allUsers.data as UserRoleRow[] | null ?? []).reduce((acc: Record<string, number>, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {});

  const driverRows = drivers.data as DriverAvailabilityRow[] | null ?? [];
  const restaurantRows = restaurants.data as RestaurantAvailabilityRow[] | null ?? [];
  const onlineDrivers = driverRows.filter((driver) => driver.is_online).length;
  const availableDrivers = driverRows.filter((driver) => driver.is_available).length;
  const activeRestaurants = restaurantRows.filter((restaurant) => restaurant.is_active && !restaurant.is_paused).length;

  return {
    today: { orders: ordersToday.data?.length || 0, revenue: sumRevenue(ordersToday.data) },
    week: { orders: ordersWeek.data?.length || 0, revenue: sumRevenue(ordersWeek.data) },
    month: { orders: ordersMonth.data?.length || 0, revenue: sumRevenue(ordersMonth.data) },
    activeOrders: (active.data && active.data.length > 0) ? active.data.length : 0,
    users: {
      total: allUsers.data?.length || 0,
      byRole: userCounts,
    },
    drivers: {
      total: drivers.data?.length || 0,
      online: onlineDrivers,
      available: availableDrivers,
    },
    restaurants: {
      total: restaurants.data?.length || 0,
      active: activeRestaurants,
    },
    recentOrders: recentOrders.data || [],
  };
}

export const GET = apiRoute({
  method: 'GET',
  auth: 'required',
  roles: ['driver', 'restaurant', 'admin', 'super_admin', 'manager'],
  rateLimit: tier('lenient'),
  cacheControl: 'private, max-age=10',
  handler: async ({ user }) => {
    if (!user) {
      return ok({ role: 'anonymous', stats: null });
    }
    const supabase = createServiceClient();

    if (user.role === 'driver') {
      const stats = await driverStats(supabase, user.id);
      return ok({ role: 'driver', stats });
    }

    if (user.role === 'restaurant') {
      const { service, restaurantId } = await resolveOwnedRestaurant(user.id);
      if (!restaurantId) {
        return ok({ role: 'restaurant', stats: null, message: 'No restaurant linked to this user' });
      }
      const stats = await restaurantStats(service, restaurantId);
      return ok({ role: 'restaurant', stats });
    }

    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'manager') {
      const stats = await adminStats(supabase);
      return ok({ role: user.role, stats });
    }

    return ok({ role: user.role, stats: null });
  },
});
