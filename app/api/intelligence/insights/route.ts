/**
 * Operations Insights API
 * Returns platform-wide insights for admin operators.
 * 
 * GET - Current insights
 * GET ?restaurant_id=X - Restaurant-specific insights
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateOperationsInsights, type OrderMetrics, type DriverMetrics } from '@/lib/intelligence/operations-insights';
import { generateInsights, type HourlyVolume } from '@/lib/intelligence/restaurant-insights';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { predictNextHourDemand } from '@/lib/intelligence/operations-insights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

interface NameRelation {
  name?: string | null;
}

interface DriverInsightRow {
  id: string;
  user_id: string | null;
  full_name: string | null;
  is_online: boolean | null;
  last_active_at: string | null;
  users: NameRelation | NameRelation[] | null;
}

interface RestaurantInsightRow {
  id: string;
  name: string;
  is_active: boolean | null;
  is_online: boolean | null;
  is_paused: boolean | null;
  busy_mode: boolean | null;
  avg_prep_minutes: number | string | null;
}

interface ActiveOrderRow {
  id: string;
  status: string;
  driver_id: string | null;
  restaurant_id: string | null;
  created_at: string;
  estimated_ready_at: string | null;
  delivery_address: string | Record<string, unknown> | null;
}

interface HourlyOrderRow {
  created_at: string;
  total?: number | string | null;
  status: string;
  cancelled_at?: string | null;
}

interface RestaurantOrderRow extends HourlyOrderRow {
  prepared_at: string | null;
  accepted_at: string | null;
}

interface DemandOrderRow {
  created_at: string;
  status: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    // Check admin role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (userData?.role !== 'admin') throw new AuthorizationError('Admin only');

    const url = new URL(req.url);
    const restaurantId = url.searchParams.get('restaurant_id');

    if (restaurantId) {
      // Restaurant-specific insights
      const insights = await getRestaurantInsights(supabase, restaurantId);
      return ok({ insights, type: 'restaurant' });
    }

    // Platform-wide insights
    const insights = await getPlatformInsights(supabase);
    const demandForecast = await getDemandForecast(supabase);
    return ok({ insights, type: 'platform', demand_forecast: demandForecast });
  });
}

async function getPlatformInsights(supabase: ServerClient) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [driversRes, restaurantsRes, ordersRes, hourlyRes, pendingRes] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, user_id, full_name, is_online, is_active, last_active_at, users(name)')
      .eq('is_active', true),
    supabase
      .from('restaurants')
      .select('id, name, is_active, is_online, is_paused, busy_mode, avg_prep_minutes')
      .eq('is_active', true),
    supabase
      .from('orders')
      .select('id, status, driver_id, restaurant_id, created_at, estimated_ready_at, delivery_address, restaurant:restaurant_id(name)')
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up']),
    supabase
      .from('orders')
      .select('created_at, total, status, cancelled_at')
      .gte('created_at', sevenDaysAgo.toISOString()),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  // Build driver metrics
  const activeOrders = ordersRes.data as ActiveOrderRow[] | null ?? [];
  const activeOrdersByDriver = new Map<string, number>();
  const activeOrdersByRestaurant = new Map<string, number>();
  const pendingByRestaurant = new Map<string, number>();
  for (const order of activeOrders) {
    if (order.driver_id) activeOrdersByDriver.set(order.driver_id, (activeOrdersByDriver.get(order.driver_id) ?? 0) + 1);
    if (order.restaurant_id) {
      activeOrdersByRestaurant.set(order.restaurant_id, (activeOrdersByRestaurant.get(order.restaurant_id) ?? 0) + 1);
      if (order.status === 'pending') pendingByRestaurant.set(order.restaurant_id, (pendingByRestaurant.get(order.restaurant_id) ?? 0) + 1);
    }
  }
  const drivers: DriverMetrics[] = (driversRes.data as DriverInsightRow[] | null ?? []).map((driver) => ({
    id: driver.user_id ?? driver.id,
    name: driver.full_name ?? (Array.isArray(driver.users) ? driver.users[0]?.name : driver.users?.name) ?? 'Driver',
    status: !driver.is_online ? 'offline' : activeOrdersByDriver.has(driver.user_id ?? driver.id) ? 'on_delivery' : 'idle',
    activeOrderCount: activeOrdersByDriver.get(driver.user_id ?? driver.id) ?? 0,
    lastDeliveryMinutes: driver.last_active_at
      ? Math.floor((Date.now() - new Date(driver.last_active_at).getTime()) / 60_000)
      : 999,
  }));

  // Build restaurant metrics
  const restaurants = (restaurantsRes.data as RestaurantInsightRow[] | null ?? []).map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
    isOnline: !!restaurant.is_active && restaurant.is_online !== false,
    isPaused: !!restaurant.is_paused,
    busyMode: !!restaurant.busy_mode,
    activeOrders: activeOrdersByRestaurant.get(restaurant.id) ?? 0,
    pendingOrders: pendingByRestaurant.get(restaurant.id) ?? 0,
    avgPrepMin: Number(restaurant.avg_prep_minutes ?? 20),
  }));

  // Order metrics with ETA
  const orders = activeOrders.map((order) => ({
    id: order.id,
    status: order.status,
    createdAt: new Date(order.created_at),
    estimatedReadyAt: order.estimated_ready_at
      ? new Date(order.estimated_ready_at)
      : new Date(new Date(order.created_at).getTime() + 45 * 60 * 1000),
    customerAddress: typeof order.delivery_address === 'string' ? order.delivery_address : '',
  }));

  // Build hourly metrics
  const hourlyMap: Record<number, { count: number; cancelled: number; delivered: number; total: number }> = {};
  for (let h = 0; h < 24; h++) hourlyMap[h] = { count: 0, cancelled: 0, delivered: 0, total: 0 };
  for (const o of hourlyRes.data as HourlyOrderRow[] | null ?? []) {
    const h = new Date(o.created_at).getHours();
    if (hourlyMap[h]) {
      hourlyMap[h].count += 1;
      hourlyMap[h].total += Number(o.total ?? 0);
      if (o.status === 'cancelled' || o.cancelled_at) hourlyMap[h].cancelled += 1;
      if (o.status === 'delivered') hourlyMap[h].delivered += 1;
    }
  }
  const hourly: OrderMetrics[] = Object.entries(hourlyMap).map(([h, v]) => ({
    hour: Number(h),
    count: v.count,
    cancelled: v.cancelled,
    delivered: v.delivered,
    averageValue: v.count > 0 ? v.total / v.count : 0,
  }));

  const pendingOrders = pendingRes.count ?? 0;
  const insights = generateOperationsInsights({
    drivers,
    restaurants,
    pendingOrders,
    orders,
    historicalDemand: hourly,
  });

  return insights;
}

async function getRestaurantInsights(supabase: ServerClient, restaurantId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get hourly volume for this restaurant
  const { data: orders } = await supabase
    .from('orders')
    .select('created_at, total, status, prepared_at, accepted_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', sevenDaysAgo.toISOString());

  // Build hourly stats
  const hourlyMap: Record<number, { count: number; totalPrep: number; prepCount: number; total: number }> = {};
  for (let h = 0; h < 24; h++) hourlyMap[h] = { count: 0, totalPrep: 0, prepCount: 0, total: 0 };
  for (const o of orders as RestaurantOrderRow[] | null ?? []) {
    const h = new Date(o.created_at).getHours();
    if (hourlyMap[h]) {
      hourlyMap[h].count += 1;
      hourlyMap[h].total += Number(o.total ?? 0);
      if (o.accepted_at && o.prepared_at) {
        const prepMin = (new Date(o.prepared_at).getTime() - new Date(o.accepted_at).getTime()) / 60_000;
        if (prepMin > 0 && prepMin < 120) {
          hourlyMap[h].totalPrep += prepMin;
          hourlyMap[h].prepCount += 1;
        }
      }
    }
  }
  const hourly: HourlyVolume[] = Object.entries(hourlyMap).map(([h, v]) => ({
    hour: Number(h),
    orderCount: v.count,
    averagePrepMin: v.prepCount > 0 ? v.totalPrep / v.prepCount : 0,
    averageValue: v.count > 0 ? v.total / v.count : 0,
    cancelledCount: 0,
  }));

  // Get current active orders
  const { data: activeOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .in('status', ['pending', 'confirmed', 'preparing', 'ready']);

  return generateInsights({
    hourly,
    daily: [],
    items: [],
    currentActiveOrders: activeOrders?.length ?? 0,
    maxCapacity: 8,
  });
}

async function getDemandForecast(supabase: ServerClient) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { data: orders } = await supabase
    .from('orders')
    .select('created_at, status')
    .gte('created_at', sevenDaysAgo.toISOString());

  const hourlyMap: Record<number, { count: number; cancelled: number; delivered: number; total: number }> = {};
  for (let h = 0; h < 24; h++) hourlyMap[h] = { count: 0, cancelled: 0, delivered: 0, total: 0 };
  for (const o of orders as DemandOrderRow[] | null ?? []) {
    const h = new Date(o.created_at).getHours();
    if (hourlyMap[h]) {
      hourlyMap[h].count += 1;
      if (o.status === 'cancelled') hourlyMap[h].cancelled += 1;
      if (o.status === 'delivered') hourlyMap[h].delivered += 1;
    }
  }
  const hourly: OrderMetrics[] = Object.entries(hourlyMap).map(([h, v]) => ({
    hour: Number(h),
    count: v.count,
    cancelled: v.cancelled,
    delivered: v.delivered,
    averageValue: 0,
  }));

  return predictNextHourDemand(hourly);
}
