/**
 * Automation Engine
 * ─────────────────
 * Evaluates rules and executes actions.
 * Configurable via admin UI; rules stored in DB.
 */

import type { AutomationRule, RuleCondition, RuleAction, RuleExecutionResult } from './types';
import { createServiceClient } from '@/lib/supabase/service';
import { getEmailRouter } from '../email/router';
import { getPushRouter } from '../notifications/router';
import { getSMSRouter } from '../sms/router';
import { getWebhookDispatcher } from '../webhooks/dispatcher';
import { AutomationExecutionLimiter } from './execution-limiter';
import { logger } from '@/lib/logging';

export class AutomationEngine {
  private readonly limiter = new AutomationExecutionLimiter();

  async evaluate(event: string, context: Record<string, unknown>): Promise<RuleExecutionResult[]> {
    const rules = await this.loadRules(event);
    const results: RuleExecutionResult[] = [];
    for (const rule of rules) {
      const start = Date.now();
      const result = await this.evaluateRule(rule, context);
      result.duration_ms = Date.now() - start;
      results.push(result);
    }
    return results;
  }

  private async loadRules(trigger: string): Promise<AutomationRule[]> {
    try {
      const db = createServiceClient();
      const { data, error } = await db.from('automation_rules').select('*').eq('enabled', true).eq('trigger', trigger);
      if (error || !data) return [];
      return data as AutomationRule[];
    } catch {
      return [];
    }
  }

  private async evaluateRule(rule: AutomationRule, context: Record<string, unknown>): Promise<RuleExecutionResult> {
    const result: RuleExecutionResult = {
      rule_id: rule.id || 'unknown',
      rule_name: rule.name,
      triggered: false,
      executed_actions: [],
      conditions_evaluated: rule.conditions.length,
      conditions_passed: 0,
      executed_at: new Date().toISOString(),
      duration_ms: 0,
    };

    const ruleId = rule.id || rule.name;
    // Enforce both the rolling hourly limit and the configured cooldown.
    if (!this.limiter.canExecute(ruleId, rule.max_executions_per_hour, rule.cooldown_minutes)) {
      return result;
    }

    // Evaluate conditions
    for (const cond of rule.conditions) {
      if (this.evaluateCondition(cond, context)) {
        result.conditions_passed += 1;
      } else {
        return result; // All conditions must pass
      }
    }

    // Check aggregate (e.g., 5 cancellations in 1h)
    if (rule.aggregate) {
      const count = await this.aggregateCount(rule);
      if (count < rule.aggregate.threshold) {
        return result;
      }
    }

    // Triggered!
    result.triggered = true;
    this.limiter.record(ruleId);

    // Execute actions
    for (const action of rule.actions) {
      try {
        await this.executeAction(action, context);
        result.executed_actions.push(action.type);
      } catch (error: unknown) {
        result.error = error instanceof Error ? error.message : 'Automation action failed';
      }
    }

    // Log execution
    await this.logExecution(rule, result);

    return result;
  }

  private evaluateCondition(cond: RuleCondition, context: Record<string, unknown>): boolean {
    const value = this.resolveField(cond.field, context);
    switch (cond.operator) {
      case 'eq': return value === cond.value;
      case 'neq': return value !== cond.value;
      case 'gt': return this.compareOrdered(value, cond.value) === 1;
      case 'gte': return (this.compareOrdered(value, cond.value) ?? -1) >= 0;
      case 'lt': return this.compareOrdered(value, cond.value) === -1;
      case 'lte': return (this.compareOrdered(value, cond.value) ?? 1) <= 0;
      case 'in': return Array.isArray(cond.value) && cond.value.includes(value);
      case 'nin': return Array.isArray(cond.value) && !cond.value.includes(value);
      case 'contains': return String(value || '').includes(String(cond.value));
      case 'starts_with': return String(value || '').startsWith(String(cond.value));
      case 'ends_with': return String(value || '').endsWith(String(cond.value));
      case 'is_null': return value == null;
      case 'is_not_null': return value != null;
      default: return false;
    }
  }

  private compareOrdered(left: unknown, right: unknown): -1 | 0 | 1 | null {
    if (typeof left === 'number' && typeof right === 'number' && Number.isFinite(left) && Number.isFinite(right)) {
      return left === right ? 0 : left < right ? -1 : 1;
    }
    if (typeof left === 'string' && typeof right === 'string') {
      return left === right ? 0 : left < right ? -1 : 1;
    }
    return null;
  }

  private resolveField(field: string, context: Record<string, unknown>): unknown {
    // Support "a.b.c" notation
    const parts = field.split('.');
    if (parts.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) return undefined;
    let val: unknown = context;
    for (const p of parts) {
      if (!val || typeof val !== 'object' || Array.isArray(val)) return undefined;
      val = (val as Record<string, unknown>)[p];
    }
    return val;
  }

  private async aggregateCount(rule: AutomationRule): Promise<number> {
    if (!rule.aggregate) return 1;
    const allowedSources = new Set(['orders', 'drivers', 'restaurants']);
    if (!allowedSources.has(rule.aggregate.count_field)) return 0;
    const db = createServiceClient();
    const windowStart = new Date(Date.now() - rule.aggregate.window_minutes * 60 * 1000).toISOString();
    try {
      const { count } = await db.from(rule.aggregate.count_field)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', windowStart);
      return count || 0;
    } catch {
      return 0;
    }
  }

  private async executeAction(action: RuleAction, context: Record<string, unknown>): Promise<void> {
    switch (action.type) {
      case 'pause_restaurant':
        if (context.restaurant_id) {
          const db = createServiceClient();
          const { error } = await db.from('restaurants').update({ is_active: false }).eq('id', String(context.restaurant_id));
          if (error) throw error;
        }
        break;
      case 'resume_restaurant':
        if (context.restaurant_id) {
          const db = createServiceClient();
          const { error } = await db.from('restaurants').update({ is_active: true }).eq('id', String(context.restaurant_id));
          if (error) throw error;
        }
        break;
      case 'notify_admins':
        // Create admin notification record
        const db = createServiceClient();
        const { error: notifyError } = await db.from('admin_notifications').insert({
          title: action.params.title,
          body: action.params.body,
          severity: action.params.severity,
          source: 'automation',
        });
        if (notifyError) throw notifyError;
        break;
      case 'send_push':
        const pushRouter = getPushRouter();
        const pushData = Object.fromEntries(
          Object.entries(context)
            .filter((entry): entry is [string, string | number | boolean] => ['string', 'number', 'boolean'].includes(typeof entry[1]))
            .map(([key, value]) => [key, String(value)]),
        );
        if (action.params.user_id) {
          const pushDb = createServiceClient();
          const { error: durablePushError } = await pushDb.from('notifications').insert({
            user_id: action.params.user_id,
            type: 'automation',
            title: action.params.title,
            body: action.params.body,
            data: context,
          });
          if (durablePushError) throw durablePushError;
        }
        if (action.params.topic) {
          const pushResult = await pushRouter.sendToTopic(action.params.topic, {
            title: action.params.title,
            body: action.params.body,
            data: pushData,
          });
          if (!pushResult.success) throw new Error(pushResult.error || 'Push delivery failed');
        }
        break;
      case 'send_email':
        const emailRouter = getEmailRouter();
        // Template-based send
        if (action.params.template === 'password_reset') {
          await emailRouter.sendPasswordReset(action.params.to, '', action.params.data.resetLink);
        } else if (action.params.template === 'welcome') {
          await emailRouter.sendWelcome(action.params.to, action.params.data.name);
        }
        break;
      case 'send_sms':
        const smsRouter = getSMSRouter();
        await smsRouter.send({
          to: action.params.to,
          body: action.params.body,
          emergency: action.params.emergency,
        });
        break;
      case 'create_alert':
        const dba = createServiceClient();
        const { error: alertError } = await dba.from('admin_notifications').insert({
          title: 'Automation Alert',
          body: action.params.message,
          severity: action.params.severity,
          source: action.params.source,
        });
        if (alertError) throw alertError;
        break;
      case 'escalate':
        // Notify a specific user
        const dbe = createServiceClient();
        const { error: escalationError } = await dbe.from('admin_notifications').insert({
          title: 'Escalation',
          body: `${action.params.reason} -> ${action.params.to}`,
          severity: 'critical',
          source: 'escalation',
        });
        if (escalationError) throw escalationError;
        break;
      case 'log':
        logger.info('automation.rule_log', {
          configured_level: action.params.level,
          message: action.params.message,
        });
        break;
      case 'webhook':
        const dispatcher = getWebhookDispatcher();
        const sharedSecret = process.env.WEBHOOK_SHARED_SECRET;
        if (!sharedSecret || sharedSecret.length < 16) throw new Error('Automation webhook signing secret is not configured');
        const delivery = await dispatcher.send(
          { url: action.params.url, secret: sharedSecret, events: ['*'], enabled: true },
          'automation.triggered',
          action.params.payload,
        );
        if (!delivery.success) throw new Error(delivery.error || 'Webhook delivery failed');
        break;
      default:
        throw new Error('Unsupported automation action');
    }
  }

  private async logExecution(rule: AutomationRule, result: RuleExecutionResult): Promise<void> {
    try {
      const db = createServiceClient();
      await db.from('automation_executions').insert({
        rule_id: rule.id,
        rule_name: rule.name,
        triggered: result.triggered,
        executed_actions: result.executed_actions,
        error: result.error,
        executed_at: result.executed_at,
        duration_ms: result.duration_ms,
      });
    } catch {
      // log table may not exist
    }
  }
}

let _engine: AutomationEngine | null = null;
export function getAutomationEngine(): AutomationEngine {
  if (!_engine) _engine = new AutomationEngine();
  return _engine;
}
