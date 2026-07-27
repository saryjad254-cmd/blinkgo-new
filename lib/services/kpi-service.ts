/**
 * KPI Service — Real-Time Operational Metrics
 * ────────────────────────────────────────────
 * Live KPIs for admin dashboards. Aggregates order/driver/restaurant
 * data with 15s cache TTL.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';

export interface LiveKPIs {
  activeOrders: number;
  onlineDrivers: number;
  activeRestaurants: number;
  pendingOrders: number;
  avgDeliveryTimeMin: number;
  cancellationRate: number;
  completionRate: number;
  totalRevenueToday: number;
  totalOrdersToday: number;
  totalRevenueWeek: number;
  totalOrdersWeek: number;
  totalRevenueMonth: number;
  totalOrdersMonth: number;
  totalCustomers: number;
  newCustomersToday: number;
  avgOrderValue: number;
}

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

export async function getLiveKPIs(): Promise<LiveKPIs> {
  const cached = cacheGet<LiveKPIs>('ops:live-kpis');
  if (cached) return cached;

  const svc = createServiceClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 30);

  const [
    activeOrdersRes,
    onlineDriversRes,
    activeRestaurantsRes,
    pendingOrdersRes,
    deliveredRecentRes,
    customersRes,
    newCustomersRes,
    recentOrdersRes,
  ] = await Promise.all([
    svc.from('orders').select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'preparing', 'ready', 'picked_up', 'delivering']),
    svc.from('driver_status').select('driver_id', { count: 'exact', head: true }).eq('is_online', true),
    svc.from('restaurants').select('id', { count: 'exact', head: true }).eq('is_active', true),
    svc.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    svc.from('orders')
      .select('id, total, delivered_at, created_at, status, accepted_at, picked_up_at')
      .gte('created_at', monthStart.toISOString())
      .in('status', ['delivered', 'cancelled']),
    svc.from('users').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
    svc.from('users').select('id', { count: 'exact', head: true })
      .eq('role', 'customer')
      .gte('created_at', todayStart.toISOString()),
    svc.from('orders')
      .select('id, total, status, created_at, delivered_at, picked_up_at, accepted_at')
      .gte('created_at', monthStart.toISOString()),
  ]);

  const activeOrders = activeOrdersRes.count ?? 0;
  const onlineDrivers = onlineDriversRes.count ?? 0;
  const activeRestaurants = activeRestaurantsRes.count ?? 0;
  const pendingOrders = pendingOrdersRes.count ?? 0;
  const totalCustomers = customersRes.count ?? 0;
  const newCustomersToday = newCustomersRes.count ?? 0;

  // Compute averages from delivered orders
  const delivered = deliveredRecentRes.data || [];
  const totalDelivered = delivered.filter(o => o.status === 'delivered').length;
  const totalCancelled = delivered.filter(o => o.status === 'cancelled').length;
  const totalClosed = totalDelivered + totalCancelled;
  const completionRate = totalClosed > 0 ? (totalDelivered / totalClosed) * 100 : 100;
  const cancellationRate = totalClosed > 0 ? (totalCancelled / totalClosed) * 100 : 0;

  // Avg delivery time
  const deliveredWithTimes = delivered.filter(o => o.status === 'delivered' && o.delivered_at && o.accepted_at);
  let avgDeliveryTimeMin = 0;
  if (deliveredWithTimes.length > 0) {
    const totalMin = deliveredWithTimes.reduce((acc, o) => {
      const accepted = new Date(o.accepted_at!).getTime();
      const deliveredAt = new Date(o.delivered_at!).getTime();
      return acc + (deliveredAt - accepted) / 60000;
    }, 0);
    avgDeliveryTimeMin = Math.round(totalMin / deliveredWithTimes.length);
  }

  // Revenue aggregation
  const orders = recentOrdersRes.data || [];
  const sumRevenue = (since: Date) => orders
    .filter(o => o.status === 'delivered' && new Date(o.created_at) >= since)
    .reduce((acc, o) => acc + (o.total || 0), 0);
  const countOrders = (since: Date) => orders
    .filter(o => o.status === 'delivered' && new Date(o.created_at) >= since).length;

  const totalRevenueToday = sumRevenue(todayStart);
  const totalOrdersToday = countOrders(todayStart);
  const totalRevenueWeek = sumRevenue(weekStart);
  const totalOrdersWeek = countOrders(weekStart);
  const totalRevenueMonth = sumRevenue(monthStart);
  const totalOrdersMonth = countOrders(monthStart);
  const avgOrderValue = totalOrdersMonth > 0 ? totalRevenueMonth / totalOrdersMonth : 0;

  const result: LiveKPIs = {
    activeOrders,
    onlineDrivers,
    activeRestaurants,
    pendingOrders,
    avgDeliveryTimeMin,
    cancellationRate,
    completionRate,
    totalRevenueToday,
    totalOrdersToday,
    totalRevenueWeek,
    totalOrdersWeek,
    totalRevenueMonth,
    totalOrdersMonth,
    totalCustomers,
    newCustomersToday,
    avgOrderValue,
  };

  cacheSet('ops:live-kpis', result, 15_000);
  return result;
}

export function clearKPICache(): void {
  cache.clear();
}
