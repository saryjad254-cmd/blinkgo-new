import { z } from 'zod';
import { ValidationError } from '@/lib/errors';
import { validateWebhookUrl } from '@/lib/security/outbound-url';
import type { AutomationRule, RuleAction, RuleCondition } from '@/lib/integrations/automation/types';

const limitedText = (min: number, max: number) => z.string().trim().min(min).max(max);
const severity = z.enum(['low', 'medium', 'high', 'critical']);
const safeField = limitedText(1, 100).regex(
  /^(?!.*(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$))[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/,
  'Condition field is invalid',
);
const jsonObject = z.record(z.unknown()).refine((value) => {
  try {
    return JSON.stringify(value).length <= 10_000;
  } catch {
    return false;
  }
}, 'JSON object is too large or invalid');

const conditionSchema = z.object({
  field: safeField,
  operator: z.enum([
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains',
    'starts_with', 'ends_with', 'is_null', 'is_not_null',
  ]),
  value: z.unknown().optional(),
}).strict().superRefine((condition, ctx) => {
  if (['in', 'nin'].includes(condition.operator) && !Array.isArray(condition.value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'in/nin values must be arrays' });
  }
  if (!['is_null', 'is_not_null'].includes(condition.operator) && condition.value === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Condition value is required' });
  }
  try {
    if (JSON.stringify(condition.value)?.length > 4_096) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Condition value is too large' });
    }
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Condition value is invalid' });
  }
});

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pause_restaurant'), params: z.object({ reason: limitedText(2, 300) }).strict() }).strict(),
  z.object({ type: z.literal('resume_restaurant'), params: z.object({}).strict() }).strict(),
  z.object({ type: z.literal('notify_admins'), params: z.object({ title: limitedText(2, 180), body: limitedText(2, 2_000), severity }).strict() }).strict(),
  z.object({ type: z.literal('send_push'), params: z.object({
    topic: limitedText(1, 120).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
    user_id: z.string().uuid().optional(),
    title: limitedText(2, 180),
    body: limitedText(2, 2_000),
  }).strict().refine((params) => Boolean(params.topic || params.user_id), 'A topic or user_id is required') }).strict(),
  z.object({ type: z.literal('send_email'), params: z.object({
    to: z.string().trim().email().max(320),
    template: z.enum(['password_reset', 'welcome']),
    data: jsonObject,
  }).strict() }).strict(),
  z.object({ type: z.literal('send_sms'), params: z.object({
    to: z.string().regex(/^\+[1-9]\d{7,14}$/),
    body: limitedText(1, 1_600),
    emergency: z.boolean().optional(),
  }).strict() }).strict(),
  z.object({ type: z.literal('create_alert'), params: z.object({ severity, message: limitedText(2, 2_000), source: limitedText(1, 100) }).strict() }).strict(),
  z.object({ type: z.literal('escalate'), params: z.object({ to: limitedText(1, 120), reason: limitedText(2, 500) }).strict() }).strict(),
  z.object({ type: z.literal('log'), params: z.object({ message: limitedText(1, 2_000), level: z.enum(['info', 'warn', 'error']) }).strict() }).strict(),
  z.object({ type: z.literal('webhook'), params: z.object({ url: limitedText(8, 2_048), payload: jsonObject }).strict() }).strict(),
]);

const baseSchema = z.object({
  name: limitedText(2, 160),
  description: limitedText(1, 600).nullable(),
  enabled: z.boolean(),
  trigger: z.enum([
    'order.created', 'order.completed', 'order.cancelled', 'driver.online',
    'driver.offline', 'restaurant.sla_check', 'schedule', 'metric.threshold',
  ]),
  conditions: z.array(conditionSchema).max(20),
  actions: z.array(actionSchema).min(1).max(10),
  time_window_minutes: z.number().int().min(1).max(10_080).nullable(),
  aggregate: z.object({
    count_field: z.enum(['orders', 'drivers', 'restaurants']),
    threshold: z.number().int().min(1).max(100_000),
    window_minutes: z.number().int().min(1).max(10_080),
  }).strict().nullable(),
  max_executions_per_hour: z.number().int().min(1).max(10_000).nullable(),
  cooldown_minutes: z.number().int().min(0).max(10_080).nullable(),
}).strict();

const createSchema = baseSchema.extend({
  description: baseSchema.shape.description.optional(),
  enabled: baseSchema.shape.enabled.default(true),
  conditions: baseSchema.shape.conditions.default([]),
  time_window_minutes: baseSchema.shape.time_window_minutes.optional(),
  aggregate: baseSchema.shape.aggregate.optional(),
  max_executions_per_hour: baseSchema.shape.max_executions_per_hour.optional(),
  cooldown_minutes: baseSchema.shape.cooldown_minutes.optional(),
});
const updateSchema = baseSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export type AutomationRuleInput = Partial<Omit<AutomationRule, 'description' | 'time_window_minutes' | 'aggregate' | 'max_executions_per_hour' | 'cooldown_minutes'>> & {
  description?: string | null;
  time_window_minutes?: number | null;
  aggregate?: AutomationRule['aggregate'] | null;
  max_executions_per_hour?: number | null;
  cooldown_minutes?: number | null;
  conditions?: RuleCondition[];
  actions?: RuleAction[];
};

export function parseAutomationRuleInput(value: unknown, mode: 'create' | 'update'): AutomationRuleInput {
  const parsed = (mode === 'create' ? createSchema : updateSchema).safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ValidationError(`${field}${issue.message}`);
  }
  return parsed.data as AutomationRuleInput;
}

export async function validateAutomationOutboundUrls(input: AutomationRuleInput): Promise<void> {
  if (!input.actions) return;
  for (const action of input.actions) {
    if (action.type === 'webhook') action.params.url = await validateWebhookUrl(action.params.url);
  }
}

export function isAutomationRuleId(value: string): boolean {
  return z.string().uuid().safeParse(value).success;
}
