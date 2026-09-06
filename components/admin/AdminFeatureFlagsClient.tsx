'use client';

import { useMemo, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Save from 'lucide-react/dist/esm/icons/save';
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert';
import ToggleLeft from 'lucide-react/dist/esm/icons/toggle-left';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { ActiveOrderPolicy, FeatureFlagRecord } from '@/lib/platform/feature-flags';

type Locale = 'de' | 'ar' | 'en';

const copy = {
  de: {
    title: 'Feature-Steuerung', subtitle: 'Rollouts, Abhängigkeiten und Kill Switches mit Versionsschutz.',
    warning: 'Kill Switches stoppen neue Vorgänge. Aktive Bestellungen bleiben gemäß Richtlinie geschützt.',
    feature: 'Features', kill_switch: 'Kill Switches', surface: 'Schreibzugriffe', enabled: 'Aktiv', disabled: 'Gestoppt',
    rollout: 'Rollout', policy: 'Aktive Bestellungen', reason: 'Begründung der Änderung', save: 'Sicher speichern',
    reload: 'Neu laden', saved: 'Gespeichert', conflict: 'Die Konfiguration wurde parallel geändert. Bitte neu laden.',
    required: 'Mindestens 8 Zeichen Begründung erforderlich.', allow: 'Normal anwenden', preserve_active: 'Aktive Bestellungen schützen', block_all: 'Alles blockieren',
    readOnly: 'Manager können den Status lesen; Änderungen erfordern Admin-Rechte.', empty: 'Migration noch nicht angewendet oder keine Flags vorhanden.', degraded: 'Sicherer Fallback aktiv: Die Datenbank-Konfiguration ist nicht erreichbar. Änderungen bleiben gesperrt, bis die Migration aktiv ist.',
  },
  en: {
    title: 'Feature controls', subtitle: 'Version-protected rollouts, dependencies and kill switches.',
    warning: 'Kill switches stop new operations. Active orders remain protected according to policy.',
    feature: 'Features', kill_switch: 'Kill switches', surface: 'Write surfaces', enabled: 'Enabled', disabled: 'Stopped',
    rollout: 'Rollout', policy: 'Active orders', reason: 'Change reason', save: 'Save safely', reload: 'Reload', saved: 'Saved',
    conflict: 'Configuration changed concurrently. Reload before retrying.', required: 'A change reason of at least 8 characters is required.',
    allow: 'Apply normally', preserve_active: 'Preserve active orders', block_all: 'Block everything',
    readOnly: 'Managers can view status; changes require administrator access.', empty: 'Migration not applied yet or no flags are available.', degraded: 'Safe fallback is active: database configuration is unavailable. Changes remain locked until the migration is active.',
  },
  ar: {
    title: 'التحكم بالميزات', subtitle: 'تفعيل تدريجي ومفاتيح إيقاف مع حماية بالإصدارات والتبعيات.',
    warning: 'مفاتيح الإيقاف تمنع العمليات الجديدة، وتبقى الطلبات النشطة محمية حسب السياسة.',
    feature: 'الميزات', kill_switch: 'مفاتيح الإيقاف', surface: 'عمليات الكتابة', enabled: 'مفعّل', disabled: 'متوقف',
    rollout: 'نسبة التفعيل', policy: 'الطلبات النشطة', reason: 'سبب التغيير', save: 'حفظ آمن', reload: 'إعادة تحميل', saved: 'تم الحفظ',
    conflict: 'تم تعديل الإعداد بالتزامن. أعد التحميل قبل المحاولة.', required: 'يجب كتابة سبب من 8 أحرف على الأقل.',
    allow: 'تطبيق عادي', preserve_active: 'حماية الطلبات النشطة', block_all: 'إيقاف كامل',
    readOnly: 'يمكن للمدير القراءة فقط، والتعديل يحتاج صلاحية Admin.', empty: 'لم تُطبّق الهجرة بعد أو لا توجد أعلام.', degraded: 'الوضع الآمن البديل مفعّل: إعدادات قاعدة البيانات غير متاحة، والتعديل مقفل حتى تطبيق الهجرة.',
  },
} as const;

type Draft = { enabled: boolean; rollout: number; policy: ActiveOrderPolicy; reason: string };

export function AdminFeatureFlagsClient({ initialFlags, user, locale, degraded = false }: { initialFlags: FeatureFlagRecord[]; user: AdminUser; locale: Locale; degraded?: boolean }) {
  const text = copy[locale];
  const rtl = locale === 'ar';
  const readOnly = user.role === 'manager' || degraded;
  const [flags, setFlags] = useState(initialFlags);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const groups = useMemo(() => (['kill_switch', 'surface', 'feature'] as const).map((kind) => ({ kind, flags: flags.filter((flag) => flag.kind === kind) })), [flags]);
  const draftFor = (flag: FeatureFlagRecord): Draft => drafts[flag.key] ?? { enabled: flag.enabled, rollout: flag.rollout_percentage, policy: flag.active_order_policy, reason: '' };
  const updateDraft = (flag: FeatureFlagRecord, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [flag.key]: { ...draftFor(flag), ...patch } }));

  const reload = async () => {
    setNotice(null);
    const response = await fetch('/api/admin/feature-flags', { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    const nextFlags = payload?.data?.flags ?? payload?.flags;
    if (response.ok && Array.isArray(nextFlags)) {
      setFlags(nextFlags);
      setDrafts({});
    }
  };

  const save = async (flag: FeatureFlagRecord) => {
    const draft = draftFor(flag);
    if (draft.reason.trim().length < 8) {
      setNotice({ kind: 'error', message: text.required });
      return;
    }
    setSaving(flag.key);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: flag.key,
          expected_version: flag.version,
          enabled: draft.enabled,
          rollout_percentage: draft.rollout,
          active_order_policy: draft.policy,
          change_reason: draft.reason.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      const updated = payload?.data?.flag ?? payload?.flag;
      if (response.status === 409) {
        setNotice({ kind: 'error', message: text.conflict });
      } else if (!response.ok || !updated) {
        setNotice({ kind: 'error', message: payload?.error?.message ?? payload?.message ?? text.conflict });
      } else {
        setFlags((current) => current.map((item) => item.key === flag.key ? updated : item));
        setDrafts((current) => { const next = { ...current }; delete next[flag.key]; return next; });
        setNotice({ kind: 'success', message: `${text.saved}: ${flag.key} · v${updated.version}` });
      }
    } finally {
      setSaving(null);
    }
  };

  return (
    <AdminLayout user={user} locale={locale}>
      <main className="space-y-6" dir={rtl ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3"><ToggleLeft className="h-8 w-8 text-racing-red" /><h1 className="text-3xl font-black text-ink-1 dark:text-white">{text.title}</h1></div>
            <p className="mt-2 max-w-3xl text-sm text-ink-3 dark:text-zinc-400">{text.subtitle}</p>
          </div>
          <button type="button" onClick={reload} className="flex min-h-11 items-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm font-bold dark:border-zinc-700">
            <RefreshCw className="h-4 w-4" />{text.reload}
          </button>
        </header>

        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-900 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>{text.warning}</p>
        </div>
        {user.role === 'manager' && <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-900 dark:text-sky-100">{text.readOnly}</div>}
        {degraded && <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm font-bold text-red-900 dark:text-red-100">{text.degraded}</div>}
        {notice && <div role="status" className={`flex items-center gap-2 rounded-2xl border p-4 text-sm ${notice.kind === 'success' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-800 dark:text-emerald-200' : 'border-red-400/40 bg-red-400/10 text-red-800 dark:text-red-200'}`}>
          {notice.kind === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}{notice.message}
        </div>}

        {flags.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-ink-3 dark:border-zinc-700">{text.empty}</div>}
        {groups.map((group) => group.flags.length > 0 && (
          <section key={group.kind} className="space-y-3">
            <h2 className="text-lg font-black text-ink-1 dark:text-white">{text[group.kind]}</h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {group.flags.map((flag) => {
                const draft = draftFor(flag);
                const changed = draft.enabled !== flag.enabled || draft.rollout !== flag.rollout_percentage || draft.policy !== flag.active_order_policy || draft.reason.length > 0;
                return (
                  <article key={flag.key} className={`rounded-2xl border p-5 ${draft.enabled ? 'border-emerald-500/25 bg-white dark:bg-zinc-950' : 'border-red-500/40 bg-red-500/[0.04] dark:bg-red-950/10'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0"><p className="break-all font-mono text-sm font-black text-ink-1 dark:text-white">{flag.key}</p><p className="mt-1 text-sm text-ink-3 dark:text-zinc-400">{flag.description}</p></div>
                      <button type="button" role="switch" aria-checked={draft.enabled} disabled={readOnly} onClick={() => updateDraft(flag, { enabled: !draft.enabled })} className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60 ${draft.enabled ? 'bg-emerald-600' : 'bg-racing-red'}`}>{draft.enabled ? text.enabled : text.disabled}</button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">{flag.dependencies.map((dependency) => <span key={dependency} className="rounded-full bg-zinc-100 px-3 py-1 font-mono dark:bg-zinc-800">↳ {dependency}</span>)}<span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">v{flag.version}</span></div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-bold">{text.rollout}: {draft.rollout}%<input type="range" min="0" max="100" step="5" value={draft.rollout} disabled={readOnly} onChange={(event) => updateDraft(flag, { rollout: Number(event.target.value) })} className="mt-2 block min-h-11 w-full accent-red-600" /></label>
                      <label className="text-sm font-bold">{text.policy}<select value={draft.policy} disabled={readOnly} onChange={(event) => updateDraft(flag, { policy: event.target.value as ActiveOrderPolicy })} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"><option value="allow">{text.allow}</option><option value="preserve_active">{text.preserve_active}</option><option value="block_all">{text.block_all}</option></select></label>
                    </div>
                    {!readOnly && <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={draft.reason} onChange={(event) => updateDraft(flag, { reason: event.target.value })} placeholder={text.reason} maxLength={500} className="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 text-sm dark:border-zinc-700" /><button type="button" disabled={!changed || saving === flag.key} onClick={() => save(flag)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-racing-red px-5 text-sm font-black text-white disabled:opacity-40"><Save className="h-4 w-4" />{text.save}</button></div>}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </AdminLayout>
  );
}
