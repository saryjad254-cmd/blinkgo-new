/**
 * Restaurant Intelligence Library
 * ──────────────────────────────
 * Prep efficiency, SLA, peak hours, product performance.
 */

export interface RestaurantOrderRow {
  id: string;
  restaurant_id: string;
  total: number;
  status: string;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}

export interface RestaurantItemRow {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  order_id: string;
  restaurant_id: string;
  created_at: string;
}

export interface RestaurantMetrics {
  restaurant_id: string;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  cancel_rate: number;
  avg_prep_minutes: number;
  sla_compliance: number; // 0-1
  peak_hours: number[]; // 24 hours
  total_revenue: number;
  avg_rating: number;
  cancellation_reasons: Record<string, number>;
}

export const SLA_TARGET_PREP_MINUTES = 25;

export function computeRestaurantMetrics(
  orders: RestaurantOrderRow[],
  items: RestaurantItemRow[]
): Map<string, RestaurantMetrics> {
  const byRestaurant = new Map<string, RestaurantOrderRow[]>();
  for (const o of orders) {
    if (!byRestaurant.has(o.restaurant_id)) byRestaurant.set(o.restaurant_id, []);
    byRestaurant.get(o.restaurant_id)!.push(o);
  }

  const metricsMap = new Map<string, RestaurantMetrics>();
  for (const [rid, rOrders] of byRestaurant) {
    const completed = rOrders.filter((o) => o.status === 'delivered');
    const cancelled = rOrders.filter((o) => o.status === 'cancelled');

    // Prep time = ready_at - accepted_at (in minutes)
    const prepTimes: number[] = [];
    for (const o of completed) {
      if (o.accepted_at && o.ready_at) {
        const mins = (new Date(o.ready_at).getTime() - new Date(o.accepted_at).getTime()) / 60000;
        if (mins > 0 && mins < 180) prepTimes.push(mins);
      }
    }
    const avgPrep = prepTimes.length > 0 ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length : 0;
    const sla = prepTimes.length > 0 ? prepTimes.filter((p) => p <= SLA_TARGET_PREP_MINUTES).length / prepTimes.length : 0;

    // Peak hours
    const peakHours = new Array(24).fill(0);
    for (const o of rOrders) {
      const h = new Date(o.created_at).getHours();
      peakHours[h] += 1;
    }

    // Cancellation reasons
    const reasons: Record<string, number> = {};
    for (const o of cancelled) {
      const r = o.cancellation_reason || 'unknown';
      reasons[r] = (reasons[r] || 0) + 1;
    }

    const totalRevenue = completed.reduce((s, o) => s + (o.total ?? 0), 0);

    metricsMap.set(rid, {
      restaurant_id: rid,
      total_orders: rOrders.length,
      completed_orders: completed.length,
      cancelled_orders: cancelled.length,
      cancel_rate: rOrders.length > 0 ? cancelled.length / rOrders.length : 0,
      avg_prep_minutes: avgPrep,
      sla_compliance: sla,
      peak_hours: peakHours,
      total_revenue: totalRevenue,
      avg_rating: 0, // filled from restaurant_ratings if available
      cancellation_reasons: reasons,
    });
  }
  return metricsMap;
}

export interface ProductPerformance {
  product_id: string;
  product_name: string;
  restaurant_id: string;
  units_sold: number;
  revenue: number;
  share_of_orders: number;
}

export function computeProductPerformance(
  items: RestaurantItemRow[],
  totalOrders: number
): ProductPerformance[] {
  const byProduct = new Map<string, RestaurantItemRow[]>();
  for (const it of items) {
    if (!byProduct.has(it.product_id)) byProduct.set(it.product_id, []);
    byProduct.get(it.product_id)!.push(it);
  }
  const perf: ProductPerformance[] = [];
  for (const [pid, pItems] of byProduct) {
    const units = pItems.reduce((s, i) => s + i.quantity, 0);
    const revenue = pItems.reduce((s, i) => s + (i.total ?? 0), 0);
    perf.push({
      product_id: pid,
      product_name: pItems[0].product_name,
      restaurant_id: pItems[0].restaurant_id,
      units_sold: units,
      revenue,
      share_of_orders: totalOrders > 0 ? pItems.length / totalOrders : 0,
    });
  }
  return perf.sort((a, b) => b.revenue - a.revenue);
}

export function getTopSellingProducts(items: RestaurantItemRow[], topN: number = 10): ProductPerformance[] {
  const perf = computeProductPerformance(items, items.length);
  return perf.slice(0, topN);
}

export function getPeakHourInsight(metrics: RestaurantMetrics): { peak: number[]; busy_pct: number } {
  const total = metrics.peak_hours.reduce((a, b) => a + b, 0);
  const busy = metrics.peak_hours.filter((h) => h > total / 24).map((_, i) => i);
  return { peak: busy, busy_pct: total > 0 ? busy.length / 24 : 0 };
}
