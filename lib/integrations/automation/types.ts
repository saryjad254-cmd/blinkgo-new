/**
 * Automation Rule Types
 * ─────────────────────
 * Declarative rule definitions for enterprise automation.
 */

export type RuleOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'nin' | 'contains' | 'starts_with' | 'ends_with'
  | 'is_null' | 'is_not_null';

export interface RuleCondition {
  field: string; // e.g., "restaurant.sla_compliance", "order.status"
  operator: RuleOperator;
  value: any;
}

export type RuleAction =
  | { type: 'pause_restaurant'; params: { reason: string } }
  | { type: 'resume_restaurant'; params: Record<string, never> }
  | { type: 'notify_admins'; params: { title: string; body: string; severity: 'low' | 'medium' | 'high' | 'critical' } }
  | { type: 'send_push'; params: { topic?: string; user_id?: string; title: string; body: string } }
  | { type: 'send_email'; params: { to: string; template: string; data: Record<string, any> } }
  | { type: 'send_sms'; params: { to: string; body: string; emergency?: boolean } }
  | { type: 'create_alert'; params: { severity: 'low' | 'medium' | 'high' | 'critical'; message: string; source: string } }
  | { type: 'escalate'; params: { to: string; reason: string } }
  | { type: 'log'; params: { message: string; level: 'info' | 'warn' | 'error' } }
  | { type: 'webhook'; params: { url: string; payload: Record<string, any> } };

export interface AutomationRule {
  id?: string;
  name: string;
  description?: string;
  enabled: boolean;
  // Trigger: when to evaluate
  trigger: 'order.created' | 'order.completed' | 'order.cancelled' | 'driver.online' | 'driver.offline' | 'restaurant.sla_check' | 'schedule' | 'metric.threshold';
  // Conditions (all must be true)
  conditions: RuleCondition[];
  // Time window (e.g., evaluate only orders in last 1h)
  time_window_minutes?: number;
  // Aggregation (e.g., "5 cancellations in 1h")
  aggregate?: { count_field: string; threshold: number; window_minutes: number };
  // Actions to perform
  actions: RuleAction[];
  // Rate limit (don't run more than X times per hour)
  max_executions_per_hour?: number;
  // Cooldown after execution (in minutes)
  cooldown_minutes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface RuleExecutionResult {
  rule_id: string;
  rule_name: string;
  triggered: boolean;
  executed_actions: string[];
  conditions_evaluated: number;
  conditions_passed: number;
  error?: string;
  executed_at: string;
  duration_ms: number;
}
