'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Euro from 'lucide-react/dist/esm/icons/euro';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Save from 'lucide-react/dist/esm/icons/save';
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert';
import SlidersHorizontal from 'lucide-react/dist/esm/icons/sliders-horizontal';
import Timer from 'lucide-react/dist/esm/icons/timer';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { Locale } from '@/lib/i18n/server-translations';
import type { DelayReviewPolicy } from '@/lib/admin/delay-policy';
import { cn } from '@/lib/cn';

interface Incident {
  order_id: string; order_number: string | null; status: string; total: number; restaurant_name: string | null; driver_id: string | null;
  issue_code: string | null; issue_reported_at: string | null; restaurant_wait_minutes: number; wait_active: boolean;
  severity: 'normal' | 'warning' | 'critical'; recommended_credit_cents: number | null; active: boolean; updated_at: string;
}

interface DelayData {
  policy: DelayReviewPolicy;
  incidents: Incident[];
  summary: { total: number; warning: number; critical: number; reviewEligible: number };
}

const COPY = {
  de: { title: 'Verzögerungen & Kulanzprüfung', subtitle: 'Live-Überblick über Fahrer-Meldungen, Restaurantwartezeit und faire Kulanzempfehlungen.', refresh: 'Aktualisieren', total: 'Vorfälle', warning: 'Zu prüfen', critical: 'Kritisch', eligible: 'Kulanzprüfung', policy: 'Prüfrichtlinie', policyBody: 'Diese Regeln erzeugen nur eine Empfehlung. Es wird niemals automatisch Geld ausgezahlt.', enabled: 'Empfehlungen aktiv', reviewAfter: 'Prüfung ab', criticalAfter: 'Kritisch ab', baseCredit: 'Basisempfehlung', perMinute: 'Je weiterer Minute', maxCredit: 'Maximale Empfehlung', minutes: 'Minuten', save: 'Richtlinie speichern', saved: 'Richtlinie gespeichert', saveFailed: 'Richtlinie konnte nicht gespeichert werden.', incidents: 'Aktuelle Fälle', all: 'Alle', active: 'Nur aktiv', noIncidents: 'Keine Verzögerungsfälle', noIncidentsBody: 'Fahrer-Meldungen und längere Restaurantwartezeiten erscheinen automatisch hier.', order: 'Bestellung', restaurant: 'Restaurant', issue: 'Meldung', wait: 'Wartezeit', recommendation: 'Empfehlung', actions: 'Aktionen', openOrder: 'Bestellung öffnen', review: 'Prüfen', none: 'Keine', loading: 'Live-Daten werden geladen…', loadFailed: 'Verzögerungen konnten nicht geladen werden.', normal: 'Normal', delayed: 'Verzögert', criticalLabel: 'Kritisch' },
  ar: { title: 'التأخيرات ومراجعة التعويض', subtitle: 'متابعة مباشرة لبلاغات السائق ووقت انتظار المطعم وتوصيات التعويض العادلة.', refresh: 'تحديث', total: 'الحالات', warning: 'تحتاج مراجعة', critical: 'حرجة', eligible: 'مؤهلة للمراجعة', policy: 'سياسة المراجعة', policyBody: 'هذه القواعد تقدم توصية فقط ولا تصرف أي مبلغ تلقائيًا.', enabled: 'تفعيل التوصيات', reviewAfter: 'المراجعة بعد', criticalAfter: 'حرجة بعد', baseCredit: 'التوصية الأساسية', perMinute: 'لكل دقيقة إضافية', maxCredit: 'الحد الأعلى للتوصية', minutes: 'دقيقة', save: 'حفظ السياسة', saved: 'تم حفظ السياسة', saveFailed: 'تعذر حفظ السياسة.', incidents: 'الحالات الحالية', all: 'الكل', active: 'النشطة فقط', noIncidents: 'لا توجد حالات تأخير', noIncidentsBody: 'ستظهر بلاغات السائق وأوقات انتظار المطاعم الطويلة هنا تلقائيًا.', order: 'الطلب', restaurant: 'المطعم', issue: 'البلاغ', wait: 'الانتظار', recommendation: 'التوصية', actions: 'الإجراءات', openOrder: 'فتح الطلب', review: 'مراجعة', none: 'لا يوجد', loading: 'جارٍ تحميل البيانات المباشرة…', loadFailed: 'تعذر تحميل حالات التأخير.', normal: 'عادية', delayed: 'متأخرة', criticalLabel: 'حرجة' },
  en: { title: 'Delays & goodwill review', subtitle: 'Live view of driver reports, restaurant wait time, and fair goodwill recommendations.', refresh: 'Refresh', total: 'Incidents', warning: 'Needs review', critical: 'Critical', eligible: 'Goodwill review', policy: 'Review policy', policyBody: 'These rules only create a recommendation. Money is never issued automatically.', enabled: 'Enable recommendations', reviewAfter: 'Review after', criticalAfter: 'Critical after', baseCredit: 'Base recommendation', perMinute: 'Per extra minute', maxCredit: 'Maximum recommendation', minutes: 'minutes', save: 'Save policy', saved: 'Policy saved', saveFailed: 'Policy could not be saved.', incidents: 'Current incidents', all: 'All', active: 'Active only', noIncidents: 'No delay incidents', noIncidentsBody: 'Driver reports and long restaurant waits will appear here automatically.', order: 'Order', restaurant: 'Restaurant', issue: 'Issue', wait: 'Wait', recommendation: 'Recommendation', actions: 'Actions', openOrder: 'Open order', review: 'Review', none: 'None', loading: 'Loading live data…', loadFailed: 'Delay incidents could not be loaded.', normal: 'Normal', delayed: 'Delayed', criticalLabel: 'Critical' },
} satisfies Record<Locale, Record<string, string>>;

const ISSUE_LABELS: Record<string, Record<Locale, string>> = {
  restaurant_delay: { de: 'Restaurant verspätet', ar: 'تأخر المطعم', en: 'Restaurant delay' }, order_not_ready: { de: 'Nicht abholbereit', ar: 'الطلب غير جاهز', en: 'Order not ready' }, cannot_find_restaurant: { de: 'Abholort nicht gefunden', ar: 'تعذر إيجاد المطعم', en: 'Pickup not found' }, cannot_find_customer: { de: 'Adresse nicht gefunden', ar: 'تعذر إيجاد العنوان', en: 'Address not found' }, customer_unreachable: { de: 'Kunde nicht erreichbar', ar: 'الزبون لا يجيب', en: 'Customer unreachable' }, damaged_order: { de: 'Bestellung beschädigt', ar: 'الطلب متضرر', en: 'Damaged order' }, unsafe_situation: { de: 'Sicherheitsfall', ar: 'حالة سلامة', en: 'Safety incident' },
};

async function readApi(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || 'Request failed');
  return payload?.data ?? payload;
}

export function AdminDelaysClient({ user, locale }: { user: AdminUser; locale: Locale }) {
  const copy = COPY[locale];
  const [data, setData] = useState<DelayData | null>(null);
  const [policy, setPolicy] = useState<DelayReviewPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const canEdit = ['admin', 'super_admin'].includes(user.role);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await readApi(await fetch('/api/admin/delays', { cache: 'no-store', credentials: 'include' })) as DelayData;
      setData(next); setPolicy((current) => current ?? next.policy); setMessage('');
    } catch { setMessage(copy.loadFailed); }
    finally { if (!silent) setLoading(false); }
  }, [copy.loadFailed]);

  useEffect(() => { const start = window.setTimeout(() => void load(), 0); const timer = window.setInterval(() => void load(true), 20_000); return () => { window.clearTimeout(start); window.clearInterval(timer); }; }, [load]);
  const visible = useMemo(() => (data?.incidents ?? []).filter((item) => !activeOnly || item.active), [activeOnly, data?.incidents]);

  async function savePolicy() {
    if (!policy || !canEdit) return;
    setSaving(true); setMessage('');
    try {
      const saved = await readApi(await fetch('/api/admin/delays', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(policy) }));
      setPolicy(saved.policy); await load(true); setMessage(copy.saved);
    } catch { setMessage(copy.saveFailed); }
    finally { setSaving(false); }
  }

  return <AdminLayout user={user} locale={locale}><div dir={locale === 'ar' ? 'rtl' : 'ltr'} className="space-y-6" data-testid="admin-delays-page">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-racing-red">BlinkGo Live Ops</p><h1 className="mt-1 text-3xl font-black text-ink-1 dark:text-white">{copy.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-3 dark:text-zinc-400">{copy.subtitle}</p></div><button type="button" onClick={() => void load()} disabled={loading} data-testid="admin-delays-refresh" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black dark:border-zinc-800 dark:bg-zinc-900"><RefreshCw className={cn('size-4', loading && 'animate-spin')} />{copy.refresh}</button></header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: copy.total, value: data?.summary.total ?? 0, icon: Timer, tone: 'text-blue-500 bg-blue-500/10' },
      { label: copy.warning, value: data?.summary.warning ?? 0, icon: AlertTriangle, tone: 'text-amber-500 bg-amber-500/10' },
      { label: copy.critical, value: data?.summary.critical ?? 0, icon: ShieldAlert, tone: 'text-red-500 bg-red-500/10' },
      { label: copy.eligible, value: data?.summary.reviewEligible ?? 0, icon: Euro, tone: 'text-emerald-500 bg-emerald-500/10' },
    ].map(({ label, value, icon: Icon, tone }) => <article key={label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><div className={cn('grid size-11 place-items-center rounded-xl', tone)}><Icon className="size-5" /></div><p className="mt-4 text-3xl font-black text-ink-1 dark:text-white">{value}</p><p className="text-xs font-bold text-zinc-500">{label}</p></article>)}</section>

    {policy && <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" data-testid="admin-delay-policy"><div className="flex items-start gap-3"><div className="grid size-11 place-items-center rounded-xl bg-racing-red/10 text-racing-red"><SlidersHorizontal className="size-5" /></div><div><h2 className="text-xl font-black text-ink-1 dark:text-white">{copy.policy}</h2><p className="mt-1 text-xs leading-5 text-zinc-500">{copy.policyBody}</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><PolicyNumber label={copy.reviewAfter} suffix={copy.minutes} value={policy.reviewAfterMinutes} disabled={!canEdit} onChange={(value) => setPolicy({ ...policy, reviewAfterMinutes: value })} /><PolicyNumber label={copy.criticalAfter} suffix={copy.minutes} value={policy.criticalAfterMinutes} disabled={!canEdit} onChange={(value) => setPolicy({ ...policy, criticalAfterMinutes: value })} /><PolicyNumber label={copy.baseCredit} suffix="€" value={policy.baseCreditCents / 100} disabled={!canEdit} step={0.5} onChange={(value) => setPolicy({ ...policy, baseCreditCents: Math.round(value * 100) })} /><PolicyNumber label={copy.perMinute} suffix="€" value={policy.perExtraMinuteCents / 100} disabled={!canEdit} step={0.05} onChange={(value) => setPolicy({ ...policy, perExtraMinuteCents: Math.round(value * 100) })} /><PolicyNumber label={copy.maxCredit} suffix="€" value={policy.maxCreditCents / 100} disabled={!canEdit} step={0.5} onChange={(value) => setPolicy({ ...policy, maxCreditCents: Math.round(value * 100) })} /></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="inline-flex min-h-11 items-center gap-3 font-bold text-ink-2 dark:text-zinc-300"><input type="checkbox" checked={policy.enabled} disabled={!canEdit} onChange={(event) => setPolicy({ ...policy, enabled: event.target.checked })} className="size-5 accent-red-600" />{copy.enabled}</label>{canEdit && <button type="button" onClick={() => void savePolicy()} disabled={saving} data-testid="admin-delay-policy-save" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-racing-red px-5 text-sm font-black text-white disabled:opacity-50"><Save className="size-4" />{copy.save}</button>}</div>{message && <p role="status" className={cn('mt-3 text-sm font-bold', message === copy.saved ? 'text-emerald-600' : 'text-red-500')}>{message}</p>}</section>}

    <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-ink-1 dark:text-white">{copy.incidents}</h2><p className="text-xs text-zinc-500">{visible.length} / {data?.incidents.length ?? 0}</p></div><div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800"><button type="button" onClick={() => setActiveOnly(false)} aria-pressed={!activeOnly} className={cn('min-h-10 rounded-lg px-3 text-xs font-black', !activeOnly && 'bg-white shadow dark:bg-zinc-700')}>{copy.all}</button><button type="button" onClick={() => setActiveOnly(true)} aria-pressed={activeOnly} className={cn('min-h-10 rounded-lg px-3 text-xs font-black', activeOnly && 'bg-white shadow dark:bg-zinc-700')}>{copy.active}</button></div></div>
      {loading && !data ? <div role="status" className="grid min-h-52 place-items-center text-sm text-zinc-500"><RefreshCw className="mb-2 size-6 animate-spin" />{copy.loading}</div> : visible.length === 0 ? <div data-testid="admin-delays-empty" className="grid min-h-52 place-items-center px-4 text-center"><div><Timer className="mx-auto size-10 text-zinc-400" /><h3 className="mt-3 font-black text-ink-1 dark:text-white">{copy.noIncidents}</h3><p className="mt-1 text-sm text-zinc-500">{copy.noIncidentsBody}</p></div></div> : <div className="mt-4 space-y-3" data-testid="admin-delay-incidents">{visible.map((incident) => <DelayIncidentCard key={incident.order_id} incident={incident} locale={locale} copy={copy} />)}</div>}
    </section>
  </div></AdminLayout>;
}

function PolicyNumber({ label, suffix, value, step = 1, disabled, onChange }: { label: string; suffix: string; value: number; step?: number; disabled: boolean; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-zinc-500">{label}</span><span className="flex min-h-11 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-racing-red dark:border-zinc-700 dark:bg-zinc-800"><input type="number" min="0" step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent text-sm font-black outline-none disabled:opacity-60" /><span className="text-xs text-zinc-500">{suffix}</span></span></label>;
}

function DelayIncidentCard({ incident, locale, copy }: { incident: Incident; locale: Locale; copy: Record<string, string> }) {
  const statusLabel = incident.severity === 'critical' ? copy.criticalLabel : incident.severity === 'warning' ? copy.delayed : copy.normal;
  return <article className={cn('rounded-2xl border p-4', incident.severity === 'critical' ? 'border-red-500/35 bg-red-500/[.05]' : incident.severity === 'warning' ? 'border-amber-500/35 bg-amber-500/[.05]' : 'border-zinc-200 dark:border-zinc-800')} data-testid={`admin-delay-${incident.order_id}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black uppercase', incident.severity === 'critical' ? 'bg-red-500/15 text-red-500' : incident.severity === 'warning' ? 'bg-amber-500/15 text-amber-600' : 'bg-zinc-500/10 text-zinc-500')}>{statusLabel}</span><strong className="text-ink-1 dark:text-white" dir="ltr">#{incident.order_number || incident.order_id.slice(0, 8)}</strong>{incident.active && <span className="size-2 rounded-full bg-emerald-500" aria-label={copy.active} />}</div><div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3"><span><b className="text-ink-2 dark:text-zinc-300">{copy.restaurant}:</b> {incident.restaurant_name || '—'}</span><span><b className="text-ink-2 dark:text-zinc-300">{copy.issue}:</b> {incident.issue_code ? ISSUE_LABELS[incident.issue_code]?.[locale] ?? incident.issue_code : copy.none}</span><span><b className="text-ink-2 dark:text-zinc-300">{copy.wait}:</b> <bdi>{incident.restaurant_wait_minutes} {copy.minutes}</bdi>{incident.wait_active ? ' · LIVE' : ''}</span></div></div><div className="flex flex-wrap items-center gap-2 lg:justify-end"><div className="min-w-28 rounded-xl bg-zinc-100 px-3 py-2 text-center dark:bg-zinc-800"><p className="text-[10px] font-bold text-zinc-500">{copy.recommendation}</p><p className="font-black text-ink-1 dark:text-white">{incident.recommended_credit_cents == null ? '—' : new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale, { style: 'currency', currency: 'EUR' }).format(incident.recommended_credit_cents / 100)}</p></div><Link href={`/admin/orders/${encodeURIComponent(incident.order_id)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-racing-red px-4 text-xs font-black text-white"><ExternalLink className="size-4" />{incident.recommended_credit_cents == null ? copy.openOrder : copy.review}</Link></div></div></article>;
}
