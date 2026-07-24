/**
 * Customer Analytics Library
 * ─────────────────────────
 * LTV, cohorts, segmentation, churn prediction.
 */

export interface CustomerOrder {
  customer_id: string;
  total: number;
  created_at: string;
}

export interface CustomerStats {
  customer_id: string;
  order_count: number;
  total_spent: number;
  first_order_at: string;
  last_order_at: string;
  avg_basket: number;
  purchase_frequency_days: number;
  days_since_last_order: number;
}

/**
 * Compute per-customer stats.
 */
export function computeCustomerStats(orders: CustomerOrder[], now: Date = new Date()): CustomerStats[] {
  const byCustomer = new Map<string, CustomerOrder[]>();
  for (const o of orders) {
    if (!byCustomer.has(o.customer_id)) byCustomer.set(o.customer_id, []);
    byCustomer.get(o.customer_id)!.push(o);
  }

  const stats: CustomerStats[] = [];
  for (const [cid, cOrders] of byCustomer) {
    const sorted = cOrders.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const totalSpent = sorted.reduce((s, o) => s + (o.total ?? 0), 0);
    const first = new Date(sorted[0].created_at);
    const last = new Date(sorted[sorted.length - 1].created_at);
    const daysBetween = Math.max(1, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
    const purchaseFrequency = sorted.length > 1 ? daysBetween / (sorted.length - 1) : daysBetween;
    const daysSinceLast = Math.max(0, (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

    stats.push({
      customer_id: cid,
      order_count: sorted.length,
      total_spent: totalSpent,
      first_order_at: sorted[0].created_at,
      last_order_at: sorted[sorted.length - 1].created_at,
      avg_basket: totalSpent / sorted.length,
      purchase_frequency_days: purchaseFrequency,
      days_since_last_order: daysSinceLast,
    });
  }

  return stats;
}

/**
 * Compute Customer Lifetime Value.
 * Method: avg_basket × purchase_frequency × projected_lifetime × margin
 */
export function computeLTV(
  stats: CustomerStats[],
  options: { averageProjectedMonths?: number; marginPct?: number } = {}
): { avg_ltv: number; total_ltv: number; ltv_by_segment: Record<string, number> } {
  const projectedMonths = options.averageProjectedMonths ?? 24;
  const marginPct = options.marginPct ?? 0.15;
  const projectedLifetimeYears = projectedMonths / 12;

  let totalLtv = 0;
  for (const s of stats) {
    const ordersPerYear = s.purchase_frequency_days > 0 ? 365 / s.purchase_frequency_days : 0;
    const annualRevenue = s.avg_basket * ordersPerYear;
    const ltv = annualRevenue * projectedLifetimeYears * marginPct;
    s['ltv' as keyof CustomerStats] = ltv as never;
    totalLtv += ltv;
  }
  return {
    avg_ltv: stats.length > 0 ? totalLtv / stats.length : 0,
    total_ltv: totalLtv,
    ltv_by_segment: {},
  };
}

/**
 * Cohort retention analysis.
 * Groups customers by first-order month, computes retention for each subsequent month.
 */
export function computeCohortRetention(orders: CustomerOrder[]): Array<{
  cohort: string; // YYYY-MM
  size: number;
  retention: number[]; // array of retention rates per month offset
}> {
  const byCustomer = new Map<string, CustomerOrder[]>();
  for (const o of orders) {
    if (!byCustomer.has(o.customer_id)) byCustomer.set(o.customer_id, []);
    byCustomer.get(o.customer_id)!.push(o);
  }

  const cohortMap = new Map<string, Set<string>>(); // cohort_month -> set of active customer_ids per offset
  const cohortSizes = new Map<string, number>();

  for (const [cid, cOrders] of byCustomer) {
    const sorted = cOrders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const cohort = sorted[0].created_at.substring(0, 7); // YYYY-MM
    if (!cohortMap.has(cohort)) cohortMap.set(cohort, new Set());
    if (!cohortSizes.has(cohort)) cohortSizes.set(cohort, 0);
    cohortSizes.set(cohort, cohortSizes.get(cohort)! + 1);
    for (const o of sorted) {
      const month = o.created_at.substring(0, 7);
      cohortMap.get(cohort)!.add(`${cid}_${month}`);
    }
  }

  const cohorts: Array<{ cohort: string; size: number; retention: number[] }> = [];
  const sortedCohorts = Array.from(cohortSizes.keys()).sort();
  for (const c of sortedCohorts) {
    const size = cohortSizes.get(c)!;
    const cDate = new Date(c + '-01');
    const months: number[] = [];
    for (let i = 0; i < 12; i++) {
      const target = new Date(cDate);
      target.setMonth(cDate.getMonth() + i);
      const key = target.toISOString().substring(0, 7);
      const active = cohortMap.get(c) || new Set();
      const activeInMonth = new Set(Array.from(active).filter((x) => x.endsWith(`_${key}`))).size;
      months.push(size > 0 ? activeInMonth / size : 0);
    }
    cohorts.push({ cohort: c, size, retention: months });
  }
  return cohorts;
}

/**
 * Segment customers by behavior.
 * Segments: VIP, Active, At-Risk, Lapsed, New
 */
export function segmentCustomers(stats: CustomerStats[], now: Date = new Date()): Record<string, CustomerStats[]> {
  const segments: Record<string, CustomerStats[]> = {
    vip: [],
    active: [],
    at_risk: [],
    lapsed: [],
    new: [],
  };

  for (const s of stats) {
    const days = s.days_since_last_order;
    if (s.total_spent >= 500) {
      segments.vip.push(s);
    } else if (days <= 14 && s.order_count >= 1) {
      segments.active.push(s);
    } else if (days > 14 && days <= 45 && s.order_count >= 1) {
      segments.at_risk.push(s);
    } else if (days > 45) {
      segments.lapsed.push(s);
    } else {
      segments.new.push(s);
    }
  }

  return segments;
}

/**
 * Predict churn probability.
 * Heuristic: based on days_since_last_order vs purchase_frequency.
 */
export function predictChurn(
  stats: CustomerStats[],
  options: { churnThresholdRatio?: number } = {}
): Map<string, number> {
  const ratio = options.churnThresholdRatio ?? 2.5;
  const churnMap = new Map<string, number>();
  for (const s of stats) {
    if (s.order_count <= 1) {
      churnMap.set(s.customer_id, 0.5); // unknown
      continue;
    }
    const expected = s.purchase_frequency_days;
    const actual = s.days_since_last_order;
    if (actual >= expected * ratio) {
      // very likely churned
      churnMap.set(s.customer_id, Math.min(1, actual / (expected * 4)));
    } else if (actual >= expected * 1.5) {
      // at risk
      churnMap.set(s.customer_id, 0.5);
    } else {
      churnMap.set(s.customer_id, Math.max(0, 0.3 - actual / 1000));
    }
  }
  return churnMap;
}

/**
 * Repeat purchase rate.
 */
export function computeRepeatRate(stats: CustomerStats[]): number {
  const repeat = stats.filter((s) => s.order_count >= 2).length;
  return stats.length > 0 ? repeat / stats.length : 0;
}
