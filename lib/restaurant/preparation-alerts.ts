import { extractPreparationPlan, preparationState, type PreparationEventLike } from '@/lib/restaurant/preparation-policy';

export type PreparationAlertLevel = 'warning' | 'late' | 'critical';

export interface PreparationAlertOrder {
  id: string;
  order_number?: string | null;
  status: string;
  restaurant_id: string;
  customer_id?: string | null;
}

export interface PreparationAlertEvent extends PreparationEventLike {
  order_id: string;
  event_type?: string | null;
}

export interface PreparationAlertCandidate {
  order: PreparationAlertOrder;
  level: PreparationAlertLevel;
  estimatedReadyAt: string;
  estimatedPrepMinutes: number;
  overdueMinutes: number;
}

export function planPreparationAlerts(
  orders: PreparationAlertOrder[],
  events: PreparationAlertEvent[],
  now = Date.now(),
): PreparationAlertCandidate[] {
  const candidates: PreparationAlertCandidate[] = [];
  for (const order of orders) {
    if (!['confirmed', 'preparing'].includes(order.status)) continue;
    const orderEvents = events.filter((event) => event.order_id === order.id);
    const plan = extractPreparationPlan(orderEvents.filter((event) => event.event_type === 'status_change'));
    if (!plan) continue;
    const state = preparationState(order.status, plan.estimatedReadyAt, now);
    if (!['warning', 'late', 'critical'].includes(state)) continue;
    const level = state as PreparationAlertLevel;
    const alreadySent = orderEvents.some((event) => {
      if (event.event_type !== 'restaurant_prep_sla_alert' || !event.metadata || typeof event.metadata !== 'object') return false;
      return (event.metadata as Record<string, unknown>).alert_level === level;
    });
    if (alreadySent) continue;
    candidates.push({
      order,
      level,
      estimatedReadyAt: plan.estimatedReadyAt,
      estimatedPrepMinutes: plan.estimatedPrepMinutes,
      overdueMinutes: Math.max(0, Math.floor((now - new Date(plan.estimatedReadyAt).getTime()) / 60_000)),
    });
  }
  return candidates;
}
