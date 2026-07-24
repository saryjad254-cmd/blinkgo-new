/**
 * Restaurant Analytics Service
 * ────────────────────────────
 * Per-restaurant performance metrics for restaurant dashboards.
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

export interface RestaurantKPIs {
  todayOrders: number;
  todayRevenue: number;
  activeOrders: number;
  avgPreparationMin: number;
  acceptanceRate: number;
  completionRate: number;
  avgRating: number;
  totalOrders: number;
}

export async function getRestaurantKPIs(restaurantId: string): Promise<RestaurantKPIs> {
  const cached = cacheGet<RestaurantKPIs>(`ops:rest-kpis:${restaurantId}`);
  if (cached) return cached;

  const svc = createServiceClient();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(todayStart); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [todayRes, recentRes, activeRes, restaurantRes] = await Promise.all([
    svc.from('orders')
      .select('id, total, status')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', todayStart.toISOString()),
    svc.from('orders')
      .select('id, total, status, created_at, accepted_at, prepared_at, cancelled_at, cancellation_reason')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', thirtyDaysAgo.toISOString()),
    svc.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'picked_up']),
    svc.from('restaurants')
      .select('rating, review_count')
      .eq('id', restaurantId)
      .single(),
  ]);

  const todayOrders = todayRes.data?.length ?? 0;
  const todayRevenue = (todayRes.data ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
  const activeOrders = activeRes.count ?? 0;

  let accepted = 0;
  let completed = 0;
  let cancelled = 0;
  let total = 0;
  const prepTimes: number[] = [];
  for (const o of recentRes.data ?? []) {
    total += 1;
    if (o.status === 'cancelled') {
      cancelled += 1;
    } else {
      accepted += 1;
      if (o.status === 'delivered') {
        completed += 1;
        if (o.accepted_at && o.prepared_at) {
          const min = (new Date(o.prepared_at).getTime() - new Date(o.accepted_at).getTime()) / 60000;
          if (min > 0 && min < 120) prepTimes.push(min);
        }
      }
    }
  }
  const acceptanceRate = total > 0 ? (accepted / total) * 100 : 100;
  const completionRate = accepted > 0 ? (completed / accepted) * 100 : 100;
  const avgPreparationMin = prepTimes.length > 0 ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length : 0;

  const result: RestaurantKPIs = {
    todayOrders,
    todayRevenue,
    activeOrders,
    avgPreparationMin,
    acceptanceRate,
    completionRate,
    avgRating: Number(restaurantRes.data?.rating ?? 0),
    totalOrders: total,
  };
  cacheSet(`ops:rest-kpis:${restaurantId}`, result, 30_000);
  return result;
}

// ─────────────────────────────────────────────────────────────

export function clearRestaurantKPIsCache(): void { cache.clear(); }
