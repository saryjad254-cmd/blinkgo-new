/**
 * Operations Insights API
 * Returns platform-wide insights for admin operators.
 * 
 * GET - Current insights
 * GET ?restaurant_id=X - Restaurant-specific insights
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateOperationsInsights, type OrderMetrics, type DriverMetrics } from '@/lib/intelligence/operations-insights';
import { generateInsights, type HourlyVolume, type DailyPattern, type ItemPerformance } from '@/lib/intelligence/restaurant-insights';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { predictNextHourDemand } from '@/lib/intelligence/operations-insights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
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

async function getPlatformInsights(supabase: any) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [driversRes, restaurantsRes, ordersRes, hourlyRes, pendingRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, online_status, current_order_id, last_delivery_at')
      .eq('role', 'driver')
      .eq('is_active', true),
    supabase
      .from('restaurants')
      .select('id, name, is_active, is_paused, busy_mode, today_orders_count, pending_orders, avg_prep_min')
      .eq('is_active', true),
    supabase
      .from('orders')
      .select('id, status, created_at, estimated_ready_at, delivery_address, restaurant:restaurant_id(name)')
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'picked_up']),
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
  const drivers: DriverMetrics[] = (driversRes.data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name ?? 'Driver',
    status: !d.online_status ? 'offline' : d.current_order_id ? 'on_delivery' : 'idle',
    activeOrderCount: d.current_order_id ? 1 : 0,
    lastDeliveryMinutes: d.last_delivery_at
      ? Math.floor((Date.now() - new Date(d.last_delivery_at).getTime()) / 60_000)
      : 999,
  }));

  // Build restaurant metrics
  const restaurants = (restaurantsRes.data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    isOnline: !!r.is_active,
    isPaused: !!r.is_paused,
    busyMode: !!r.busy_mode,
    activeOrders: r.today_orders_count ?? 0,
    pendingOrders: r.pending_orders ?? 0,
    avgPrepMin: r.avg_prep_min ?? 20,
  }));

  // Order metrics with ETA
  const orders = (ordersRes.data ?? []).map((o: any) => ({
    id: o.id,
    status: o.status,
    createdAt: new Date(o.created_at),
    estimatedReadyAt: o.estimated_ready_at
      ? new Date(o.estimated_ready_at)
      : new Date(new Date(o.created_at).getTime() + 45 * 60 * 1000),
    customerAddress: o.delivery_address ?? '',
  }));

  // Build hourly metrics
  const hourlyMap: Record<number, { count: number; cancelled: number; delivered: number; total: number }> = {};
  for (let h = 0; h < 24; h++) hourlyMap[h] = { count: 0, cancelled: 0, delivered: 0, total: 0 };
  for (const o of hourlyRes.data ?? []) {
    const h = new Date(o.created_at).getHours();
    if (hourlyMap[h]) {
      hourlyMap[h].count += 1;
      hourlyMap[h].total += o.total ?? 0;
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

async function getRestaurantInsights(supabase: any, restaurantId: string) {
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
  for (const o of orders ?? []) {
    const h = new Date(o.created_at).getHours();
    if (hourlyMap[h]) {
      hourlyMap[h].count += 1;
      hourlyMap[h].total += o.total ?? 0;
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

async function getDemandForecast(supabase: any) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { data: orders } = await supabase
    .from('orders')
    .select('created_at, status')
    .gte('created_at', sevenDaysAgo.toISOString());

  const hourlyMap: Record<number, { count: number; cancelled: number; delivered: number; total: number }> = {};
  for (let h = 0; h < 24; h++) hourlyMap[h] = { count: 0, cancelled: 0, delivered: 0, total: 0 };
  for (const o of orders ?? []) {
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
