/**
 * Business Intelligence Service
 * ──────────────────────────────
 * Aggregated analytics for admin dashboards:
 *  - Peak hours
 *  - Top restaurants/products
 *  - Driver utilization
 *  - Customer retention
 *  - Cancellation reasons
 */

import { createServiceClient } from '@/lib/supabase/service';

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

export interface PeakHour {
  hour: number;
  count: number;
  revenue: number;
}

export interface BusinessIntelligence {
  peakHours: PeakHour[];
  topRestaurants: Array<{ id: string; name: string; orders: number; revenue: number }>;
  topProducts: Array<{ id: string; name: string; orders: number; revenue: number }>;
  avgPreparationMin: number;
  avgDeliveryMin: number;
  driverUtilization: number;
  zoneDemand: Array<{ zone: string; orders: number }>;
  customerRetention: number;
  repeatCustomers: number;
  cancellationReasons: Array<{ reason: string; count: number }>;
}

export async function getBusinessIntelligence(): Promise<BusinessIntelligence> {
  const cached = cacheGet<BusinessIntelligence>('ops:bi');
  if (cached) return cached;

  const svc = createServiceClient();
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    ordersRes,
    productsRes,
    customersRes,
    deliveryTimesRes,
  ] = await Promise.all([
    svc.from('orders')
      .select('id, total, created_at, delivered_at, cancelled_at, status, restaurant_id, customer_id, cancellation_reason, restaurants(name), order_items(product_id, product_name, quantity, subtotal)')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .in('status', ['delivered', 'cancelled'])
      .limit(2000),
    svc.from('products')
      .select('id, name, sold_count')
      .order('sold_count', { ascending: false })
      .limit(20),
    svc.from('users')
      .select('id, created_at')
      .eq('role', 'customer')
      .limit(2000),
    svc.from('orders')
      .select('id, created_at, accepted_at, prepared_at, picked_up_at, delivered_at')
      .eq('status', 'delivered')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .limit(1000),
  ]);

  // Peak hours
  const hourMap = new Map<number, { count: number; revenue: number }>();
  for (const o of ordersRes.data ?? []) {
    const h = new Date(o.created_at).getHours();
    const cur = hourMap.get(h) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(o.total ?? 0);
    hourMap.set(h, cur);
  }
  const peakHours: PeakHour[] = Array.from(hourMap.entries())
    .map(([hour, v]) => ({ hour, ...v }))
    .sort((a, b) => b.count - a.count);

  // Top restaurants
  const restMap = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const o of ordersRes.data ?? []) {
    const id = o.restaurant_id;
    const name = (o as any).restaurants?.name ?? 'Unknown';
    const cur = restMap.get(id) ?? { name, orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += Number(o.total ?? 0);
    restMap.set(id, cur);
  }
  const topRestaurants = Array.from(restMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Top products (aggregate from order_items)
  const prodMap = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const o of ordersRes.data ?? []) {
    const items = (o as any).order_items ?? [];
    for (const it of items) {
      const id = it.product_id;
      const cur = prodMap.get(id) ?? { name: it.product_name ?? 'Unknown', orders: 0, revenue: 0 };
      cur.orders += Number(it.quantity ?? 1);
      cur.revenue += Number(it.subtotal ?? 0);
      prodMap.set(id, cur);
    }
  }
  // Also use the sold_count for the leaderboard
  const topProducts = Array.from(prodMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  // Avg preparation time (accepted_at → prepared_at)
  const prepTimes: number[] = [];
  // Avg delivery time (picked_up_at → delivered_at)
  const delivTimes: number[] = [];
  for (const o of deliveryTimesRes.data ?? []) {
    if (o.accepted_at && o.prepared_at) {
      const min = (new Date(o.prepared_at).getTime() - new Date(o.accepted_at).getTime()) / 60000;
      if (min > 0 && min < 120) prepTimes.push(min);
    }
    if (o.picked_up_at && o.delivered_at) {
      const min = (new Date(o.delivered_at).getTime() - new Date(o.picked_up_at).getTime()) / 60000;
      if (min > 0 && min < 240) delivTimes.push(min);
    }
  }
  const avgPreparationMin = prepTimes.length > 0 ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length : 0;
  const avgDeliveryMin = delivTimes.length > 0 ? delivTimes.reduce((a, b) => a + b, 0) / delivTimes.length : 0;

  // Customer retention: % of customers who ordered 2+ times in last 30 days
  const customerOrderCount = new Map<string, number>();
  for (const o of ordersRes.data ?? []) {
    const c = o.customer_id;
    customerOrderCount.set(c, (customerOrderCount.get(c) ?? 0) + 1);
  }
  let repeatCount = 0;
  let totalActiveCustomers = 0;
  for (const [_, count] of customerOrderCount) {
    totalActiveCustomers += 1;
    if (count >= 2) repeatCount += 1;
  }
  const customerRetention = totalActiveCustomers > 0 ? (repeatCount / totalActiveCustomers) * 100 : 0;

  // Driver utilization: % of time drivers are on delivery (approximated)
  // Use is_on_delivery counts vs. is_online
  const [onDelRes, onLineRes] = await Promise.all([
    svc.from('driver_status').select('driver_id', { count: 'exact', head: true }).eq('is_on_delivery', true),
    svc.from('driver_status').select('driver_id', { count: 'exact', head: true }).eq('is_online', true),
  ]);
  const driverUtilization = (onLineRes.count ?? 0) > 0
    ? ((onDelRes.count ?? 0) / (onLineRes.count ?? 0)) * 100
    : 0;

  // Cancellation reasons
  const reasonMap = new Map<string, number>();
  for (const o of ordersRes.data ?? []) {
    if (o.status === 'cancelled') {
      const r = (o as any).cancellation_reason ?? 'unspecified';
      reasonMap.set(r, (reasonMap.get(r) ?? 0) + 1);
    }
  }
  const cancellationReasons = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Zone demand (very approximate: bucket by customer_latitude first 2 decimals)
  const zoneMap = new Map<string, number>();
  // We don't have customer_lat in ordersRes (it was excluded). Skip for now.
  // Use restaurant zones as a proxy
  for (const o of ordersRes.data ?? []) {
    const id = o.restaurant_id;
    zoneMap.set(id, (zoneMap.get(id) ?? 0) + 1);
  }
  const zoneDemand = Array.from(zoneMap.entries())
    .map(([zone, orders]) => ({ zone, orders }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  const result: BusinessIntelligence = {
    peakHours: peakHours.slice(0, 12),
    topRestaurants,
    topProducts,
    avgPreparationMin,
    avgDeliveryMin,
    driverUtilization,
    zoneDemand,
    customerRetention,
    repeatCustomers: repeatCount,
    cancellationReasons,
  };

  cacheSet('ops:bi', result, 60_000); // 1 min cache
  return result;
}

// ─────────────────────────────────────────────────────────────

export function clearBICache(): void { cache.clear(); }
