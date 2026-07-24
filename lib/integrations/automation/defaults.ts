/**
 * Default Automation Rules
 * ────────────────────────
 * Pre-configured rules that ship with the platform.
 * Can be enabled/disabled/customized via admin UI.
 */

import type { AutomationRule } from './types';

export const defaultRules: AutomationRule[] = [
  {
    name: 'Auto-pause restaurant with low SLA',
    description: 'Pause restaurant if SLA compliance drops below 50% over 30 minutes',
    enabled: true,
    trigger: 'restaurant.sla_check',
    conditions: [
      { field: 'sla_compliance', operator: 'lt', value: 0.5 },
    ],
    time_window_minutes: 30,
    actions: [
      { type: 'pause_restaurant', params: { reason: 'SLA compliance dropped below 50%' } },
      { type: 'notify_admins', params: { title: 'Restaurant auto-paused', body: 'SLA compliance < 50%', severity: 'high' } },
    ],
    max_executions_per_hour: 1,
    cooldown_minutes: 60,
  },
  {
    name: 'Alert on driver shortage',
    description: 'Notify admins when active drivers < 2 for 15 minutes',
    enabled: true,
    trigger: 'metric.threshold',
    conditions: [
      { field: 'active_drivers', operator: 'lt', value: 2 },
    ],
    time_window_minutes: 15,
    actions: [
      { type: 'notify_admins', params: { title: 'Driver shortage', body: 'Active drivers < 2', severity: 'high' } },
      { type: 'send_push', params: { topic: 'drivers_online', title: 'Driver needed', body: 'High demand in your area' } },
    ],
    max_executions_per_hour: 4,
  },
  {
    name: 'Detect unusual cancellation spike',
    description: 'Trigger when 5+ cancellations happen in 30 minutes',
    enabled: true,
    trigger: 'order.cancelled',
    conditions: [
      { field: 'reason', operator: 'neq', value: 'customer_request' },
    ],
    aggregate: { count_field: 'orders', threshold: 5, window_minutes: 30 },
    actions: [
      { type: 'create_alert', params: { severity: 'high', message: 'Cancellation spike detected', source: 'orders' } },
      { type: 'notify_admins', params: { title: 'Cancellation spike', body: '5+ cancellations in 30min', severity: 'high' } },
    ],
    max_executions_per_hour: 2,
  },
  {
    name: 'Critical incident escalation',
    description: 'Escalate critical payment failures to on-call',
    enabled: true,
    trigger: 'order.created',
    conditions: [
      { field: 'payment_status', operator: 'eq', value: 'failed' },
      { field: 'total', operator: 'gt', value: 100 },
    ],
    actions: [
      { type: 'escalate', params: { to: 'oncall', reason: 'Critical payment failure' } },
      { type: 'create_alert', params: { severity: 'critical', message: 'High-value payment failed', source: 'payments' } },
    ],
    max_executions_per_hour: 10,
  },
  {
    name: 'Daily operational report',
    description: 'Generate and email daily operational report at 1 AM',
    enabled: true,
    trigger: 'schedule',
    conditions: [],
    actions: [
      { type: 'log', params: { message: 'Daily report generation triggered', level: 'info' } },
    ],
    max_executions_per_hour: 1,
  },
];
