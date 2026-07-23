/**
 * Executive Reports Library
 * ────────────────────────
 * Auto-generates daily, weekly, monthly executive reports.
 */

import type { ExecutiveKPIs } from './executive-kpis';
import type { DriverMetrics } from './driver-intelligence';
import type { RestaurantMetrics } from './restaurant-intelligence';

export type ReportSeverity = 'critical' | 'warning' | 'info' | 'positive';
export type ReportCategory = 'risk' | 'opportunity' | 'growth' | 'decline' | 'operational';

export interface ReportItem {
  category: ReportCategory;
  severity: ReportSeverity;
  title: string;
  description: string;
  metric?: string;
  action?: string;
}

export interface ExecutiveReport {
  period: 'daily' | 'weekly' | 'monthly';
  generated_at: string;
  period_start: string;
  period_end: string;
  highlights: ReportItem[];
  summary: {
    gmv: number;
    orders: number;
    new_customers: number;
    profit_margin: number;
  };
  recommendations: string[];
}

export function generateDailyReport(
  todayKPIs: ExecutiveKPIs,
  yesterdayKPIs: ExecutiveKPIs
): ExecutiveReport {
  const items: ReportItem[] = [];

  // GMV change
  if (todayKPIs.gmv > yesterdayKPIs.gmv * 1.1) {
    items.push({
      category: 'growth',
      severity: 'positive',
      title: 'GMV up significantly',
      description: `GMV increased ${((todayKPIs.gmv / Math.max(1, yesterdayKPIs.gmv) - 1) * 100).toFixed(1)}% from yesterday`,
      metric: `€${todayKPIs.gmv.toFixed(0)}`,
    });
  } else if (todayKPIs.gmv < yesterdayKPIs.gmv * 0.9) {
    items.push({
      category: 'decline',
      severity: 'warning',
      title: 'GMV declined',
      description: `GMV dropped ${((1 - todayKPIs.gmv / Math.max(1, yesterdayKPIs.gmv)) * 100).toFixed(1)}% from yesterday`,
      metric: `€${todayKPIs.gmv.toFixed(0)}`,
      action: 'Investigate: marketing spend, competitor activity, or app issues',
    });
  }

  // Profit margin
  if (todayKPIs.profit_margin < 0.05) {
    items.push({
      category: 'risk',
      severity: 'critical',
      title: 'Critical profit margin',
      description: `Profit margin is ${(todayKPIs.profit_margin * 100).toFixed(1)}% — below sustainable level`,
      metric: `${(todayKPIs.profit_margin * 100).toFixed(1)}%`,
      action: 'Reduce fees, optimize commission, or pass costs to consumers',
    });
  } else if (todayKPIs.profit_margin > 0.2) {
    items.push({
      category: 'opportunity',
      severity: 'positive',
      title: 'Strong profit margin',
      description: `Profit margin of ${(todayKPIs.profit_margin * 100).toFixed(1)}% opens investment opportunities`,
      metric: `${(todayKPIs.profit_margin * 100).toFixed(1)}%`,
    });
  }

  // Cancellation spike
  if (todayKPIs.cancelled_orders > todayKPIs.completed_orders * 0.1) {
    items.push({
      category: 'operational',
      severity: 'warning',
      title: 'High cancellation rate',
      description: `${todayKPIs.cancelled_orders} cancellations today (>10% of completed)`,
      metric: `${((todayKPIs.cancelled_orders / Math.max(1, todayKPIs.completed_orders)) * 100).toFixed(1)}%`,
      action: 'Audit restaurant performance, driver availability',
    });
  }

  // Active customers
  if (todayKPIs.active_customers > yesterdayKPIs.active_customers * 1.2) {
    items.push({
      category: 'growth',
      severity: 'positive',
      title: 'Customer base growing',
      description: `Active customers up ${((todayKPIs.active_customers / Math.max(1, yesterdayKPIs.active_customers) - 1) * 100).toFixed(1)}%`,
      metric: `${todayKPIs.active_customers}`,
    });
  }

  // Order rate
  const hourNow = new Date().getHours();
  if (hourNow >= 18 && todayKPIs.orders_per_hour < yesterdayKPIs.orders_per_hour * 0.7) {
    items.push({
      category: 'risk',
      severity: 'warning',
      title: 'Dinner hour underperformance',
      description: `Order rate during dinner hour is significantly below yesterday`,
      action: 'Send push notification, activate surge zones, recruit on-duty drivers',
    });
  }

  return {
    period: 'daily',
    generated_at: new Date().toISOString(),
    period_start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    period_end: new Date().toISOString(),
    highlights: items,
    summary: {
      gmv: todayKPIs.gmv,
      orders: todayKPIs.completed_orders,
      new_customers: todayKPIs.new_customers,
      profit_margin: todayKPIs.profit_margin,
    },
    recommendations: items.filter((i) => i.action).map((i) => i.action!).slice(0, 5),
  };
}

export function generateWeeklyReport(
  thisWeek: ExecutiveKPIs,
  lastWeek: ExecutiveKPIs,
  driverMetrics: DriverMetrics[]
): ExecutiveReport {
  const items: ReportItem[] = [];
  const gmvGrowth = (thisWeek.gmv / Math.max(1, lastWeek.gmv) - 1) * 100;
  const customerGrowth = (thisWeek.active_customers / Math.max(1, lastWeek.active_customers) - 1) * 100;
  const orderGrowth = (thisWeek.completed_orders / Math.max(1, lastWeek.completed_orders) - 1) * 100;

  items.push({
    category: gmvGrowth > 5 ? 'growth' : gmvGrowth < -5 ? 'decline' : 'operational',
    severity: gmvGrowth > 10 ? 'positive' : gmvGrowth < -10 ? 'critical' : 'info',
    title: `Weekly GMV ${gmvGrowth > 0 ? 'up' : 'down'} ${Math.abs(gmvGrowth).toFixed(1)}%`,
    description: `Total GMV this week: €${thisWeek.gmv.toFixed(0)} vs €${lastWeek.gmv.toFixed(0)} last week`,
    metric: `${gmvGrowth > 0 ? '+' : ''}${gmvGrowth.toFixed(1)}%`,
  });

  items.push({
    category: customerGrowth > 5 ? 'growth' : 'decline',
    severity: 'info',
    title: `Customer base ${customerGrowth > 0 ? 'grew' : 'shrank'} ${Math.abs(customerGrowth).toFixed(1)}%`,
    description: `${thisWeek.active_customers} active customers vs ${lastWeek.active_customers}`,
    metric: `${customerGrowth > 0 ? '+' : ''}${customerGrowth.toFixed(1)}%`,
  });

  // Driver performance
  const avgAcceptance = average(driverMetrics.map((d) => d.acceptance_rate));
  if (avgAcceptance < 0.6) {
    items.push({
      category: 'operational',
      severity: 'warning',
      title: 'Driver acceptance rate below target',
      description: `Average acceptance rate is ${(avgAcceptance * 100).toFixed(0)}% (target: 70%+)`,
      action: 'Survey low-acceptance drivers, increase base pay during slow hours',
    });
  }

  // Order rate
  if (orderGrowth > 10) {
    items.push({
      category: 'opportunity',
      severity: 'positive',
      title: 'Order growth acceleration',
      description: `Orders up ${orderGrowth.toFixed(1)}% — consider scaling marketing spend`,
    });
  }

  return {
    period: 'weekly',
    generated_at: new Date().toISOString(),
    period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    period_end: new Date().toISOString(),
    highlights: items,
    summary: {
      gmv: thisWeek.gmv,
      orders: thisWeek.completed_orders,
      new_customers: thisWeek.new_customers,
      profit_margin: thisWeek.profit_margin,
    },
    recommendations: items.filter((i) => i.action).map((i) => i.action!).slice(0, 5),
  };
}

export function generateMonthlyReport(
  thisMonth: ExecutiveKPIs,
  lastMonth: ExecutiveKPIs
): ExecutiveReport {
  const items: ReportItem[] = [];
  const gmvGrowth = (thisMonth.gmv / Math.max(1, lastMonth.gmv) - 1) * 100;
  const profitGrowth = (thisMonth.gross_profit / Math.max(1, lastMonth.gross_profit) - 1) * 100;
  const orderGrowth = (thisMonth.completed_orders / Math.max(1, lastMonth.completed_orders) - 1) * 100;
  const customerGrowth = (thisMonth.active_customers / Math.max(1, lastMonth.active_customers) - 1) * 100;

  items.push({
    category: gmvGrowth > 0 ? 'growth' : 'decline',
    severity: Math.abs(gmvGrowth) > 20 ? (gmvGrowth > 0 ? 'positive' : 'critical') : 'info',
    title: `Monthly GMV ${gmvGrowth > 0 ? 'up' : 'down'} ${Math.abs(gmvGrowth).toFixed(1)}%`,
    description: `Total GMV: €${thisMonth.gmv.toFixed(0)} vs €${lastMonth.gmv.toFixed(0)} last month`,
    metric: `${gmvGrowth > 0 ? '+' : ''}${gmvGrowth.toFixed(1)}%`,
  });

  items.push({
    category: profitGrowth > 0 ? 'opportunity' : 'risk',
    severity: 'info',
    title: `Profit ${profitGrowth > 0 ? 'increased' : 'decreased'} ${Math.abs(profitGrowth).toFixed(1)}%`,
    description: `Gross profit: €${thisMonth.gross_profit.toFixed(0)}`,
    metric: `${profitGrowth > 0 ? '+' : ''}${profitGrowth.toFixed(1)}%`,
  });

  items.push({
    category: customerGrowth > 0 ? 'growth' : 'decline',
    severity: 'info',
    title: `Customer base ${customerGrowth > 0 ? 'expanded' : 'shrank'} ${Math.abs(customerGrowth).toFixed(1)}%`,
    description: `${thisMonth.active_customers} active customers this month`,
  });

  items.push({
    category: 'operational',
    severity: 'info',
    title: `${thisMonth.completed_orders} orders completed (${orderGrowth > 0 ? '+' : ''}${orderGrowth.toFixed(1)}%)`,
    description: `Average order value: €${thisMonth.average_order_value.toFixed(2)}`,
  });

  // Strategic recommendations
  if (gmvGrowth < 0) {
    items.push({
      category: 'risk',
      severity: 'critical',
      title: 'Strategic concern: declining GMV',
      description: 'Month-over-month decline indicates structural issues',
      action: 'Conduct customer research, audit competitive positioning, review unit economics',
    });
  }

  return {
    period: 'monthly',
    generated_at: new Date().toISOString(),
    period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    period_end: new Date().toISOString(),
    highlights: items,
    summary: {
      gmv: thisMonth.gmv,
      orders: thisMonth.completed_orders,
      new_customers: thisMonth.new_customers,
      profit_margin: thisMonth.profit_margin,
    },
    recommendations: items.filter((i) => i.action).map((i) => i.action!).slice(0, 5),
  };
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
