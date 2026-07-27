/**
 * Driver Intelligence Library
 * ──────────────────────────
 * Acceptance rate, idle time, utilization, earnings.
 */

export interface DriverRow {
  id: string;
  is_active: boolean;
  is_online: boolean;
  total_earnings: number;
  total_trips: number;
  rating: number;
}

export interface DriverOrderRow {
  driver_id: string;
  status: string;
  delivery_fee: number;
  tip: number;
  created_at: string;
  delivered_at: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  [key: string]: any;
}

export interface DriverMetrics {
  driver_id: string;
  total_offers: number;
  accepted_offers: number;
  rejected_offers: number;
  cancelled_after_accept: number;
  completed_deliveries: number;
  acceptance_rate: number;
  cancellation_rate: number;
  completion_rate: number;
  total_earnings: number;
  earnings_per_hour: number;
  earnings_per_day: number;
  online_hours: number;
  active_hours: number;
  utilization: number; // 0-1
  rating: number;
  retention_score: number; // 0-1
}

export function computeDriverMetrics(
  drivers: DriverRow[],
  orders: DriverOrderRow[],
  period: { start: Date; end: Date }
): DriverMetrics[] {
  const periodOrders = orders.filter(
    (o) => new Date(o.created_at) >= period.start && new Date(o.created_at) <= period.end
  );
  const periodHours = Math.max(1, (period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60));
  const periodDays = Math.max(1, periodHours / 24);

  return drivers.map((d) => {
    const dOrders = periodOrders.filter((o) => o.driver_id === d.id);
    const accepted = dOrders.filter((o) => o.accepted_at || o.status === 'delivered' || o.status === 'picked_up' || o.status === 'in_transit');
    const rejected = dOrders.filter((o) => o.rejected_at);
    const cancelled = dOrders.filter((o) => o.status === 'cancelled');
    const completed = dOrders.filter((o) => o.status === 'delivered');

    const earnings = completed.reduce((s, o) => s + ((o.delivery_fee ?? 0) + (o.tip ?? 0)), 0);

    // Online hours estimated from orders (avg 30min per delivery + idle)
    const estOnlineHours = (completed.length * 0.5) + Math.max(0, periodHours * 0.1);
    const activeHours = completed.length * 0.5;
    const utilization = estOnlineHours > 0 ? activeHours / estOnlineHours : 0;

    const total_offers = dOrders.length;
    const acceptance_rate = total_offers > 0 ? accepted.length / total_offers : 0;
    const cancellation_rate = accepted.length > 0 ? cancelled.length / accepted.length : 0;
    const completion_rate = accepted.length > 0 ? completed.length / accepted.length : 0;

    return {
      driver_id: d.id,
      total_offers: total_offers,
      accepted_offers: accepted.length,
      rejected_offers: rejected.length,
      cancelled_after_accept: cancelled.length,
      completed_deliveries: completed.length,
      acceptance_rate,
      cancellation_rate,
      completion_rate,
      total_earnings: earnings,
      earnings_per_hour: estOnlineHours > 0 ? earnings / estOnlineHours : 0,
      earnings_per_day: earnings / periodDays,
      online_hours: estOnlineHours,
      active_hours: activeHours,
      utilization,
      rating: d.rating,
      retention_score: computeRetentionScore(d, completed.length),
    };
  });
}

function computeRetentionScore(driver: DriverRow, completedPeriod: number): number {
  let score = 0.5;
  if (driver.is_active) score += 0.2;
  if (driver.is_online) score += 0.1;
  if (completedPeriod > 20) score += 0.1;
  if (driver.rating >= 4.5) score += 0.1;
  return Math.min(1, score);
}

export interface DriverImprovement {
  driver_id: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

export function recommendDriverImprovements(metrics: DriverMetrics[]): DriverImprovement[] {
  const recs: DriverImprovement[] = [];
  for (const m of metrics) {
    if (m.acceptance_rate < 0.5 && m.total_offers > 5) {
      recs.push({
        driver_id: m.driver_id,
        issue: `Low acceptance rate: ${(m.acceptance_rate * 100).toFixed(0)}%`,
        severity: 'high',
        recommendation: 'Investigate: location mismatch, pay concerns, or app issues. Consider bonus or training.',
      });
    }
    if (m.cancellation_rate > 0.1) {
      recs.push({
        driver_id: m.driver_id,
        issue: `High cancellation rate: ${(m.cancellation_rate * 100).toFixed(0)}%`,
        severity: 'high',
        recommendation: 'Repeated cancellations hurt ratings. Audit reasons, enforce 3-strike policy.',
      });
    }
    if (m.utilization < 0.3 && m.online_hours > 4) {
      recs.push({
        driver_id: m.driver_id,
        issue: `Low utilization: ${(m.utilization * 100).toFixed(0)}%`,
        severity: 'medium',
        recommendation: 'Idle time high. Show nearby busy zones / high-demand areas.',
      });
    }
    if (m.earnings_per_hour < 10) {
      recs.push({
        driver_id: m.driver_id,
        issue: `Low earnings: €${m.earnings_per_hour.toFixed(2)}/hr`,
        severity: 'medium',
        recommendation: 'Below target (€10/hr). Offer surge zones or boost during peak.',
      });
    }
    if (m.rating < 4) {
      recs.push({
        driver_id: m.driver_id,
        issue: `Low rating: ${m.rating.toFixed(1)}/5`,
        severity: 'high',
        recommendation: 'Customer service training. Identify recurring complaints.',
      });
    }
  }
  return recs;
}
