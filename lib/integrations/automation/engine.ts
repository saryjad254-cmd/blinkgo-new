/**
 * Automation Engine
 * ─────────────────
 * Evaluates rules and executes actions.
 * Configurable via admin UI; rules stored in DB.
 */

import type { AutomationRule, RuleCondition, RuleAction, RuleExecutionResult, RuleOperator } from './types';
import { createServiceClient } from '@/lib/supabase/service';
import { getEmailRouter } from '../email/router';
import { getPushRouter } from '../notifications/router';
import { getSMSRouter } from '../sms/router';
import { getWebhookDispatcher } from '../webhooks/dispatcher';

export class AutomationEngine {
  private executionCounts: Map<string, number[]> = new Map(); // rule_id -> timestamps

  async evaluate(event: string, context: Record<string, any>): Promise<RuleExecutionResult[]> {
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

  private async evaluateRule(rule: AutomationRule, context: Record<string, any>): Promise<RuleExecutionResult> {
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

    // Check rate limit
    if (rule.max_executions_per_hour && !this.checkRateLimit(rule.id!, rule.max_executions_per_hour)) {
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
      const count = await this.aggregateCount(rule, context);
      if (count < rule.aggregate.threshold) {
        return result;
      }
    }

    // Triggered!
    result.triggered = true;
    this.recordExecution(rule.id!);

    // Execute actions
    for (const action of rule.actions) {
      try {
        await this.executeAction(action, context);
        result.executed_actions.push(action.type);
      } catch (e: any) {
        result.error = e.message;
      }
    }

    // Log execution
    await this.logExecution(rule, result);

    return result;
  }

  private evaluateCondition(cond: RuleCondition, context: Record<string, any>): boolean {
    const value = this.resolveField(cond.field, context);
    switch (cond.operator) {
      case 'eq': return value === cond.value;
      case 'neq': return value !== cond.value;
      case 'gt': return value > cond.value;
      case 'gte': return value >= cond.value;
      case 'lt': return value < cond.value;
      case 'lte': return value <= cond.value;
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

  private resolveField(field: string, context: Record<string, any>): any {
    // Support "a.b.c" notation
    const parts = field.split('.');
    let val: any = context;
    for (const p of parts) {
      if (val == null) return undefined;
      val = val[p];
    }
    return val;
  }

  private async aggregateCount(rule: AutomationRule, context: Record<string, any>): Promise<number> {
    if (!rule.aggregate) return 1;
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

  private async executeAction(action: RuleAction, context: Record<string, any>): Promise<void> {
    switch (action.type) {
      case 'pause_restaurant':
        if (context.restaurant_id) {
          const db = createServiceClient();
          await db.from('restaurants').update({ is_active: false }).eq('id', context.restaurant_id);
        }
        break;
      case 'resume_restaurant':
        if (context.restaurant_id) {
          const db = createServiceClient();
          await db.from('restaurants').update({ is_active: true }).eq('id', context.restaurant_id);
        }
        break;
      case 'notify_admins':
        // Create admin notification record
        const db = createServiceClient();
        await db.from('admin_notifications').insert({
          title: action.params.title,
          body: action.params.body,
          severity: action.params.severity,
          source: 'automation',
        });
        break;
      case 'send_push':
        const pushRouter = getPushRouter();
        if (action.params.topic) {
          await pushRouter.sendToTopic(action.params.topic, {
            title: action.params.title,
            body: action.params.body,
            data: context,
          });
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
        await dba.from('admin_notifications').insert({
          title: 'Automation Alert',
          body: action.params.message,
          severity: action.params.severity,
          source: action.params.source,
        });
        break;
      case 'escalate':
        // Notify a specific user
        const dbe = createServiceClient();
        await dbe.from('admin_notifications').insert({
          title: 'Escalation',
          body: `${action.params.reason} -> ${action.params.to}`,
          severity: 'critical',
          source: 'escalation',
        });
        break;
      case 'log':
        console.log(`[automation ${action.params.level}] ${action.params.message}`);
        break;
      case 'webhook':
        const dispatcher = getWebhookDispatcher();
        await dispatcher.send(
          { url: action.params.url, secret: process.env.WEBHOOK_SHARED_SECRET || 'change-me', events: ['*'], enabled: true },
          'automation.triggered',
          action.params.payload,
        );
        break;
    }
  }

  private checkRateLimit(ruleId: string, maxPerHour: number): boolean {
    const now = Date.now();
    const cutoff = now - 60 * 60 * 1000;
    const arr = (this.executionCounts.get(ruleId) || []).filter((t) => t > cutoff);
    if (arr.length >= maxPerHour) return false;
    arr.push(now);
    this.executionCounts.set(ruleId, arr);
    return true;
  }

  private recordExecution(ruleId: string): void {
    const arr = this.executionCounts.get(ruleId) || [];
    arr.push(Date.now());
    this.executionCounts.set(ruleId, arr);
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
