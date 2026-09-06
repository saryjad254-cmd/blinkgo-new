'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, BarChart3, Bell, CheckCircle2, CreditCard, Eye, FileCheck2, Home, Mail, Map,
  Pencil, Phone, Plus, Search, Settings, ShoppingBag, Star, Store, Truck, Users, X, XCircle,
} from 'lucide-react';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import { EmptyState, KpiTile, PageHeader, PortalCard, StatusPill } from '@/components/portal/PortalPrimitives';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

export interface AdminDriverRecord {
  id: string;
  profile_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  city: string | null;
  rating: number;
  total_deliveries: number;
  last_active_at: string | null;
  is_online: boolean;
  is_available: boolean;
  is_on_delivery: boolean;
  required_documents: string[];
  approved_documents: number;
  documents: DriverDocumentRecord[];
}

export interface DriverDocumentRecord {
  id: string;
  driver_id: string;
  document_type: string;
  document_number: string | null;
  expires_at: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  rejection_reason: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
  submission_kind: 'file' | 'employer_lookup';
}

interface Stats { total: number; active: number; online: number; available: number; avgRating: number }

const COPY = {
  de: { overview: 'Übersicht', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Bestellungen', management: 'Management', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', zones: 'Lieferzonen', business: 'Business', finance: 'Finanzen', analytics: 'Analytics', system: 'System', notifications: 'Benachrichtigungen', configuration: 'Konfiguration', title: 'Fahrer', subtitle: 'Fahrerkonten, Live-Status und Verfügbarkeit verwalten.', total: 'Gesamt', active: 'Aktiv', online: 'Online', available: 'Verfügbar', averageRating: 'Ø Bewertung', all: 'Alle', offline: 'Offline', inactive: 'Inaktiv', onDelivery: 'Auf Lieferung', search: 'Nach Name, E-Mail oder Telefon suchen…', empty: 'Keine Fahrer gefunden', emptyBody: 'Passen Sie Suche oder Filter an.', deliveries: 'Lieferungen', rating: 'Bewertung', vehicle: 'Fahrzeug', status: 'Status', verified: 'Verifiziert', notVerified: 'Nicht verifiziert', activate: 'Aktivieren', suspend: 'Deaktivieren', confirmSuspend: 'Dieses Fahrerkonto wirklich deaktivieren? Der Fahrer kann sich danach nicht mehr anmelden.', confirmActivate: 'Dieses Fahrerkonto wieder aktivieren?', activated: 'Fahrerkonto wurde aktiviert.', suspended: 'Fahrerkonto wurde deaktiviert.', actionFailed: 'Aktion fehlgeschlagen. Bitte erneut versuchen.', processing: 'Wird gespeichert…', noVehicle: 'Nicht angegeben', bicycle: 'Fahrrad', ebike: 'E-Bike', scooter: 'Roller', motorcycle: 'Motorrad', car: 'Auto', walking: 'Zu Fuß', driver: 'Fahrer' },
  ar: { overview: 'نظرة عامة', dashboard: 'لوحة التحكم', controlCenter: 'مركز التحكم', orders: 'الطلبات', management: 'الإدارة', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', zones: 'مناطق التوصيل', business: 'الأعمال', finance: 'المالية', analytics: 'التحليلات', system: 'النظام', notifications: 'الإشعارات', configuration: 'الإعدادات', title: 'السائقون', subtitle: 'إدارة حسابات السائقين وحالتهم المباشرة وتوفرهم.', total: 'الإجمالي', active: 'نشط', online: 'متصل', available: 'متاح', averageRating: 'متوسط التقييم', all: 'الكل', offline: 'غير متصل', inactive: 'موقوف', onDelivery: 'في توصيل', search: 'ابحث بالاسم أو البريد أو الهاتف…', empty: 'لم يتم العثور على سائقين', emptyBody: 'غيّر عبارة البحث أو عامل التصفية.', deliveries: 'التوصيلات', rating: 'التقييم', vehicle: 'المركبة', status: 'الحالة', verified: 'موثّق', notVerified: 'غير موثّق', activate: 'إعادة التفعيل', suspend: 'إيقاف الحساب', confirmSuspend: 'هل تريد إيقاف حساب هذا السائق؟ لن يتمكن من تسجيل الدخول بعد ذلك.', confirmActivate: 'هل تريد إعادة تفعيل حساب هذا السائق؟', activated: 'تم تفعيل حساب السائق.', suspended: 'تم إيقاف حساب السائق.', actionFailed: 'تعذر تنفيذ العملية. حاول مجددًا.', processing: 'جارٍ الحفظ…', noVehicle: 'غير محددة', bicycle: 'دراجة هوائية', ebike: 'دراجة كهربائية', scooter: 'سكوتر', motorcycle: 'دراجة نارية', car: 'سيارة', walking: 'سيرًا', driver: 'سائق' },
  en: { overview: 'Overview', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Orders', management: 'Management', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', zones: 'Delivery zones', business: 'Business', finance: 'Finance', analytics: 'Analytics', system: 'System', notifications: 'Notifications', configuration: 'Configuration', title: 'Drivers', subtitle: 'Manage driver accounts, live status, and availability.', total: 'Total', active: 'Active', online: 'Online', available: 'Available', averageRating: 'Average rating', all: 'All', offline: 'Offline', inactive: 'Suspended', onDelivery: 'On delivery', search: 'Search by name, email, or phone…', empty: 'No drivers found', emptyBody: 'Adjust your search or filter.', deliveries: 'Deliveries', rating: 'Rating', vehicle: 'Vehicle', status: 'Status', verified: 'Verified', notVerified: 'Not verified', activate: 'Reactivate', suspend: 'Suspend account', confirmSuspend: 'Suspend this driver account? The driver will no longer be able to sign in.', confirmActivate: 'Reactivate this driver account?', activated: 'Driver account activated.', suspended: 'Driver account suspended.', actionFailed: 'The action failed. Please try again.', processing: 'Saving…', noVehicle: 'Not specified', bicycle: 'Bicycle', ebike: 'E-bike', scooter: 'Scooter', motorcycle: 'Motorcycle', car: 'Car', walking: 'Walking', driver: 'Driver' },
} satisfies Record<Locale, Record<string, string>>;

function vehicleLabel(value: string | null, copy: typeof COPY.de) {
  if (!value) return copy.noVehicle;
  return copy[value as keyof typeof copy] || value;
}

function driverDocumentLabel(type: string, locale: Locale, fallback: Record<string, string>) {
  const labels: Record<string, Record<Locale, string>> = {
    employment_contract: { de: 'Arbeitsvertrag', ar: 'عقد العمل', en: 'Employment contract' },
    health_insurance: { de: 'Krankenkasse / Versicherung', ar: 'التأمين الصحي', en: 'Health insurance' },
    tax_id_confirmation: { de: 'Steuer-ID (ELStAM)', ar: 'الرقم الضريبي', en: 'Tax ID (ELStAM)' },
    social_insurance_number_proof: { de: 'Renten-/Sozialversicherungsnummer', ar: 'الرقم التقاعدي (رقم التأمين الاجتماعي)', en: 'Pension / social insurance number' },
    payout_account_verification: { de: 'Auszahlungskonto (IBAN)', ar: 'حساب تحويل الراتب (IBAN)', en: 'Payout account (IBAN)' },
  };
  return labels[type]?.[locale] || fallback[type] || type;
}

export function AdminDriversClient({ initialDrivers, initialSearch = '', stats, userName }: { initialDrivers: AdminDriverRecord[]; initialSearch?: string; stats: Stats; userName: string }) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = COPY[locale];
  const editCopy = locale === 'ar'
    ? { edit: 'تعديل بيانات السائق', title: 'تعديل السائق', name: 'الاسم', phone: 'الهاتف', vehicle: 'المركبة', plate: 'رقم اللوحة', city: 'المدينة', cancel: 'إلغاء', save: 'حفظ التعديلات', saved: 'تم تحديث بيانات السائق.', invalid: 'الاسم ونوع المركبة مطلوبان.' }
    : locale === 'de'
      ? { edit: 'Fahrerdaten bearbeiten', title: 'Fahrer bearbeiten', name: 'Name', phone: 'Telefon', vehicle: 'Fahrzeug', plate: 'Kennzeichen', city: 'Stadt', cancel: 'Abbrechen', save: 'Änderungen speichern', saved: 'Fahrerdaten aktualisiert.', invalid: 'Name und Fahrzeugtyp sind erforderlich.' }
      : { edit: 'Edit driver details', title: 'Edit driver', name: 'Name', phone: 'Phone', vehicle: 'Vehicle', plate: 'Plate number', city: 'City', cancel: 'Cancel', save: 'Save changes', saved: 'Driver details updated.', invalid: 'Name and vehicle type are required.' };
  const reviewCopy = locale === 'ar'
    ? { review: 'مراجعة المستندات', title: 'توثيق السائق', policy: 'لا يمكن تفعيل السائق أو إرسال طلبات إليه قبل اعتماد جميع المستندات المطلوبة.', missing: 'غير مرفوع', pending: 'بانتظار المراجعة', approved: 'معتمد', rejected: 'مرفوض', expired: 'منتهي', approve: 'اعتماد', reject: 'رفض', reason: 'اكتب سبب الرفض الواضح للسائق', close: 'إغلاق', activationBlocked: 'التفعيل مقفل حتى اكتمال التوثيق.', saved: 'تم حفظ قرار مراجعة المستند.', id_proof: 'إثبات الهوية', license: 'رخصة القيادة', insurance: 'تأمين المركبة', vehicle_registration: 'تسجيل المركبة', background_check: 'فحص الأهلية/السجل' }
    : locale === 'de'
      ? { review: 'Dokumente prüfen', title: 'Fahrerverifizierung', policy: 'Aktivierung und Auftragszuweisung bleiben gesperrt, bis alle erforderlichen Dokumente genehmigt sind.', missing: 'Fehlt', pending: 'Prüfung ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt', expired: 'Abgelaufen', approve: 'Genehmigen', reject: 'Ablehnen', reason: 'Klaren Ablehnungsgrund für den Fahrer eingeben', close: 'Schließen', activationBlocked: 'Aktivierung bis zur vollständigen Prüfung gesperrt.', saved: 'Prüfentscheidung gespeichert.', id_proof: 'Identitätsnachweis', license: 'Führerschein', insurance: 'Fahrzeugversicherung', vehicle_registration: 'Fahrzeugschein', background_check: 'Eignungs-/Hintergrundprüfung' }
      : { review: 'Review documents', title: 'Driver verification', policy: 'Activation and order dispatch stay locked until every required document is approved.', missing: 'Missing', pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', expired: 'Expired', approve: 'Approve', reject: 'Reject', reason: 'Enter a clear rejection reason for the driver', close: 'Close', activationBlocked: 'Activation locked until verification is complete.', saved: 'Document review decision saved.', id_proof: 'Identity proof', license: 'Driving licence', insurance: 'Vehicle insurance', vehicle_registration: 'Vehicle registration', background_check: 'Eligibility/background check' };
  const [drivers, setDrivers] = useState(initialDrivers);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'inactive'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<AdminDriverRecord | null>(null);
  const [reviewing, setReviewing] = useState<AdminDriverRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', vehicle_type: 'bicycle', vehicle_plate: '', city: '' });

  const filtered = useMemo(() => drivers.filter((driver) => {
    if (statusFilter === 'online' && (!driver.is_online || !driver.is_active)) return false;
    if (statusFilter === 'offline' && (driver.is_online || !driver.is_active)) return false;
    if (statusFilter === 'inactive' && driver.is_active) return false;
    if (search) {
      const needle = search.toLowerCase();
      if (![driver.name, driver.email, driver.phone].some((value) => value && value.toLowerCase().includes(needle))) return false;
    }
    return true;
  }), [drivers, search, statusFilter]);

  const logout = useCallback(async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }, [router]);
  const navSections = useMemo<{ title: string; items: NavItem[] }[]>(() => [
    { title: copy.overview, items: [{ href: '/admin/dashboard', label: copy.dashboard, icon: Home, exact: true }, { href: '/admin/control-center', label: copy.controlCenter, icon: Activity }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }] },
    { title: copy.management, items: [{ href: '/admin/users', label: copy.customers, icon: Users }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }, { href: '/admin/zones', label: copy.zones, icon: Map }] },
    { title: copy.business, items: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }] },
    { title: copy.system, items: [{ href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ], [copy]);

  async function toggleActive(driver: AdminDriverRecord) {
    const activate = !driver.is_active;
    if (!window.confirm(activate ? copy.confirmActivate : copy.confirmSuspend)) return;
    setBusyId(driver.id); setFeedback(null);
    try {
      const response = await fetch(`/api/admin/users/${driver.id}/${activate ? 'unsuspend' : 'suspend'}`, { method: 'POST', headers: { 'Accept-Language': locale } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setDrivers((current) => current.map((entry) => entry.id === driver.id ? { ...entry, is_active: activate, is_online: activate ? entry.is_online : false, is_available: activate ? entry.is_available : false } : entry));
      setFeedback({ tone: 'success', text: activate ? copy.activated : copy.suspended });
      router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : copy.actionFailed }); }
    finally { setBusyId(null); }
  }

  function openEdit(driver: AdminDriverRecord) {
    setEditing(driver);
    setEditForm({ name: driver.name ?? '', phone: driver.phone ?? '', vehicle_type: driver.vehicle_type ?? 'bicycle', vehicle_plate: driver.vehicle_plate ?? '', city: driver.city ?? '' });
  }

  async function saveEdit() {
    if (!editing || editForm.name.trim().length < 2 || !editForm.vehicle_type) { setFeedback({ tone: 'error', text: editCopy.invalid }); return; }
    setBusyId(editing.id); setFeedback(null);
    try {
      const response = await fetch('/api/admin/drivers', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify({ id: editing.id, ...editForm }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setDrivers((current) => current.map((entry) => entry.id === editing.id ? { ...entry, ...editForm } : entry));
      setEditing(null); setFeedback({ tone: 'success', text: editCopy.saved }); router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : copy.actionFailed }); }
    finally { setBusyId(null); }
  }

  async function reviewDocument(document: DriverDocumentRecord, decision: 'approved' | 'rejected') {
    if (!reviewing) return;
    if (document.submission_kind === 'employer_lookup' && decision === 'approved') {
      const confirmed = window.confirm(locale === 'ar'
        ? 'هل استعلم قسم الرواتب فعليًا عن الرقم التأميني وتحقق منه؟'
        : locale === 'de'
          ? 'Hat die Lohnstelle die Versicherungsnummer tatsächlich abgefragt und geprüft?'
          : 'Has payroll actually retrieved and verified the insurance number?');
      if (!confirmed) return;
    }
    const reason = decision === 'rejected' ? window.prompt(reviewCopy.reason)?.trim() ?? '' : '';
    if (decision === 'rejected' && reason.length < 3) return;
    setBusyId(document.id); setFeedback(null);
    try {
      const response = await fetch(`/api/admin/drivers/${reviewing.id}/documents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': locale },
        body: JSON.stringify({
          document_id: document.id,
          decision,
          reason,
          lookup_confirmed: document.submission_kind === 'employer_lookup' && decision === 'approved',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      const nextDocuments = reviewing.documents.map((entry) => entry.id === document.id ? { ...entry, status: decision, rejection_reason: reason || null, reviewed_at: new Date().toISOString() } : entry);
      const approved = reviewing.required_documents.filter((type) => nextDocuments.find((entry) => entry.document_type === type)?.status === 'approved').length;
      const nextDriver = { ...reviewing, documents: nextDocuments, approved_documents: approved, is_verified: Boolean(payload.complete) };
      setReviewing(nextDriver);
      setDrivers((current) => current.map((entry) => entry.id === reviewing.id ? nextDriver : entry));
      setFeedback({ tone: 'success', text: reviewCopy.saved });
      router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : copy.actionFailed }); }
    finally { setBusyId(null); }
  }

  const currentStats = {
    total: drivers.length,
    active: drivers.filter((driver) => driver.is_active && driver.is_verified).length,
    online: drivers.filter((driver) => driver.is_active && driver.is_verified && driver.is_online).length,
    available: drivers.filter((driver) => driver.is_active && driver.is_verified && driver.is_available).length,
    avgRating: stats.avgRating,
  };

  return <PortalShell brand={{ name: 'BlinkGo Admin', tagline: copy.drivers, emoji: '👑' }} navSections={navSections} user={{ name: userName, email: userName, role: 'admin' }} locale={locale} onLocaleChange={setLocale} onLogout={logout}>
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader title={copy.title} description={`${copy.subtitle} · ${filtered.length}/${currentStats.total}`} actions={<Link href="/admin/onboarding?type=driver" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-red px-5 text-sm font-black text-white hover:bg-brand-red-dark"><Plus className="size-4" />{locale === 'ar' ? 'إضافة سائق' : locale === 'de' ? 'Fahrer hinzufügen' : 'Add driver'}</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={copy.total} value={currentStats.total} icon={<Truck className="size-5" />} />
        <KpiTile label={copy.active} value={currentStats.active} tone="success" icon={<CheckCircle2 className="size-5" />} />
        <KpiTile label={copy.online} value={currentStats.online} tone="info" icon={<Activity className="size-5" />} />
        <KpiTile label={copy.averageRating} value={currentStats.avgRating ? currentStats.avgRating.toFixed(1) : '—'} icon={<Star className="size-5" />} />
      </div>

      {feedback && <div role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>{feedback.text}</div>}

      <PortalCard className="mb-4">
        <div className="relative"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="min-h-11 w-full rounded-xl border border-border bg-bg ps-10 pe-4 text-sm focus:border-brand-red focus:outline-none" /></div>
        <div className="mt-3 flex flex-wrap gap-2">{(['all', 'online', 'offline', 'inactive'] as const).map((filter) => <button key={filter} type="button" onClick={() => setStatusFilter(filter)} className={`min-h-9 rounded-full px-4 text-xs font-bold transition ${statusFilter === filter ? 'bg-brand-red text-white' : 'bg-bg text-text-secondary hover:text-text-primary'}`}>{filter === 'all' ? copy.all : filter === 'online' ? copy.online : filter === 'offline' ? copy.offline : copy.inactive}</button>)}</div>
      </PortalCard>

      {filtered.length === 0 ? <PortalCard><EmptyState icon={<Truck className="size-8" />} title={copy.empty} description={copy.emptyBody} /></PortalCard> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((driver) => <PortalCard key={driver.id} className={!driver.is_active ? 'opacity-75' : ''}>
        <div className="flex items-start gap-3"><div className="relative shrink-0"><div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-red to-brand-yellow font-black text-white">{(driver.name || driver.email || '?').charAt(0).toUpperCase()}</div><span className={`absolute -bottom-0.5 -end-0.5 size-4 rounded-full border-2 border-surface ${!driver.is_active ? 'bg-status-error' : driver.is_online ? 'bg-status-success' : 'bg-text-muted'}`} /></div><div className="min-w-0 flex-1"><p className="truncate font-black">{driver.name || copy.driver}</p><p className="truncate text-xs text-text-muted">{driver.email || '—'}</p><div className="mt-2 flex flex-wrap gap-1.5"><StatusPill status={!driver.is_active ? 'inactive' : driver.is_online ? 'online' : 'offline'} label={!driver.is_active ? copy.inactive : driver.is_online ? copy.online : copy.offline} />{driver.is_on_delivery && <StatusPill status="busy" label={copy.onDelivery} />}{driver.is_available && <StatusPill status="active" label={copy.available} />}</div></div></div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3 text-center"><div><p className="text-[10px] text-text-muted">{copy.deliveries}</p><p className="font-black tabular-nums">{driver.total_deliveries}</p></div><div><p className="text-[10px] text-text-muted">{copy.rating}</p><p className="flex items-center justify-center gap-1 font-black"><Star className="size-3 fill-status-warning text-status-warning" />{driver.rating ? driver.rating.toFixed(1) : '—'}</p></div><div><p className="text-[10px] text-text-muted">{copy.vehicle}</p><p className="truncate text-xs font-black">{vehicleLabel(driver.vehicle_type, copy)}</p></div></div>
        <div className="mt-3 flex flex-wrap items-center gap-2">{driver.email && <a href={`mailto:${driver.email}`} aria-label={`${copy.driver}: ${driver.email}`} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-bold hover:bg-bg"><Mail className="size-4" />Email</a>}{driver.phone && <a href={`tel:${driver.phone}`} aria-label={`${copy.driver}: ${driver.phone}`} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-bold hover:bg-bg"><Phone className="size-4" />{driver.phone}</a>}</div>
        <button type="button" onClick={() => setReviewing(driver)} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-border bg-bg px-3 text-xs font-black hover:border-brand-red/60"><span className="inline-flex items-center gap-2"><FileCheck2 className="size-4 text-brand-red" />{reviewCopy.review}</span><span className={driver.is_verified ? 'text-status-success' : 'text-status-warning'}>{driver.approved_documents}/{driver.required_documents.length}</span></button>
        <div className="mt-3 flex items-center justify-between gap-3"><span className={`inline-flex items-center gap-1 text-xs font-bold ${driver.is_verified ? 'text-status-success' : 'text-status-warning'}`}>{driver.is_verified ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}{driver.is_verified ? copy.verified : copy.notVerified}</span><div className="flex gap-2"><button type="button" onClick={() => openEdit(driver)} disabled={busyId !== null} aria-label={`${editCopy.edit}: ${driver.name ?? copy.driver}`} className="grid size-10 place-items-center rounded-xl border border-border text-brand-red hover:bg-bg disabled:opacity-50"><Pencil className="size-4" /></button><button type="button" onClick={() => toggleActive(driver)} disabled={busyId !== null || (!driver.is_active && !driver.is_verified)} title={!driver.is_active && !driver.is_verified ? reviewCopy.activationBlocked : undefined} className={`min-h-10 rounded-xl px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${driver.is_active ? 'border border-status-error/30 text-status-error hover:bg-status-error/10' : 'bg-status-success px-5 text-white hover:bg-status-success/90'}`}>{busyId === driver.id ? copy.processing : driver.is_active ? copy.suspend : copy.activate}</button></div></div>
      </PortalCard>)}</div>}
      {reviewing && <DriverReviewDialog driver={reviewing} copy={copy} reviewCopy={reviewCopy} locale={locale} busyId={busyId} onClose={() => setReviewing(null)} onReview={reviewDocument} />}
      {editing && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section role="dialog" aria-modal="true" aria-labelledby="edit-driver-title" className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><h2 id="edit-driver-title" className="text-xl font-black">{editCopy.title}</h2><button type="button" onClick={() => setEditing(null)} className="grid size-11 place-items-center rounded-xl hover:bg-bg" aria-label={editCopy.cancel}><X className="size-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><DriverEditField label={editCopy.name} value={editForm.name} onChange={(value) => setEditForm((form) => ({ ...form, name: value }))} required /><DriverEditField label={editCopy.phone} type="tel" value={editForm.phone} onChange={(value) => setEditForm((form) => ({ ...form, phone: value }))} /><label><span className="mb-1.5 block text-xs font-bold text-text-muted">{editCopy.vehicle} *</span><select value={editForm.vehicle_type} onChange={(event) => setEditForm((form) => ({ ...form, vehicle_type: event.target.value }))} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red">{(['bicycle','ebike','scooter','motorcycle','car','walking'] as const).map((vehicle) => <option key={vehicle} value={vehicle}>{copy[vehicle]}</option>)}</select></label><DriverEditField label={editCopy.plate} value={editForm.vehicle_plate} onChange={(value) => setEditForm((form) => ({ ...form, vehicle_plate: value }))} /><DriverEditField label={editCopy.city} value={editForm.city} onChange={(value) => setEditForm((form) => ({ ...form, city: value }))} /></div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-xl border border-border px-5 text-sm font-bold">{editCopy.cancel}</button><button type="button" onClick={saveEdit} disabled={busyId === editing.id} className="min-h-11 rounded-xl bg-brand-red px-6 text-sm font-black text-white disabled:opacity-50">{busyId === editing.id ? copy.processing : editCopy.save}</button></div></section></div>}
    </div>
  </PortalShell>;
}

function DriverEditField({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{label}{required ? ' *' : ''}</span><input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red" /></label>;
}

function DriverReviewDialog({ driver, copy, reviewCopy, locale, busyId, onClose, onReview }: { driver: AdminDriverRecord; copy: typeof COPY.de; reviewCopy: Record<string, string>; locale: Locale; busyId: string | null; onClose: () => void; onReview: (document: DriverDocumentRecord, decision: 'approved' | 'rejected') => Promise<void> }) {
  const viewLabel = locale === 'ar' ? 'عرض الملف' : locale === 'de' ? 'Datei ansehen' : 'View file';
  const lookupLabel = locale === 'ar' ? 'مطلوب استعلام من قسم الرواتب' : locale === 'de' ? 'Abfrage durch Lohnstelle erforderlich' : 'Payroll lookup required';
  const lookupVerifiedLabel = locale === 'ar' ? 'تم الاستعلام والتحقق بواسطة قسم الرواتب' : locale === 'de' ? 'Von der Lohnstelle abgefragt und geprüft' : 'Retrieved and verified by payroll';
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="driver-review-title" className="my-auto w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h2 id="driver-review-title" className="text-xl font-black">{reviewCopy.title}: {driver.name || copy.driver}</h2><p className="mt-1 text-sm text-text-muted">{reviewCopy.policy}</p></div><button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-bg" aria-label={reviewCopy.close}><X className="size-5" /></button></div>
      <div className="mt-5 space-y-3">{driver.required_documents.map((type) => {
        const document = driver.documents.find((entry) => entry.document_type === type);
        const status = document?.status || 'missing';
        return <article key={type} className="rounded-xl border border-border bg-bg p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{driverDocumentLabel(type, locale, reviewCopy)}</p><p className={`mt-1 text-xs font-bold ${status === 'approved' ? 'text-status-success' : status === 'rejected' || status === 'expired' ? 'text-status-error' : 'text-status-warning'}`}>{reviewCopy[status]}{document?.document_number ? ` · ${document.document_number}` : ''}</p>{document?.submission_kind === 'employer_lookup' && <p className="mt-1 text-xs font-bold text-info">{status === 'approved' ? lookupVerifiedLabel : lookupLabel}</p>}{document?.rejection_reason && <p className="mt-1 text-xs text-status-error">{document.rejection_reason}</p>}</div>{document && <div className="flex flex-wrap gap-2">{document.submission_kind !== 'employer_lookup' && <a href={`/api/admin/drivers/${driver.id}/documents/${document.id}/view`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-xs font-black hover:border-brand-red"><Eye className="size-4" />{viewLabel}</a>}{document.status === 'pending' && <><button type="button" disabled={busyId !== null} onClick={() => void onReview(document, 'rejected')} className="min-h-10 rounded-xl border border-status-error/40 px-4 text-xs font-black text-status-error disabled:opacity-50">{reviewCopy.reject}</button><button type="button" disabled={busyId !== null} onClick={() => void onReview(document, 'approved')} className="min-h-10 rounded-xl bg-status-success px-4 text-xs font-black text-white disabled:opacity-50">{reviewCopy.approve}</button></>}</div>}</div></article>;
      })}</div>
      <div className="mt-5 flex items-center justify-between rounded-xl bg-brand-yellow/10 px-4 py-3 text-xs font-bold text-brand-yellow"><span>{driver.approved_documents}/{driver.required_documents.length}</span><span>{driver.is_verified ? copy.verified : reviewCopy.activationBlocked}</span></div>
    </section>
  </div>;
}
