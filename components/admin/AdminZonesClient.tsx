'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity, BarChart3, Bell, CheckCircle2, CreditCard, Home, Map, MapPin,
  Plus, Search, Settings, ShoppingBag, Store, Truck, Users, X, XCircle,
} from 'lucide-react';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import { EmptyState, KpiTile, PageHeader, PortalCard, StatusPill } from '@/components/portal/PortalPrimitives';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';
import { useModalAccessibility } from '@/lib/hooks/use-modal-accessibility';

export interface DeliveryZoneRecord {
  id: string;
  name: string;
  description?: string | null;
  polygon?: unknown;
  center_lat?: number | string | null;
  center_lng?: number | string | null;
  radius_km?: number | string | null;
  delivery_fee?: number | string | null;
  min_order_amount?: number | string | null;
  priority?: number | null;
  is_active?: boolean;
  version?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  surge_multiplier?: number | string | null;
  surge_days?: number[] | null;
  surge_start_local?: string | null;
  surge_end_local?: string | null;
  surge_timezone?: string | null;
}

type ZoneFormState = {
  name: string; description: string; center_lat: string; center_lng: string;
  radius_km: string; delivery_fee: string; min_order_amount: string; priority: string; is_active: boolean; effective_from: string; effective_to: string;
  surge_multiplier: string; surge_days: number[]; surge_start_local: string; surge_end_local: string;
};

const localDateTime = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const EMPTY_FORM: ZoneFormState = { name: '', description: '', center_lat: '50.82', center_lng: '6.98', radius_km: '5', delivery_fee: '3.99', min_order_amount: '0', priority: '0', is_active: true, effective_from: localDateTime(new Date().toISOString()), effective_to: '', surge_multiplier: '1', surge_days: [0, 1, 2, 3, 4, 5, 6], surge_start_local: '11:30', surge_end_local: '14:00' };

const EXTRA_COPY = {
  de: { version: 'Regelversion', effectiveFrom: 'Gültig ab', effectiveTo: 'Gültig bis (optional)', testTitle: 'Adresse gegen aktive Regeln testen', test: 'Abdeckung prüfen', inside: 'Adresse wird beliefert', outside: 'Außerhalb der aktiven Lieferzonen', unavailable: 'Prüfung momentan nicht verfügbar' },
  ar: { version: 'نسخة القاعدة', effectiveFrom: 'سارية من', effectiveTo: 'سارية حتى (اختياري)', testTitle: 'اختبار العنوان على القواعد النشطة', test: 'فحص التغطية', inside: 'العنوان ضمن نطاق التوصيل', outside: 'خارج مناطق التوصيل النشطة', unavailable: 'الفحص غير متاح حاليًا' },
  en: { version: 'Rule version', effectiveFrom: 'Effective from', effectiveTo: 'Effective until (optional)', testTitle: 'Test address against active rules', test: 'Check coverage', inside: 'Address is serviceable', outside: 'Outside active delivery zones', unavailable: 'Coverage check is currently unavailable' },
} as const;

const SURGE_COPY = {
  de: { title: 'Auslastungspreis', multiplier: 'Multiplikator (max. 2×)', start: 'Beginn', end: 'Ende', days: 'Gültige Wochentage', disabled: '1,00× deaktiviert den Zuschlag', weekdays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] },
  ar: { title: 'تسعير وقت الذروة', multiplier: 'المضاعف (الحد الأقصى 2×)', start: 'البداية', end: 'النهاية', days: 'أيام التطبيق', disabled: 'القيمة 1.00× توقف رسوم الذروة', weekdays: ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'] },
  en: { title: 'Peak-time pricing', multiplier: 'Multiplier (maximum 2×)', start: 'Start', end: 'End', days: 'Active weekdays', disabled: '1.00× disables the adjustment', weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
} as const;

const COPY = {
  de: { overview: 'Übersicht', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Bestellungen', management: 'Management', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', zones: 'Lieferzonen', business: 'Business', finance: 'Finanzen', analytics: 'Analytics', system: 'System', notifications: 'Benachrichtigungen', configuration: 'Konfiguration', title: 'Lieferzonen', subtitle: 'Abdeckung, Preise und Prioritäten für Liefergebiete verwalten.', total: 'Gesamt', active: 'Aktiv', inactive: 'Inaktiv', radius: 'Abdeckung', newZone: 'Neue Zone', all: 'Alle', search: 'Zonen durchsuchen…', empty: 'Keine Lieferzonen', emptyBody: 'Erstellen Sie die erste Zone, um Abdeckung und Preise festzulegen.', fee: 'Liefergebühr', minimum: 'Mindestbestellwert', priority: 'Priorität', center: 'Mittelpunkt', edit: 'Bearbeiten', pause: 'Deaktivieren', resume: 'Aktivieren', confirmPause: 'Diese Lieferzone deaktivieren?', saved: 'Lieferzone gespeichert.', updated: 'Status aktualisiert.', failed: 'Aktion fehlgeschlagen. Bitte erneut versuchen.', createTitle: 'Lieferzone erstellen', editTitle: 'Lieferzone bearbeiten', name: 'Name', description: 'Beschreibung', latitude: 'Breitengrad', longitude: 'Längengrad', radiusKm: 'Radius (km)', save: 'Speichern', cancel: 'Abbrechen', saving: 'Wird gespeichert…', required: 'Bitte prüfen Sie Name, Koordinaten, Radius und Preise.', zonesUnit: 'Zonen', km: 'km' },
  ar: { overview: 'نظرة عامة', dashboard: 'لوحة التحكم', controlCenter: 'مركز التحكم', orders: 'الطلبات', management: 'الإدارة', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', zones: 'مناطق التوصيل', business: 'الأعمال', finance: 'المالية', analytics: 'التحليلات', system: 'النظام', notifications: 'الإشعارات', configuration: 'الإعدادات', title: 'مناطق التوصيل', subtitle: 'إدارة التغطية والأسعار والأولوية لكل منطقة توصيل.', total: 'الإجمالي', active: 'نشطة', inactive: 'متوقفة', radius: 'نطاق التغطية', newZone: 'منطقة جديدة', all: 'الكل', search: 'ابحث في المناطق…', empty: 'لا توجد مناطق توصيل', emptyBody: 'أنشئ أول منطقة لتحديد التغطية والأسعار.', fee: 'رسوم التوصيل', minimum: 'الحد الأدنى', priority: 'الأولوية', center: 'مركز المنطقة', edit: 'تعديل', pause: 'إيقاف', resume: 'تفعيل', confirmPause: 'هل تريد إيقاف منطقة التوصيل هذه؟', saved: 'تم حفظ منطقة التوصيل.', updated: 'تم تحديث الحالة.', failed: 'تعذر تنفيذ العملية. حاول مجددًا.', createTitle: 'إنشاء منطقة توصيل', editTitle: 'تعديل منطقة التوصيل', name: 'الاسم', description: 'الوصف', latitude: 'خط العرض', longitude: 'خط الطول', radiusKm: 'نصف القطر (كم)', save: 'حفظ', cancel: 'إلغاء', saving: 'جارٍ الحفظ…', required: 'تحقق من الاسم والإحداثيات ونطاق التغطية والأسعار.', zonesUnit: 'مناطق', km: 'كم' },
  en: { overview: 'Overview', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Orders', management: 'Management', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', zones: 'Delivery zones', business: 'Business', finance: 'Finance', analytics: 'Analytics', system: 'System', notifications: 'Notifications', configuration: 'Configuration', title: 'Delivery zones', subtitle: 'Manage coverage, pricing, and priority for every delivery area.', total: 'Total', active: 'Active', inactive: 'Inactive', radius: 'Coverage', newZone: 'New zone', all: 'All', search: 'Search zones…', empty: 'No delivery zones', emptyBody: 'Create the first zone to define coverage and pricing.', fee: 'Delivery fee', minimum: 'Minimum order', priority: 'Priority', center: 'Zone center', edit: 'Edit', pause: 'Deactivate', resume: 'Activate', confirmPause: 'Deactivate this delivery zone?', saved: 'Delivery zone saved.', updated: 'Status updated.', failed: 'The action failed. Please try again.', createTitle: 'Create delivery zone', editTitle: 'Edit delivery zone', name: 'Name', description: 'Description', latitude: 'Latitude', longitude: 'Longitude', radiusKm: 'Radius (km)', save: 'Save', cancel: 'Cancel', saving: 'Saving…', required: 'Check the name, coordinates, radius, and pricing.', zonesUnit: 'zones', km: 'km' },
} satisfies Record<Locale, Record<string, string>>;

function numeric(value: number | string | null | undefined) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function currency(value: number | string | null | undefined, locale: Locale) { return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(numeric(value)); }

export function AdminZonesClient({ initialZones, userName }: { initialZones: DeliveryZoneRecord[]; userName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenCreate = searchParams.get('create') === '1';
  const { locale, setLocale } = useI18n();
  const copy = COPY[locale];
  const extra = EXTRA_COPY[locale];
  const surgeCopy = SURGE_COPY[locale];
  const [zones, setZones] = useState(initialZones);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editing, setEditing] = useState<DeliveryZoneRecord | 'new' | null>(() => shouldOpenCreate ? 'new' : null);
  const [form, setForm] = useState<ZoneFormState>(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [testPoint, setTestPoint] = useState({ lat: '50.82', lng: '6.98' });
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const navSections: { title: string; items: NavItem[] }[] = [
    { title: copy.overview, items: [{ href: '/admin/dashboard', label: copy.dashboard, icon: Home, exact: true }, { href: '/admin/control-center', label: copy.controlCenter, icon: Activity }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }] },
    { title: copy.management, items: [{ href: '/admin/users', label: copy.customers, icon: Users }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }, { href: '/admin/zones', label: copy.zones, icon: Map }] },
    { title: copy.business, items: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }] },
    { title: copy.system, items: [{ href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ];
  const activeCount = zones.filter((zone) => zone.is_active !== false).length;
  const totalCoverage = zones.filter((zone) => zone.is_active !== false).reduce((sum, zone) => sum + numeric(zone.radius_km), 0);
  const visible = useMemo(() => zones.filter((zone) => {
    const matchesQuery = `${zone.name} ${zone.description || ''}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
    const matchesFilter = filter === 'all' || (filter === 'active' ? zone.is_active !== false : zone.is_active === false);
    return matchesQuery && matchesFilter;
  }), [zones, query, filter, locale]);

  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh(); };
  const openCreate = () => { setEditing('new'); setForm(EMPTY_FORM); setNotice(null); };
  const openEdit = (zone: DeliveryZoneRecord) => { setEditing(zone); setForm({ name: zone.name, description: zone.description || '', center_lat: String(zone.center_lat ?? ''), center_lng: String(zone.center_lng ?? ''), radius_km: String(zone.radius_km ?? ''), delivery_fee: String(zone.delivery_fee ?? 0), min_order_amount: String(zone.min_order_amount ?? 0), priority: String(zone.priority ?? 0), is_active: zone.is_active !== false, effective_from: localDateTime(zone.effective_from || new Date().toISOString()), effective_to: localDateTime(zone.effective_to), surge_multiplier: String(zone.surge_multiplier ?? 1), surge_days: Array.isArray(zone.surge_days) ? zone.surge_days : [0, 1, 2, 3, 4, 5, 6], surge_start_local: zone.surge_start_local?.slice(0, 5) || '11:30', surge_end_local: zone.surge_end_local?.slice(0, 5) || '14:00' }); setNotice(null); };
  const payload = () => ({ ...form, center_lat: Number(form.center_lat), center_lng: Number(form.center_lng), radius_km: Number(form.radius_km), delivery_fee: Number(form.delivery_fee), min_order_amount: Number(form.min_order_amount), priority: Number(form.priority), surge_multiplier: Number(form.surge_multiplier), surge_timezone: 'Europe/Berlin', effective_from: new Date(form.effective_from).toISOString(), effective_to: form.effective_to ? new Date(form.effective_to).toISOString() : null, polygon: [] });
  const testCoverage = async () => { setTestResult(null); try { const response = await fetch('/api/zone/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: Number(testPoint.lat), lng: Number(testPoint.lng) }) }); const result = await response.json(); if (!response.ok) throw new Error(); setTestResult({ ok: Boolean(result.result?.ok), text: result.result?.ok ? `${extra.inside} · ${result.result.zone?.name || ''} · ${currency(result.result.pricing?.deliveryFee ?? result.result.zone?.delivery_fee, locale)}${result.result.pricing?.surgeActive ? ` · ×${Number(result.result.pricing.multiplier).toFixed(2)}` : ''}` : extra.outside }); } catch { setTestResult({ ok: false, text: extra.unavailable }); } };
  const submit = async () => {
    if (form.name.trim().length < 2 || ![form.center_lat, form.center_lng, form.radius_km, form.delivery_fee, form.min_order_amount, form.priority, form.surge_multiplier].every((value) => value !== '' && Number.isFinite(Number(value))) || Number(form.surge_multiplier) < 1 || Number(form.surge_multiplier) > 2 || (Number(form.surge_multiplier) > 1 && (!form.surge_days.length || !form.surge_start_local || !form.surge_end_local || form.surge_start_local === form.surge_end_local))) { setNotice({ tone: 'error', text: copy.required }); return; }
    setBusy('form'); setNotice(null);
    try {
      const isNew = editing === 'new';
      const response = await fetch(isNew ? '/api/admin/zones' : `/api/admin/zones/${(editing as DeliveryZoneRecord).id}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify(payload()) });
      const result = await response.json();
      if (!response.ok || !result.zone) throw new Error(extractErrorMessage(result, copy.failed));
      setZones((current) => isNew ? [result.zone, ...current] : current.map((zone) => zone.id === result.zone.id ? result.zone : zone));
      setEditing(null); setNotice({ tone: 'success', text: copy.saved }); router.refresh();
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : copy.failed }); } finally { setBusy(null); }
  };
  const toggle = async (zone: DeliveryZoneRecord) => {
    if (zone.is_active !== false && !window.confirm(copy.confirmPause)) return;
    setBusy(zone.id); setNotice(null);
    try {
      const response = await fetch(`/api/admin/zones/${zone.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify({ is_active: zone.is_active === false }) });
      const result = await response.json();
      if (!response.ok || !result.zone) throw new Error(extractErrorMessage(result, copy.failed));
      setZones((current) => current.map((item) => item.id === result.zone.id ? result.zone : item)); setNotice({ tone: 'success', text: copy.updated }); router.refresh();
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : copy.failed }); } finally { setBusy(null); }
  };

  return <PortalShell brand={{ name: 'BlinkGo Admin', tagline: copy.zones, emoji: '👑' }} navSections={navSections} user={{ name: userName, email: userName, role: 'admin' }} locale={locale} onLocaleChange={setLocale} onLogout={logout}>
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader title={copy.title} description={copy.subtitle} actions={<button data-testid="create-zone" type="button" onClick={openCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-red px-5 text-sm font-black text-white hover:bg-brand-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow"><Plus className="size-4" />{copy.newZone}</button>} />
      {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-bold ${notice.tone === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>{notice.text}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={copy.total} value={zones.length} hint={copy.zonesUnit} icon={<Map className="size-5" />} />
        <KpiTile label={copy.active} value={activeCount} hint={`${zones.length ? Math.round(activeCount / zones.length * 100) : 0}%`} tone="success" icon={<CheckCircle2 className="size-5" />} />
        <KpiTile label={copy.inactive} value={zones.length - activeCount} hint={copy.zonesUnit} tone="warning" icon={<XCircle className="size-5" />} />
        <KpiTile label={copy.radius} value={`${totalCoverage.toFixed(1)} ${copy.km}`} hint={copy.active} tone="info" icon={<MapPin className="size-5" />} />
      </div>
      <PortalCard><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><label className="relative block flex-1"><span className="sr-only">{copy.search}</span><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="min-h-11 w-full rounded-xl border border-border bg-bg pe-4 ps-10 text-sm outline-none focus:border-brand-red" /></label><div className="flex gap-2 overflow-x-auto">{(['all', 'active', 'inactive'] as const).map((value) => <button type="button" key={value} onClick={() => setFilter(value)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold ${filter === value ? 'bg-brand-red text-white' : 'border border-border bg-bg text-text-muted hover:text-text-primary'}`}>{copy[value]} ({value === 'all' ? zones.length : value === 'active' ? activeCount : zones.length - activeCount})</button>)}</div></div></PortalCard>
      {visible.length === 0 ? <PortalCard><EmptyState icon={<Map className="size-8" />} title={copy.empty} description={copy.emptyBody} action={<button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-red px-5 text-sm font-black text-white"><Plus className="size-4" />{copy.newZone}</button>} /></PortalCard> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((zone) => <PortalCard key={zone.id} className="relative overflow-hidden"><div className={`absolute inset-x-0 top-0 h-1 ${zone.is_active === false ? 'bg-text-muted' : 'bg-gradient-to-r from-brand-red to-brand-yellow'}`} /><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-black">{zone.name}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm text-text-muted">{zone.description || copy.subtitle}</p></div><StatusPill status={zone.is_active === false ? 'inactive' : 'active'} label={zone.is_active === false ? copy.inactive : copy.active} /></div><div className="mt-5 grid grid-cols-3 gap-2 border-y border-border py-4 text-center"><ZoneMetric label={copy.radius} value={`${numeric(zone.radius_km).toFixed(1)} ${copy.km}`} /><ZoneMetric label={copy.fee} value={currency(zone.delivery_fee, locale)} /><ZoneMetric label={copy.minimum} value={currency(zone.min_order_amount, locale)} /></div><div className="mt-4 space-y-2 text-xs text-text-muted"><p className="flex items-center justify-between gap-3"><span>{copy.center}</span><strong dir="ltr" className="font-mono text-text-primary">{numeric(zone.center_lat).toFixed(5)}, {numeric(zone.center_lng).toFixed(5)}</strong></p><p className="flex items-center justify-between"><span>{copy.priority}</span><strong className="text-text-primary">{zone.priority ?? 0}</strong></p></div><div className="mt-5 flex gap-2"><button type="button" onClick={() => openEdit(zone)} className="min-h-11 flex-1 rounded-xl border border-border text-sm font-bold hover:border-brand-red hover:text-brand-red">{copy.edit}</button><button type="button" disabled={busy === zone.id} onClick={() => toggle(zone)} className={`min-h-11 flex-1 rounded-xl border text-sm font-bold disabled:opacity-50 ${zone.is_active === false ? 'border-status-success/40 text-status-success' : 'border-status-warning/40 text-status-warning'}`}>{zone.is_active === false ? copy.resume : copy.pause}</button></div></PortalCard>)}</div>}
      <ZoneTester
        title={extra.testTitle}
        buttonLabel={extra.test}
        point={testPoint}
        result={testResult}
        onPointChange={setTestPoint}
        onTest={testCoverage}
      />
    </div>
    {editing && <ZoneDialog copy={copy} extra={extra} surge={surgeCopy} form={form} setForm={setForm} editing={editing} busy={busy === 'form'} onClose={() => setEditing(null)} onSubmit={submit} />}
  </PortalShell>;
}

function ZoneMetric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] text-text-muted">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>; }

function ZoneTester({ title, buttonLabel, point, result, onPointChange, onTest }: {
  title: string;
  buttonLabel: string;
  point: { lat: string; lng: string };
  result: { ok: boolean; text: string } | null;
  onPointChange: (point: { lat: string; lng: string }) => void;
  onTest: () => void;
}) {
  const canTest = Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng));
  return <PortalCard>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
      <div className="flex-1">
        <h2 className="text-base font-black">{title}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label><span className="mb-1.5 block text-xs font-bold text-text-muted">Latitude</span><input aria-label="Latitude" inputMode="decimal" value={point.lat} onChange={(event) => onPointChange({ ...point, lat: event.target.value })} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 font-mono text-sm outline-none focus:border-brand-red" /></label>
          <label><span className="mb-1.5 block text-xs font-bold text-text-muted">Longitude</span><input aria-label="Longitude" inputMode="decimal" value={point.lng} onChange={(event) => onPointChange({ ...point, lng: event.target.value })} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 font-mono text-sm outline-none focus:border-brand-red" /></label>
        </div>
      </div>
      <button type="button" disabled={!canTest} onClick={onTest} className="min-h-11 rounded-xl bg-brand-red px-6 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{buttonLabel}</button>
    </div>
    {result && <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${result.ok ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-warning/30 bg-status-warning/10 text-status-warning'}`}>{result.text}</p>}
  </PortalCard>;
}

function ZoneDialog({ copy, extra, surge, form, setForm, editing, busy, onClose, onSubmit }: { copy: typeof COPY.de; extra: { effectiveFrom: string; effectiveTo: string }; surge: { title: string; multiplier: string; start: string; end: string; days: string; disabled: string; weekdays: readonly string[] }; form: ZoneFormState; setForm: (next: ZoneFormState) => void; editing: DeliveryZoneRecord | 'new'; busy: boolean; onClose: () => void; onSubmit: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalAccessibility(true, onClose, closeButtonRef);
  const update = (field: keyof ZoneFormState, value: string | boolean | number[]) => setForm({ ...form, [field]: value });
  const fields: { key: keyof ZoneFormState; label: string; type?: string; step?: string }[] = [
    { key: 'name', label: copy.name }, { key: 'center_lat', label: copy.latitude, type: 'number', step: '0.000001' }, { key: 'center_lng', label: copy.longitude, type: 'number', step: '0.000001' }, { key: 'radius_km', label: copy.radiusKm, type: 'number', step: '0.1' }, { key: 'delivery_fee', label: copy.fee, type: 'number', step: '0.01' }, { key: 'min_order_amount', label: copy.minimum, type: 'number', step: '0.01' }, { key: 'priority', label: copy.priority, type: 'number', step: '1' },
    { key: 'effective_from', label: extra.effectiveFrom, type: 'datetime-local' }, { key: 'effective_to', label: extra.effectiveTo, type: 'datetime-local' },
    { key: 'surge_multiplier', label: surge.multiplier, type: 'number', step: '0.05' },
  ];
  return <div role="dialog" aria-modal="true" aria-labelledby="zone-dialog-title" className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-2xl sm:max-w-2xl sm:rounded-3xl">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border p-5 sm:p-6">
        <h2 id="zone-dialog-title" className="text-xl font-black">{editing === 'new' ? copy.createTitle : copy.editTitle}</h2>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={copy.cancel} className="grid size-11 place-items-center rounded-xl border border-border hover:text-brand-red"><X className="size-5" /></button>
      </div>
      <div className="grid overflow-y-auto p-5 gap-4 sm:grid-cols-2 sm:p-6">
        {fields.map((field) => <label key={field.key} className={field.key === 'name' ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-bold text-text-muted">{field.label}</span><input data-testid={`zone-${field.key}`} required={field.key !== 'effective_to'} min={field.key === 'surge_multiplier' ? '1' : undefined} max={field.key === 'surge_multiplier' ? '2' : undefined} type={field.type || 'text'} step={field.step} value={String(form[field.key])} onChange={(event) => update(field.key, event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red" /></label>)}
        <fieldset className="rounded-2xl border border-brand-yellow/25 bg-brand-yellow/5 p-4 sm:col-span-2">
          <legend className="px-2 text-sm font-black text-brand-yellow">{surge.title}</legend>
          {Number(form.surge_multiplier) <= 1 ? <p className="text-xs text-text-muted">{surge.disabled}</p> : <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{surge.start}</span><input type="time" required value={form.surge_start_local} onChange={(event) => update('surge_start_local', event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red" /></label>
              <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{surge.end}</span><input type="time" required value={form.surge_end_local} onChange={(event) => update('surge_end_local', event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red" /></label>
            </div>
            <div><p className="mb-2 text-xs font-bold text-text-muted">{surge.days}</p><div className="flex flex-wrap gap-2">{surge.weekdays.map((label, day) => { const selected = form.surge_days.includes(day); return <button key={day} type="button" aria-pressed={selected} onClick={() => update('surge_days', selected ? form.surge_days.filter((value) => value !== day) : [...form.surge_days, day].sort())} className={`min-h-11 min-w-11 rounded-xl border px-3 text-xs font-black ${selected ? 'border-brand-yellow bg-brand-yellow text-black' : 'border-border bg-bg text-text-muted'}`}>{label}</button>; })}</div></div>
          </div>}
        </fieldset>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-text-muted">{copy.description}</span><textarea rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} className="w-full rounded-xl border border-border bg-bg p-3 text-sm outline-none focus:border-brand-red" /></label>
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2"><input type="checkbox" checked={form.is_active} onChange={(event) => update('is_active', event.target.checked)} className="size-5 accent-brand-red" /><span className="text-sm font-bold">{copy.active}</span></label>
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:flex-row sm:justify-end sm:px-6"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-border px-5 text-sm font-bold">{copy.cancel}</button><button type="button" disabled={busy} onClick={onSubmit} className="min-h-11 rounded-xl bg-brand-red px-6 text-sm font-black text-white disabled:opacity-50">{busy ? copy.saving : copy.save}</button></div>
    </div>
  </div>;
}
