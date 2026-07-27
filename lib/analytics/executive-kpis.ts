/**
 * Executive KPIs Library
 * ─────────────────────
 * Computes top-level business metrics:
 * - GMV (Gross Merchandise Value)
 * - Revenue (commission + delivery fees)
 * - Net Profit (revenue - costs)
 * - Active counts
 * - Churn
 * - Retention
 * - LTV
 * - CAC
 */

export interface OrderRow {
  id: string;
  customer_id: string;
  driver_id: string | null;
  restaurant_id: string;
  total: number;
  tip: number;
  delivery_fee: number;
  commission: number;
  status: string;
  created_at: string;
  delivered_at: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  ready_at?: string | null;
  picked_up_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  [key: string]: any;
}

export interface KPIPeriod {
  start: Date;
  end: Date;
}

export interface ExecutiveKPIs {
  // Volume
  gmv: number;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  // Revenue
  gross_revenue: number;
  commission_revenue: number;
  delivery_fee_revenue: number;
  tip_revenue: number;
  net_revenue: number; // commission + delivery_fee - refunds
  // Costs (estimated)
  payment_processing_fees: number;
  estimated_costs: number;
  // Profit
  gross_profit: number;
  profit_margin: number; // 0-1
  // Counts
  active_customers: number;
  new_customers: number;
  active_drivers: number;
  active_restaurants: number;
  // Engagement
  orders_per_active_customer: number;
  average_order_value: number;
  // Time
  orders_per_hour: number;
  orders_per_day: number;
}

export function computeExecutiveKPIs(
  orders: OrderRow[],
  customers: Array<{ id: string; created_at: string; last_order_at?: string | null }>,
  drivers: Array<{ id: string; is_active: boolean }>,
  restaurants: Array<{ id: string; is_active: boolean }>,
  period: KPIPeriod
): ExecutiveKPIs {
  const periodOrders = orders.filter(
    (o) => new Date(o.created_at) >= period.start && new Date(o.created_at) <= period.end
  );
  const completed = periodOrders.filter((o) => o.status === 'delivered');
  const cancelled = periodOrders.filter((o) => o.status === 'cancelled');

  const gmv = completed.reduce((s, o) => s + (o.total ?? 0), 0);
  const commissionRevenue = completed.reduce((s, o) => s + (o.commission ?? 0), 0);
  const deliveryFeeRevenue = completed.reduce((s, o) => s + (o.delivery_fee ?? 0), 0);
  const tipRevenue = completed.reduce((s, o) => s + (o.tip ?? 0), 0);
  const grossRevenue = gmv;
  const netRevenue = commissionRevenue + deliveryFeeRevenue;
  // Stripe-like fees: 2.9% + €0.30 per transaction
  const paymentProcessingFees = completed.length * 0.3 + grossRevenue * 0.029;
  const estimatedCosts = paymentProcessingFees + grossRevenue * 0.05; // 5% ops
  const grossProfit = netRevenue - estimatedCosts;
  const profitMargin = netRevenue > 0 ? grossProfit / netRevenue : 0;

  const activeCustomersSet = new Set(completed.map((o) => o.customer_id));
  const newCustomers = customers.filter(
    (c) => new Date(c.created_at) >= period.start && new Date(c.created_at) <= period.end
  ).length;
  const activeDrivers = drivers.filter((d) => d.is_active).length;
  const activeRestaurants = restaurants.filter((r) => r.is_active).length;

  const periodHours = Math.max(1, (period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60));
  const periodDays = Math.max(1, periodHours / 24);

  return {
    gmv,
    total_orders: periodOrders.length,
    completed_orders: completed.length,
    cancelled_orders: cancelled.length,
    gross_revenue: grossRevenue,
    commission_revenue: commissionRevenue,
    delivery_fee_revenue: deliveryFeeRevenue,
    tip_revenue: tipRevenue,
    net_revenue: netRevenue,
    payment_processing_fees: paymentProcessingFees,
    estimated_costs: estimatedCosts,
    gross_profit: grossProfit,
    profit_margin: profitMargin,
    active_customers: activeCustomersSet.size,
    new_customers: newCustomers,
    active_drivers: activeDrivers,
    active_restaurants: activeRestaurants,
    orders_per_active_customer: activeCustomersSet.size > 0 ? completed.length / activeCustomersSet.size : 0,
    average_order_value: completed.length > 0 ? gmv / completed.length : 0,
    orders_per_hour: completed.length / periodHours,
    orders_per_day: completed.length / periodDays,
  };
}

/**
 * Compute growth metrics (current period vs previous).
 */
export function computeGrowth(current: ExecutiveKPIs, previous: ExecutiveKPIs): Record<string, number> {
  const growth: Record<string, number> = {};
  for (const key of Object.keys(current) as Array<keyof ExecutiveKPIs>) {
    const curr = current[key];
    const prev = previous[key];
    if (typeof curr === 'number' && typeof prev === 'number' && prev !== 0) {
      growth[key] = (curr - prev) / prev;
    } else {
      growth[key] = 0;
    }
  }
  return growth;
}
