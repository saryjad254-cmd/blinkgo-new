'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Save from 'lucide-react/dist/esm/icons/save';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import X from 'lucide-react/dist/esm/icons/x';
import { cn } from '@/lib/cn';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

export type AutomationLocale = 'de' | 'ar' | 'en';
export type AutomationTrigger = 'order.created' | 'order.completed' | 'order.cancelled' | 'driver.online' | 'driver.offline' | 'restaurant.sla_check' | 'schedule' | 'metric.threshold';
export type AutomationOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'starts_with' | 'ends_with' | 'is_null' | 'is_not_null';
export type AutomationActionType = 'pause_restaurant' | 'resume_restaurant' | 'notify_admins' | 'send_push' | 'send_email' | 'send_sms' | 'create_alert' | 'escalate' | 'log' | 'webhook';

export interface AutomationRuleRecord {
  id?: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: Array<{ field: string; operator: AutomationOperator; value?: unknown }>;
  actions: Array<{ type: AutomationActionType; params: Record<string, unknown> }>;
  max_executions_per_hour?: number | null;
  cooldown_minutes?: number | null;
  time_window_minutes?: number | null;
  aggregate?: { count_field: 'orders' | 'drivers' | 'restaurants'; threshold: number; window_minutes: number } | null;
}

interface ConditionDraft { field: string; operator: AutomationOperator; value: string }
interface ActionDraft { type: AutomationActionType; params: string }

const TRIGGERS: AutomationTrigger[] = ['order.created', 'order.completed', 'order.cancelled', 'driver.online', 'driver.offline', 'restaurant.sla_check', 'schedule', 'metric.threshold'];
const OPERATORS: AutomationOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'starts_with', 'ends_with', 'is_null', 'is_not_null'];
const ACTION_TYPES: AutomationActionType[] = ['pause_restaurant', 'resume_restaurant', 'notify_admins', 'send_push', 'send_email', 'send_sms', 'create_alert', 'escalate', 'log', 'webhook'];
const NULL_OPERATORS = new Set<AutomationOperator>(['is_null', 'is_not_null']);

const ACTION_EXAMPLES: Record<AutomationActionType, Record<string, unknown>> = {
  pause_restaurant: { reason: 'SLA compliance dropped below 50%' },
  resume_restaurant: {},
  notify_admins: { title: 'Operational alert', body: 'Rule threshold reached', severity: 'high' },
  send_push: { topic: 'drivers_online', title: 'BlinkGo alert', body: 'New operational update' },
  send_email: { to: 'operations@example.com', template: 'welcome', data: { name: 'Operations' } },
  send_sms: { to: '+491701234567', body: 'BlinkGo operational alert', emergency: false },
  create_alert: { severity: 'high', message: 'Threshold reached', source: 'operations' },
  escalate: { to: 'oncall', reason: 'Critical incident' },
  log: { message: 'Automation executed', level: 'info' },
  webhook: { url: 'https://example.com/blinkgo-events', payload: { source: 'automation' } },
};

const TEXT = {
  de: { titleNew: 'Automationsregel erstellen', titleEdit: 'Automationsregel bearbeiten', subtitle: 'Trigger, Bedingungen, Aktionen und Schutzlimits definieren.', name: 'Name', description: 'Beschreibung', trigger: 'Trigger', enabled: 'Regel aktivieren', limits: 'Ausführungsschutz', max: 'Max. pro Stunde', cooldown: 'Cooldown (Min.)', window: 'Zeitfenster (Min.)', conditions: 'Bedingungen', noConditions: 'Ohne Bedingungen wird die Regel bei jedem passenden Ereignis geprüft.', addCondition: 'Bedingung hinzufügen', field: 'Feldpfad', operator: 'Operator', value: 'Wert', actions: 'Aktionen', addAction: 'Aktion hinzufügen', actionType: 'Aktionstyp', params: 'Parameter (JSON)', aggregate: 'Aggregation aktivieren', source: 'Datenquelle', threshold: 'Schwellenwert', aggregateWindow: 'Aggregationsfenster (Min.)', cancel: 'Abbrechen', save: 'Speichern', saving: 'Speichert…', delete: 'Regel löschen', confirmDelete: 'Diese Automationsregel dauerhaft löschen?', invalidJson: 'Aktionsparameter müssen ein gültiges JSON-Objekt sein.', requiredAction: 'Mindestens eine Aktion ist erforderlich.', removeCondition: 'Bedingung entfernen', removeAction: 'Aktion entfernen' },
  ar: { titleNew: 'إنشاء قاعدة أتمتة', titleEdit: 'تعديل قاعدة الأتمتة', subtitle: 'حدد الحدث والشروط والإجراءات وحدود الحماية.', name: 'الاسم', description: 'الوصف', trigger: 'الحدث المحفّز', enabled: 'تفعيل القاعدة', limits: 'حماية التنفيذ', max: 'الحد الأقصى في الساعة', cooldown: 'فترة التهدئة (دقيقة)', window: 'النافذة الزمنية (دقيقة)', conditions: 'الشروط', noConditions: 'بدون شروط ستُفحص القاعدة عند كل حدث مطابق.', addCondition: 'إضافة شرط', field: 'مسار الحقل', operator: 'المعامل', value: 'القيمة', actions: 'الإجراءات', addAction: 'إضافة إجراء', actionType: 'نوع الإجراء', params: 'المعاملات (JSON)', aggregate: 'تفعيل التجميع', source: 'مصدر البيانات', threshold: 'الحد المطلوب', aggregateWindow: 'نافذة التجميع (دقيقة)', cancel: 'إلغاء', save: 'حفظ', saving: 'جارٍ الحفظ…', delete: 'حذف القاعدة', confirmDelete: 'هل تريد حذف قاعدة الأتمتة نهائيًا؟', invalidJson: 'يجب أن تكون معاملات الإجراء كائن JSON صالحًا.', requiredAction: 'يجب إضافة إجراء واحد على الأقل.', removeCondition: 'حذف الشرط', removeAction: 'حذف الإجراء' },
  en: { titleNew: 'Create automation rule', titleEdit: 'Edit automation rule', subtitle: 'Define the trigger, conditions, actions and execution safeguards.', name: 'Name', description: 'Description', trigger: 'Trigger', enabled: 'Enable rule', limits: 'Execution safeguards', max: 'Maximum per hour', cooldown: 'Cooldown (minutes)', window: 'Time window (minutes)', conditions: 'Conditions', noConditions: 'Without conditions, the rule is evaluated for every matching event.', addCondition: 'Add condition', field: 'Field path', operator: 'Operator', value: 'Value', actions: 'Actions', addAction: 'Add action', actionType: 'Action type', params: 'Parameters (JSON)', aggregate: 'Enable aggregation', source: 'Data source', threshold: 'Threshold', aggregateWindow: 'Aggregation window (minutes)', cancel: 'Cancel', save: 'Save', saving: 'Saving…', delete: 'Delete rule', confirmDelete: 'Permanently delete this automation rule?', invalidJson: 'Action parameters must be a valid JSON object.', requiredAction: 'At least one action is required.', removeCondition: 'Remove condition', removeAction: 'Remove action' },
} as const;

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
}

function valueFromText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function initialConditions(rule: AutomationRuleRecord | null): ConditionDraft[] {
  return (rule?.conditions ?? []).map((condition) => ({
    field: condition.field,
    operator: condition.operator,
    value: condition.value === undefined ? '' : JSON.stringify(condition.value),
  }));
}

function initialActions(rule: AutomationRuleRecord | null): ActionDraft[] {
  const source = rule?.actions?.length ? rule.actions : [{ type: 'log' as const, params: ACTION_EXAMPLES.log }];
  return source.map((action) => ({ type: action.type, params: JSON.stringify(action.params, null, 2) }));
}

async function requestJson(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(extractErrorMessage(payload, `HTTP ${response.status}`));
}

export function AutomationRuleDialog({ locale, rule, onClose, onSaved, onDeleted }: { locale: AutomationLocale; rule: AutomationRuleRecord | null; onClose: () => void; onSaved: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const t = TEXT[locale];
  const isEdit = Boolean(rule?.id);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(rule?.name ?? '');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [trigger, setTrigger] = useState<AutomationTrigger>(rule?.trigger ?? 'order.created');
  const [conditions, setConditions] = useState<ConditionDraft[]>(() => initialConditions(rule));
  const [actions, setActions] = useState<ActionDraft[]>(() => initialActions(rule));
  const [maxPerHour, setMaxPerHour] = useState(rule?.max_executions_per_hour?.toString() ?? '10');
  const [cooldown, setCooldown] = useState(rule?.cooldown_minutes?.toString() ?? '5');
  const [timeWindow, setTimeWindow] = useState(rule?.time_window_minutes?.toString() ?? '');
  const [aggregateEnabled, setAggregateEnabled] = useState(Boolean(rule?.aggregate));
  const [aggregateSource, setAggregateSource] = useState<'orders' | 'drivers' | 'restaurants'>(rule?.aggregate?.count_field ?? 'orders');
  const [aggregateThreshold, setAggregateThreshold] = useState(rule?.aggregate?.threshold.toString() ?? '5');
  const [aggregateWindow, setAggregateWindow] = useState(rule?.aggregate?.window_minutes.toString() ?? '30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    nameRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', listener);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', listener);
    };
  }, [busy, onClose]);

  function updateCondition(index: number, patch: Partial<ConditionDraft>) {
    setConditions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function updateAction(index: number, patch: Partial<ActionDraft>) {
    setActions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!actions.length) { setError(t.requiredAction); return; }
    let parsedActions: AutomationRuleRecord['actions'];
    try {
      parsedActions = actions.map((action) => {
        const params = JSON.parse(action.params || '{}') as unknown;
        if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error(t.invalidJson);
        return { type: action.type, params: params as Record<string, unknown> };
      });
    } catch {
      setError(t.invalidJson);
      return;
    }

    const parsedConditions = conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      ...(NULL_OPERATORS.has(condition.operator) ? {} : { value: valueFromText(condition.value) }),
    }));
    const payload: AutomationRuleRecord = {
      name,
      description: description.trim() || null,
      enabled,
      trigger,
      conditions: parsedConditions,
      actions: parsedActions,
      max_executions_per_hour: numberOrNull(maxPerHour),
      cooldown_minutes: numberOrNull(cooldown),
      time_window_minutes: numberOrNull(timeWindow),
      aggregate: aggregateEnabled ? { count_field: aggregateSource, threshold: Number(aggregateThreshold), window_minutes: Number(aggregateWindow) } : null,
    };

    setBusy(true);
    try {
      await requestJson(rule?.id ? `/api/automation/rules/${rule.id}` : '/api/automation/rules', {
        method: rule?.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeRule() {
    if (!rule?.id || !window.confirm(t.confirmDelete)) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/api/automation/rules/${rule.id}`, { method: 'DELETE' });
      await onDeleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return <div role="presentation" className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="automation-rule-title" aria-describedby="automation-rule-description" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-border bg-ink-900 p-4 shadow-2xl sm:p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="flex items-start justify-between gap-3"><div><h2 id="automation-rule-title" className="text-xl font-black text-white">{isEdit ? t.titleEdit : t.titleNew}</h2><p id="automation-rule-description" className="mt-1 text-sm text-text-secondary">{t.subtitle}</p></div><button type="button" aria-label={t.cancel} onClick={onClose} disabled={busy} className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-text-secondary hover:text-white"><X className="size-5" /></button></header>

      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-sm font-bold text-status-error"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</div>}

      <form onSubmit={submit} className="mt-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2"><Field label={t.name}><input ref={nameRef} data-testid="automation-name" required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></Field><Field label={t.trigger}><select data-testid="automation-trigger" value={trigger} onChange={(event) => setTrigger(event.target.value as AutomationTrigger)} className={inputClass}>{TRIGGERS.map((item) => <option key={item}>{item}</option>)}</select></Field></div>
        <Field label={t.description}><textarea data-testid="automation-description" maxLength={600} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} /></Field>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-ink-800 px-3 text-sm font-bold text-white"><input data-testid="automation-enabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5 accent-brand-red" />{t.enabled}</label>

        <EditorSection title={t.conditions} actionLabel={t.addCondition} onAdd={() => setConditions((current) => [...current, { field: '', operator: 'eq', value: '' }])} testId="add-automation-condition">
          {conditions.length === 0 ? <p className="text-sm text-text-muted">{t.noConditions}</p> : <div className="space-y-3">{conditions.map((condition, index) => <div key={index} className="grid gap-3 rounded-2xl border border-border bg-ink-800/70 p-3 md:grid-cols-[1fr_180px_1fr_44px]"><Field label={t.field}><input data-testid={`automation-condition-field-${index}`} required value={condition.field} onChange={(event) => updateCondition(index, { field: event.target.value })} placeholder="order.total" className={inputClass} dir="ltr" /></Field><Field label={t.operator}><select data-testid={`automation-condition-operator-${index}`} value={condition.operator} onChange={(event) => updateCondition(index, { operator: event.target.value as AutomationOperator })} className={inputClass}>{OPERATORS.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label={t.value}><input data-testid={`automation-condition-value-${index}`} disabled={NULL_OPERATORS.has(condition.operator)} value={condition.value} onChange={(event) => updateCondition(index, { value: event.target.value })} placeholder='50 or "delivered"' className={inputClass} dir="ltr" /></Field><button type="button" aria-label={t.removeCondition} onClick={() => setConditions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="mt-auto grid size-11 place-items-center rounded-xl border border-status-error/20 text-status-error hover:bg-status-error/10"><Trash2 className="size-4" /></button></div>)}</div>}
        </EditorSection>

        <EditorSection title={t.actions} actionLabel={t.addAction} onAdd={() => setActions((current) => [...current, { type: 'log', params: JSON.stringify(ACTION_EXAMPLES.log, null, 2) }])} testId="add-automation-action">
          <div className="space-y-3">{actions.map((action, index) => <div key={index} className="grid gap-3 rounded-2xl border border-border bg-ink-800/70 p-3 md:grid-cols-[220px_1fr_44px]"><Field label={t.actionType}><select data-testid={`automation-action-type-${index}`} value={action.type} onChange={(event) => { const type = event.target.value as AutomationActionType; updateAction(index, { type, params: JSON.stringify(ACTION_EXAMPLES[type], null, 2) }); }} className={inputClass}>{ACTION_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label={t.params}><textarea data-testid={`automation-action-params-${index}`} required rows={4} value={action.params} onChange={(event) => updateAction(index, { params: event.target.value })} className={cn(inputClass, 'font-mono text-xs')} dir="ltr" /></Field><button type="button" aria-label={t.removeAction} onClick={() => setActions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="mt-auto grid size-11 place-items-center rounded-xl border border-status-error/20 text-status-error hover:bg-status-error/10"><Trash2 className="size-4" /></button></div>)}</div>
        </EditorSection>

        <section className="rounded-2xl border border-border bg-ink-800/40 p-4"><h3 className="font-black text-white">{t.limits}</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><NumberField label={t.max} testId="automation-max-hour" value={maxPerHour} onChange={setMaxPerHour} min={1} max={10000} /><NumberField label={t.cooldown} testId="automation-cooldown" value={cooldown} onChange={setCooldown} min={0} max={10080} /><NumberField label={t.window} testId="automation-window" value={timeWindow} onChange={setTimeWindow} min={1} max={10080} /></div></section>

        <section className="rounded-2xl border border-border bg-ink-800/40 p-4"><label className="flex min-h-11 items-center gap-3 text-sm font-bold text-white"><input data-testid="automation-aggregate" type="checkbox" checked={aggregateEnabled} onChange={(event) => setAggregateEnabled(event.target.checked)} className="size-5 accent-brand-red" />{t.aggregate}</label>{aggregateEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label={t.source}><select value={aggregateSource} onChange={(event) => setAggregateSource(event.target.value as typeof aggregateSource)} className={inputClass}><option value="orders">orders</option><option value="drivers">drivers</option><option value="restaurants">restaurants</option></select></Field><NumberField label={t.threshold} testId="automation-aggregate-threshold" value={aggregateThreshold} onChange={setAggregateThreshold} min={1} max={100000} required /><NumberField label={t.aggregateWindow} testId="automation-aggregate-window" value={aggregateWindow} onChange={setAggregateWindow} min={1} max={10080} required /></div>}</section>

        <footer className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between"><div>{isEdit && <button type="button" data-testid="delete-automation-rule" onClick={() => void removeRule()} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-status-error/30 px-4 text-sm font-black text-status-error hover:bg-status-error/10 sm:w-auto"><Trash2 className="size-4" />{t.delete}</button>}</div><div className="flex gap-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-11 flex-1 rounded-xl border border-border px-4 text-sm font-bold text-text-secondary sm:flex-none">{t.cancel}</button><button type="submit" data-testid="save-automation-rule" disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-red px-5 text-sm font-black text-white disabled:opacity-50 sm:flex-none">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{busy ? t.saving : t.save}</button></div></footer>
      </form>
    </section>
  </div>;
}

const inputClass = 'min-h-11 w-full rounded-xl border border-border bg-ink-900 px-3 py-2 text-sm text-white outline-none placeholder:text-text-muted focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 disabled:opacity-50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs font-extrabold text-text-secondary">{label}</span>{children}</label>;
}

function NumberField({ label, testId, value, onChange, min, max, required }: { label: string; testId: string; value: string; onChange: (value: string) => void; min: number; max: number; required?: boolean }) {
  return <Field label={label}><input data-testid={testId} type="number" required={required} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} dir="ltr" /></Field>;
}

function EditorSection({ title, actionLabel, onAdd, testId, children }: { title: string; actionLabel: string; onAdd: () => void; testId: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-ink-800/40 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-white">{title}</h3><button type="button" data-testid={testId} onClick={onAdd} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-red/30 px-3 text-xs font-black text-brand-red hover:bg-brand-red/10"><Plus className="size-4" />{actionLabel}</button></div>{children}</section>;
}
