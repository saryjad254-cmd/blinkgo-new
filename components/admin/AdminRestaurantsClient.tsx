'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, BarChart3, Bell, CheckCircle2, CreditCard, ExternalLink, Home, Mail,
  Map, MapPin, Pause, Pencil, Phone, Play, Plus, Search, Settings, ShoppingBag, Star, Store,
  Truck, Users, X, XCircle, Upload, Trash2, EyeOff,
} from 'lucide-react';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import { EmptyState, KpiTile, PageHeader, PortalCard, StatusPill } from '@/components/portal/PortalPrimitives';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

export interface RestaurantRecord {
  id: string;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
  type?: 'restaurant' | 'market' | 'pharmacy' | 'shop' | null;
  cuisine_type?: string | null;
  is_active?: boolean;
  is_paused?: boolean;
  busy_mode?: boolean;
  rating?: number | null;
  review_count?: number | null;
  delivery_fee?: number | null;
  minimum_order?: number | null;
  delivery_radius_km?: number | null;
  commission_pct?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  logo_url?: string | null;
  cover_url?: string | null;
  opening_hours?: Record<string, unknown> | null;
  is_hidden?: boolean;
  owner?: { id?: string; name?: string | null; email?: string | null } | null;
  verification?: { status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended'; legal_name?: string | null; representative_name?: string | null; trade_register_name?: string | null; trade_register_number?: string | null; submitted_at?: string | null; reviewed_at?: string | null; rejection_reason?: string | null } | null;
}

const COPY = {
  de: { overview: 'Übersicht', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Bestellungen', management: 'Management', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', zones: 'Lieferzonen', business: 'Business', finance: 'Finanzen', analytics: 'Analytics', system: 'System', notifications: 'Benachrichtigungen', configuration: 'Konfiguration', title: 'Restaurants', subtitle: 'Partnerstatus, Erreichbarkeit und Bestellannahme verwalten.', total: 'Gesamt', active: 'Offen', paused: 'Pausiert', inactive: 'Deaktiviert', busy: 'Hohe Auslastung', all: 'Alle', search: 'Nach Name, Adresse, Küche oder Betreiber suchen…', empty: 'Keine Restaurants gefunden', emptyBody: 'Passen Sie Suche oder Filter an.', rating: 'Bewertung', deliveryFee: 'Liefergebühr', minimumOrder: 'Mindestbestellwert', owner: 'Betreiber', openCustomerPage: 'Kundenseite öffnen', pauseOrders: 'Bestellannahme pausieren', resumeOrders: 'Bestellannahme fortsetzen', deactivate: 'Deaktivieren', activate: 'Aktivieren', confirmPause: 'Die Annahme neuer Bestellungen für dieses Restaurant pausieren?', confirmResume: 'Die Annahme neuer Bestellungen fortsetzen?', confirmDeactivate: 'Dieses Restaurant deaktivieren? Es verschwindet aus der Kundensuche.', confirmActivate: 'Dieses Restaurant wieder aktivieren?', pausedSuccess: 'Bestellannahme wurde pausiert.', resumedSuccess: 'Bestellannahme wurde fortgesetzt.', deactivatedSuccess: 'Restaurant wurde deaktiviert.', activatedSuccess: 'Restaurant wurde aktiviert.', actionFailed: 'Aktion fehlgeschlagen. Bitte erneut versuchen.', processing: 'Wird gespeichert…', restaurant: 'Restaurant', noCuisine: 'Keine Küche angegeben', noAddress: 'Keine Adresse angegeben' },
  ar: { overview: 'نظرة عامة', dashboard: 'لوحة التحكم', controlCenter: 'مركز التحكم', orders: 'الطلبات', management: 'الإدارة', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', zones: 'مناطق التوصيل', business: 'الأعمال', finance: 'المالية', analytics: 'التحليلات', system: 'النظام', notifications: 'الإشعارات', configuration: 'الإعدادات', title: 'المطاعم', subtitle: 'إدارة حالة الشركاء والتواصل واستقبال الطلبات.', total: 'الإجمالي', active: 'مفتوح', paused: 'متوقف مؤقتًا', inactive: 'غير نشط', busy: 'ضغط مرتفع', all: 'الكل', search: 'ابحث بالاسم أو العنوان أو المطبخ أو المالك…', empty: 'لم يتم العثور على مطاعم', emptyBody: 'غيّر عبارة البحث أو عامل التصفية.', rating: 'التقييم', deliveryFee: 'رسوم التوصيل', minimumOrder: 'الحد الأدنى', owner: 'المالك', openCustomerPage: 'فتح صفحة الزبون', pauseOrders: 'إيقاف استقبال الطلبات', resumeOrders: 'استئناف استقبال الطلبات', deactivate: 'تعطيل المطعم', activate: 'إعادة التفعيل', confirmPause: 'هل تريد إيقاف استقبال الطلبات الجديدة لهذا المطعم؟', confirmResume: 'هل تريد استئناف استقبال الطلبات؟', confirmDeactivate: 'هل تريد تعطيل هذا المطعم؟ سيختفي من بحث الزبائن.', confirmActivate: 'هل تريد إعادة تفعيل هذا المطعم؟', pausedSuccess: 'تم إيقاف استقبال الطلبات.', resumedSuccess: 'تم استئناف استقبال الطلبات.', deactivatedSuccess: 'تم تعطيل المطعم.', activatedSuccess: 'تم تفعيل المطعم.', actionFailed: 'تعذر تنفيذ العملية. حاول مجددًا.', processing: 'جارٍ الحفظ…', restaurant: 'مطعم', noCuisine: 'نوع المطبخ غير محدد', noAddress: 'العنوان غير متوفر' },
  en: { overview: 'Overview', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Orders', management: 'Management', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', zones: 'Delivery zones', business: 'Business', finance: 'Finance', analytics: 'Analytics', system: 'System', notifications: 'Notifications', configuration: 'Configuration', title: 'Restaurants', subtitle: 'Manage partner status, contactability, and order intake.', total: 'Total', active: 'Open', paused: 'Paused', inactive: 'Inactive', busy: 'High demand', all: 'All', search: 'Search by name, address, cuisine, or owner…', empty: 'No restaurants found', emptyBody: 'Adjust your search or filter.', rating: 'Rating', deliveryFee: 'Delivery fee', minimumOrder: 'Minimum order', owner: 'Owner', openCustomerPage: 'Open customer page', pauseOrders: 'Pause order intake', resumeOrders: 'Resume order intake', deactivate: 'Deactivate', activate: 'Reactivate', confirmPause: 'Pause new order intake for this restaurant?', confirmResume: 'Resume new order intake?', confirmDeactivate: 'Deactivate this restaurant? It will disappear from customer search.', confirmActivate: 'Reactivate this restaurant?', pausedSuccess: 'Order intake paused.', resumedSuccess: 'Order intake resumed.', deactivatedSuccess: 'Restaurant deactivated.', activatedSuccess: 'Restaurant activated.', actionFailed: 'The action failed. Please try again.', processing: 'Saving…', restaurant: 'Restaurant', noCuisine: 'Cuisine not specified', noAddress: 'Address unavailable' },
} satisfies Record<Locale, Record<string, string>>;

const VERIFICATION_COPY = {
  de: { missing: 'Prüfung fehlt', draft: 'Entwurf', pending: 'Prüfung ausstehend', approved: 'Händler geprüft', rejected: 'Abgelehnt', suspended: 'Prüfung gesperrt', approve: 'Prüfen & veröffentlichen', reject: 'Ablehnen', rejectPrompt: 'Begründung der Ablehnung (mindestens 5 Zeichen)', approveConfirm: 'Händlerangaben geprüft und Restaurant veröffentlichen?', approvedSuccess: 'Händler geprüft und Restaurant veröffentlicht.', rejectedSuccess: 'Prüfung abgelehnt und Restaurant deaktiviert.', verifyFailed: 'Prüfstatus konnte nicht aktualisiert werden.', noActivation: 'Aktivierung erst nach Händlerprüfung möglich.' },
  en: { missing: 'Verification missing', draft: 'Draft', pending: 'Review pending', approved: 'Trader verified', rejected: 'Rejected', suspended: 'Verification suspended', approve: 'Verify & publish', reject: 'Reject', rejectPrompt: 'Rejection reason (at least 5 characters)', approveConfirm: 'Confirm the trader evidence and publish this restaurant?', approvedSuccess: 'Trader verified and restaurant published.', rejectedSuccess: 'Verification rejected and restaurant disabled.', verifyFailed: 'Verification status could not be updated.', noActivation: 'Trader verification is required before activation.' },
  ar: { missing: 'التوثيق مفقود', draft: 'مسودة', pending: 'بانتظار المراجعة', approved: 'تاجر موثّق', rejected: 'مرفوض', suspended: 'التوثيق موقوف', approve: 'توثيق ونشر', reject: 'رفض', rejectPrompt: 'سبب الرفض (5 أحرف على الأقل)', approveConfirm: 'هل راجعت أدلة التاجر وتريد نشر المطعم؟', approvedSuccess: 'تم توثيق التاجر ونشر المطعم.', rejectedSuccess: 'تم رفض التوثيق وتعطيل المطعم.', verifyFailed: 'تعذر تحديث حالة التوثيق.', noActivation: 'يجب توثيق التاجر قبل تفعيل المطعم.' },
} as const;

function formatEUR(value: unknown, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

export function AdminRestaurantsClient({ initialRestaurants, initialSearch = '', userName }: { initialRestaurants: RestaurantRecord[]; initialSearch?: string; userName: string }) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = COPY[locale];
  const verificationCopy = VERIFICATION_COPY[locale];
  const editCopy = locale === 'ar'
    ? { edit: 'تعديل بيانات المطعم', title: 'تعديل المطعم', name: 'الاسم', cuisine: 'نوع المطبخ', description: 'الوصف', address: 'العنوان', phone: 'الهاتف', fee: 'رسوم التوصيل (€)', minimum: 'الحد الأدنى (€)', radius: 'نطاق التوصيل (كم)', commission: 'العمولة (%)', cancel: 'إلغاء', save: 'حفظ التعديلات', saved: 'تم تحديث بيانات المطعم.', invalid: 'تحقق من الاسم والأسعار ونطاق التوصيل.' }
    : locale === 'de'
      ? { edit: 'Restaurantdaten bearbeiten', title: 'Restaurant bearbeiten', name: 'Name', cuisine: 'Küche', description: 'Beschreibung', address: 'Adresse', phone: 'Telefon', fee: 'Liefergebühr (€)', minimum: 'Mindestbestellwert (€)', radius: 'Lieferradius (km)', commission: 'Provision (%)', cancel: 'Abbrechen', save: 'Änderungen speichern', saved: 'Restaurantdaten aktualisiert.', invalid: 'Bitte Name, Preise und Lieferradius prüfen.' }
      : { edit: 'Edit restaurant details', title: 'Edit restaurant', name: 'Name', cuisine: 'Cuisine', description: 'Description', address: 'Address', phone: 'Phone', fee: 'Delivery fee (€)', minimum: 'Minimum order (€)', radius: 'Delivery radius (km)', commission: 'Commission (%)', cancel: 'Cancel', save: 'Save changes', saved: 'Restaurant details updated.', invalid: 'Check the name, pricing, and delivery radius.' };
  const controlCopy = {
    de: { type: 'Geschäftstyp', ownerEmail: 'Betreiber-E-Mail', latitude: 'Breitengrad', longitude: 'Längengrad', hours: 'Öffnungszeiten (JSON)', logo: 'Logo hochladen', cover: 'Titelbild hochladen', hide: 'Ausblenden', show: 'Einblenden', archive: 'Geschäft löschen', archiveConfirm: 'Geschäft archivieren? Es wird sofort ausgeblendet; bestehende Bestellungen bleiben erhalten.', archived: 'Geschäft archiviert.', removeLogo: 'Logo entfernen', removeCover: 'Titelbild entfernen', mediaError: 'Bild konnte nicht gespeichert werden.', invalidHours: 'Öffnungszeiten müssen gültiges JSON sein.', imageRule: 'JPG, PNG oder WebP bis 5 MB' },
    en: { type: 'Store type', ownerEmail: 'Owner email', latitude: 'Latitude', longitude: 'Longitude', hours: 'Opening hours (JSON)', logo: 'Upload logo', cover: 'Upload cover', hide: 'Hide', show: 'Show', archive: 'Delete store', archiveConfirm: 'Archive this store? It is hidden immediately; existing orders remain.', archived: 'Store archived.', removeLogo: 'Remove logo', removeCover: 'Remove cover', mediaError: 'Image could not be saved.', invalidHours: 'Opening hours must be valid JSON.', imageRule: 'JPG, PNG, or WebP up to 5 MB' },
    ar: { type: 'نوع المتجر', ownerEmail: 'بريد المالك', latitude: 'خط العرض', longitude: 'خط الطول', hours: 'ساعات العمل (JSON)', logo: 'رفع الشعار', cover: 'رفع صورة الغلاف', hide: 'إخفاء', show: 'إظهار', archive: 'حذف المتجر', archiveConfirm: 'أرشفة المتجر؟ سيختفي فورًا وتبقى الطلبات السابقة محفوظة.', archived: 'تمت أرشفة المتجر.', removeLogo: 'حذف الشعار', removeCover: 'حذف الغلاف', mediaError: 'تعذّر حفظ الصورة.', invalidHours: 'يجب أن تكون ساعات العمل بصيغة JSON صحيحة.', imageRule: 'JPG أو PNG أو WebP حتى 5 ميغابايت' },
  }[locale];
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'inactive'>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<RestaurantRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: '', type: 'restaurant', cuisine_type: '', description: '', address: '', phone: '', owner_email: '', latitude: '', longitude: '', opening_hours: '{}', delivery_fee: '', minimum_order: '', delivery_radius_km: '', commission_pct: '' });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const filtered = useMemo(() => restaurants.filter((restaurant) => {
    if (statusFilter === 'active' && (!restaurant.is_active || restaurant.is_paused)) return false;
    if (statusFilter === 'paused' && (!restaurant.is_active || !restaurant.is_paused)) return false;
    if (statusFilter === 'inactive' && restaurant.is_active !== false) return false;
    if (search) {
      const needle = search.toLowerCase();
      if (![restaurant.name, restaurant.address, restaurant.cuisine_type, restaurant.owner?.name, restaurant.owner?.email].some((value) => value && value.toLowerCase().includes(needle))) return false;
    }
    return true;
  }), [restaurants, search, statusFilter]);

  const logout = useCallback(async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }, [router]);
  const navSections = useMemo<{ title: string; items: NavItem[] }[]>(() => [
    { title: copy.overview, items: [{ href: '/admin/dashboard', label: copy.dashboard, icon: Home, exact: true }, { href: '/admin/control-center', label: copy.controlCenter, icon: Activity }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }] },
    { title: copy.management, items: [{ href: '/admin/users', label: copy.customers, icon: Users }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }, { href: '/admin/zones', label: copy.zones, icon: Map }] },
    { title: copy.business, items: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }] },
    { title: copy.system, items: [{ href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ], [copy]);

  async function patchRestaurant(restaurant: RestaurantRecord, updates: Record<string, boolean>, successText: string, confirmation: string, action: string) {
    if (updates.is_active === true && restaurant.verification?.status !== 'approved') {
      setFeedback({ tone: 'error', text: verificationCopy.noActivation });
      return;
    }
    if (!window.confirm(confirmation)) return;
    const key = `${restaurant.id}:${action}`;
    setBusyKey(key); setFeedback(null);
    try {
      const response = await fetch(`/api/admin/restaurants/${restaurant.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify(updates) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setRestaurants((current) => current.map((entry) => entry.id === restaurant.id ? { ...entry, ...updates } : entry));
      setFeedback({ tone: 'success', text: successText }); router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : copy.actionFailed }); }
    finally { setBusyKey(null); }
  }

  async function reviewVerification(restaurant: RestaurantRecord, action: 'approve' | 'reject') {
    if (!restaurant.verification) return;
    let reason = '';
    if (action === 'approve' && !window.confirm(verificationCopy.approveConfirm)) return;
    if (action === 'reject') {
      reason = window.prompt(verificationCopy.rejectPrompt) || '';
      if (reason.trim().length < 5) return;
    }
    setBusyKey(`${restaurant.id}:verification`); setFeedback(null);
    try {
      const response = await fetch(`/api/admin/restaurants/${restaurant.id}/verification`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify({ action, reason }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, verificationCopy.verifyFailed));
      setRestaurants((current) => current.map((entry) => entry.id === restaurant.id ? { ...entry, is_active: action === 'approve', is_paused: false, verification: { ...entry.verification!, status: action === 'approve' ? 'approved' : 'rejected', rejection_reason: action === 'reject' ? reason : null, reviewed_at: new Date().toISOString() } } : entry));
      setFeedback({ tone: 'success', text: action === 'approve' ? verificationCopy.approvedSuccess : verificationCopy.rejectedSuccess });
      router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : verificationCopy.verifyFailed }); }
    finally { setBusyKey(null); }
  }

  function openEdit(restaurant: RestaurantRecord) {
    setEditing(restaurant);
    setLogoFile(null); setCoverFile(null);
    setEditForm({ name: restaurant.name ?? '', type: restaurant.type ?? 'restaurant', cuisine_type: restaurant.cuisine_type ?? '', description: restaurant.description ?? '', address: restaurant.address ?? '', phone: restaurant.phone ?? '', owner_email: restaurant.owner?.email ?? '', latitude: restaurant.latitude == null ? '' : String(restaurant.latitude), longitude: restaurant.longitude == null ? '' : String(restaurant.longitude), opening_hours: JSON.stringify(restaurant.opening_hours ?? {}, null, 2), delivery_fee: String(restaurant.delivery_fee ?? 0), minimum_order: String(restaurant.minimum_order ?? 0), delivery_radius_km: String(restaurant.delivery_radius_km ?? 5), commission_pct: String(restaurant.commission_pct ?? 15) });
  }

  async function saveEdit() {
    if (!editing || editForm.name.trim().length < 2 || [editForm.delivery_fee, editForm.minimum_order, editForm.delivery_radius_km, editForm.commission_pct].some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      setFeedback({ tone: 'error', text: editCopy.invalid }); return;
    }
    let openingHours: Record<string, unknown>;
    try { const parsed = JSON.parse(editForm.opening_hours); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); openingHours = parsed; }
    catch { setFeedback({ tone: 'error', text: controlCopy.invalidHours }); return; }
    const updates = { ...editForm, latitude: editForm.latitude === '' ? null : Number(editForm.latitude), longitude: editForm.longitude === '' ? null : Number(editForm.longitude), opening_hours: openingHours, delivery_fee: Number(editForm.delivery_fee), minimum_order: Number(editForm.minimum_order), delivery_radius_km: Number(editForm.delivery_radius_km), commission_pct: Number(editForm.commission_pct) };
    setBusyKey(`${editing.id}:edit`); setFeedback(null);
    try {
      const response = await fetch(`/api/admin/restaurants/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify(updates) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      const mediaUpdates: Partial<RestaurantRecord> = {};
      for (const [file, kind, key] of [[logoFile, 'restaurant_logo', 'logo_url'], [coverFile, 'restaurant_cover', 'cover_url']] as const) {
        if (!file) continue;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error(controlCopy.imageRule);
        const form = new FormData(); form.set('id', editing.id); form.set('kind', kind); form.set('file', file);
        const mediaResponse = await fetch('/api/admin/catalog-media', { method: 'POST', body: form });
        const mediaPayload = await mediaResponse.json().catch(() => ({}));
        if (!mediaResponse.ok) throw new Error(extractErrorMessage(mediaPayload, controlCopy.mediaError));
        mediaUpdates[key] = mediaPayload.url;
      }
      setRestaurants((current) => current.map((entry) => entry.id === editing.id ? { ...entry, ...(payload.restaurant ?? updates), ...mediaUpdates } : entry));
      setEditing(null); setFeedback({ tone: 'success', text: editCopy.saved }); router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : copy.actionFailed }); }
    finally { setBusyKey(null); }
  }

  async function removeMedia(kind: 'restaurant_logo' | 'restaurant_cover') {
    if (!editing) return;
    setBusyKey(`${editing.id}:${kind}`);
    const response = await fetch('/api/admin/catalog-media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, kind }) });
    const payload = await response.json().catch(() => ({})); setBusyKey(null);
    if (!response.ok) return setFeedback({ tone: 'error', text: extractErrorMessage(payload, controlCopy.mediaError) });
    const key = kind === 'restaurant_logo' ? 'logo_url' : 'cover_url';
    setRestaurants((all) => all.map((item) => item.id === editing.id ? { ...item, [key]: null } : item));
    setEditing({ ...editing, [key]: null });
  }

  async function archiveStore(restaurant: RestaurantRecord) {
    if (!window.confirm(controlCopy.archiveConfirm)) return;
    setBusyKey(`${restaurant.id}:archive`); setFeedback(null);
    const response = await fetch(`/api/admin/restaurants/${restaurant.id}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({})); setBusyKey(null);
    if (!response.ok) return setFeedback({ tone: 'error', text: extractErrorMessage(payload, copy.actionFailed) });
    setRestaurants((all) => all.filter((item) => item.id !== restaurant.id)); setFeedback({ tone: 'success', text: controlCopy.archived });
  }

  const counts = {
    total: restaurants.length,
    active: restaurants.filter((restaurant) => restaurant.is_active && !restaurant.is_paused).length,
    paused: restaurants.filter((restaurant) => restaurant.is_active && restaurant.is_paused).length,
    inactive: restaurants.filter((restaurant) => restaurant.is_active === false).length,
  };

  return <PortalShell brand={{ name: 'BlinkGo Admin', tagline: copy.restaurants, emoji: '👑' }} navSections={navSections} user={{ name: userName, email: userName, role: 'admin' }} locale={locale} onLocaleChange={setLocale} onLogout={logout}>
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader title={copy.title} description={`${copy.subtitle} · ${filtered.length}/${counts.total}`} actions={<Link href="/admin/onboarding?type=restaurant" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-red px-5 text-sm font-black text-white hover:bg-brand-red-dark"><Plus className="size-4" />{locale === 'ar' ? 'إضافة مطعم' : locale === 'de' ? 'Restaurant hinzufügen' : 'Add restaurant'}</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={copy.total} value={counts.total} icon={<Store className="size-5" />} />
        <KpiTile label={copy.active} value={counts.active} tone="success" icon={<CheckCircle2 className="size-5" />} />
        <KpiTile label={copy.paused} value={counts.paused} tone="warning" icon={<Pause className="size-5" />} />
        <KpiTile label={copy.inactive} value={counts.inactive} tone="danger" icon={<XCircle className="size-5" />} />
      </div>

      {feedback && <div role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>{feedback.text}</div>}

      <PortalCard className="mb-4">
        <div className="relative"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="min-h-11 w-full rounded-xl border border-border bg-bg ps-10 pe-4 text-sm focus:border-brand-red focus:outline-none" /></div>
        <div className="mt-3 flex flex-wrap gap-2">{(['all', 'active', 'paused', 'inactive'] as const).map((filter) => <button key={filter} type="button" onClick={() => setStatusFilter(filter)} className={`min-h-9 rounded-full px-4 text-xs font-bold transition ${statusFilter === filter ? 'bg-brand-red text-white' : 'bg-bg text-text-secondary hover:text-text-primary'}`}>{filter === 'all' ? copy.all : filter === 'active' ? copy.active : filter === 'paused' ? copy.paused : copy.inactive}</button>)}</div>
      </PortalCard>

      {filtered.length === 0 ? <PortalCard><EmptyState icon={<Store className="size-8" />} title={copy.empty} description={copy.emptyBody} /></PortalCard> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((restaurant) => {
        const active = restaurant.is_active !== false;
        const paused = active && Boolean(restaurant.is_paused);
        const status = !active ? 'inactive' : paused ? 'paused' : 'active';
        const statusText = !active ? copy.inactive : paused ? copy.paused : copy.active;
        return <PortalCard key={restaurant.id} className={!active ? 'opacity-75' : ''}>
          <div className="flex items-start gap-3"><div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-red to-brand-yellow bg-cover bg-center text-white" style={restaurant.logo_url ? { backgroundImage: `url(${JSON.stringify(restaurant.logo_url).slice(1, -1)})` } : undefined}>{!restaurant.logo_url && <Store className="size-6" />}</div><div className="min-w-0 flex-1"><p className="truncate font-black">{restaurant.name || copy.restaurant}</p><p className="truncate text-xs text-text-muted">{restaurant.type || 'restaurant'} · {restaurant.cuisine_type || copy.noCuisine}</p><div className="mt-2 flex flex-wrap gap-1.5"><StatusPill status={status} label={statusText} />{restaurant.is_hidden && <StatusPill status="paused" label={controlCopy.hide} />}{restaurant.busy_mode && <StatusPill status="busy" label={copy.busy} />}<span className={`rounded-full border px-2 py-1 text-[10px] font-black ${restaurant.verification?.status === 'approved' ? 'border-status-success/30 bg-status-success/10 text-status-success' : restaurant.verification?.status === 'rejected' ? 'border-status-error/30 bg-status-error/10 text-status-error' : 'border-brand-yellow/30 bg-brand-yellow/10 text-brand-yellow'}`}>{restaurant.verification ? verificationCopy[restaurant.verification.status] : verificationCopy.missing}</span></div></div></div>
          {restaurant.verification && <div className="mt-3 rounded-xl border border-border bg-bg/60 p-3 text-xs"><p className="font-bold text-text-primary">{restaurant.verification.legal_name}</p><p className="mt-1 text-text-muted">{restaurant.verification.trade_register_name} · {restaurant.verification.trade_register_number}</p>{restaurant.verification.rejection_reason && <p className="mt-2 text-status-error">{restaurant.verification.rejection_reason}</p>}</div>}
          <div className="mt-4 space-y-2 text-xs text-text-muted">{restaurant.address ? <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0" /><span className="line-clamp-2">{restaurant.address}</span></p> : <p>{copy.noAddress}</p>}{restaurant.owner?.name && <p className="flex items-center gap-2"><Users className="size-3.5" />{copy.owner}: <span className="text-text-primary">{restaurant.owner.name}</span></p>}</div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3 text-center"><div><p className="text-[10px] text-text-muted">{copy.rating}</p><p className="flex items-center justify-center gap-1 font-black"><Star className="size-3 fill-status-warning text-status-warning" />{restaurant.rating ? Number(restaurant.rating).toFixed(1) : '—'}</p></div><div><p className="text-[10px] text-text-muted">{copy.deliveryFee}</p><p className="text-xs font-black">{formatEUR(restaurant.delivery_fee, locale)}</p></div><div><p className="text-[10px] text-text-muted">{copy.minimumOrder}</p><p className="text-xs font-black">{formatEUR(restaurant.minimum_order, locale)}</p></div></div>
          <div className="mt-3 flex gap-2"><button type="button" onClick={() => openEdit(restaurant)} aria-label={`${editCopy.edit}: ${restaurant.name ?? copy.restaurant}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-brand-red hover:bg-bg"><Pencil className="size-4" /></button><Link href={`/restaurants/${restaurant.id}`} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-bold hover:bg-bg"><ExternalLink className="size-4" />{copy.openCustomerPage}</Link>{restaurant.phone && <a href={`tel:${restaurant.phone}`} aria-label={`${copy.restaurant}: ${restaurant.phone}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-bg"><Phone className="size-4" /></a>}{restaurant.owner?.email && <a href={`mailto:${restaurant.owner.email}`} aria-label={`${copy.owner}: ${restaurant.owner.email}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-bg"><Mail className="size-4" /></a>}</div>
          {restaurant.verification?.status === 'pending' && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => reviewVerification(restaurant, 'reject')} disabled={busyKey !== null} className="min-h-10 rounded-xl border border-status-error/30 px-3 text-xs font-black text-status-error hover:bg-status-error/10 disabled:opacity-40">{verificationCopy.reject}</button><button type="button" onClick={() => reviewVerification(restaurant, 'approve')} disabled={busyKey !== null} className="min-h-10 rounded-xl bg-status-success px-3 text-xs font-black text-white hover:bg-status-success/90 disabled:opacity-40">{busyKey === `${restaurant.id}:verification` ? copy.processing : verificationCopy.approve}</button></div>}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" onClick={() => patchRestaurant(restaurant, { is_paused: !paused }, paused ? copy.resumedSuccess : copy.pausedSuccess, paused ? copy.confirmResume : copy.confirmPause, 'pause')} disabled={!active || busyKey !== null} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-brand-yellow/30 px-3 text-xs font-black text-brand-yellow hover:bg-brand-yellow/10 disabled:cursor-not-allowed disabled:opacity-40">{busyKey === `${restaurant.id}:pause` ? copy.processing : <>{paused ? <Play className="size-4" /> : <Pause className="size-4" />}{paused ? copy.resumeOrders : copy.pauseOrders}</>}</button><button type="button" onClick={() => patchRestaurant(restaurant, { is_active: !active, ...(active ? {} : { is_paused: false }) }, active ? copy.deactivatedSuccess : copy.activatedSuccess, active ? copy.confirmDeactivate : copy.confirmActivate, 'active')} disabled={busyKey !== null || (!active && restaurant.verification?.status !== 'approved')} className={`min-h-10 rounded-xl px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border border-status-error/30 text-status-error hover:bg-status-error/10' : 'bg-status-success text-white hover:bg-status-success/90'}`}>{busyKey === `${restaurant.id}:active` ? copy.processing : active ? copy.deactivate : copy.activate}</button><button type="button" onClick={() => patchRestaurant(restaurant, { is_hidden: !restaurant.is_hidden }, copy.activatedSuccess, restaurant.is_hidden ? controlCopy.show : controlCopy.hide, 'hidden')} disabled={busyKey !== null} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-black text-text-secondary hover:bg-bg disabled:opacity-40"><EyeOff className="size-4" />{restaurant.is_hidden ? controlCopy.show : controlCopy.hide}</button><button type="button" onClick={() => void archiveStore(restaurant)} disabled={busyKey !== null} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-status-error/30 px-3 text-xs font-black text-status-error hover:bg-status-error/10 disabled:opacity-40"><Trash2 className="size-4" />{controlCopy.archive}</button></div>
        </PortalCard>;
      })}</div>}
      {editing && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="edit-restaurant-title" className="w-full max-w-3xl rounded-2xl border border-border bg-surface p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3"><h2 id="edit-restaurant-title" className="text-xl font-black">{editCopy.title}</h2><button type="button" onClick={() => setEditing(null)} className="grid size-11 place-items-center rounded-xl hover:bg-bg" aria-label={editCopy.cancel}><X className="size-5" /></button></div>
          <div className="mt-5 grid max-h-[65vh] gap-4 overflow-y-auto pe-1 sm:grid-cols-2">
            <RestaurantEditField label={editCopy.name} value={editForm.name} onChange={(value) => setEditForm((form) => ({ ...form, name: value }))} required />
            <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{controlCopy.type}</span><select className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red" value={editForm.type} onChange={(event) => setEditForm((form) => ({ ...form, type: event.target.value }))}><option value="restaurant">Restaurant</option><option value="market">Market</option><option value="pharmacy">Pharmacy</option><option value="shop">Shop</option></select></label>
            <RestaurantEditField label={editCopy.cuisine} value={editForm.cuisine_type} onChange={(value) => setEditForm((form) => ({ ...form, cuisine_type: value }))} />
            <RestaurantEditField label={controlCopy.ownerEmail} type="email" value={editForm.owner_email} onChange={(value) => setEditForm((form) => ({ ...form, owner_email: value }))} required />
            <RestaurantEditField label={editCopy.phone} type="tel" value={editForm.phone} onChange={(value) => setEditForm((form) => ({ ...form, phone: value }))} />
            <RestaurantEditField label={editCopy.address} value={editForm.address} onChange={(value) => setEditForm((form) => ({ ...form, address: value }))} />
            <RestaurantEditField label={controlCopy.latitude} type="number" min="-90" max="90" step="0.000001" value={editForm.latitude} onChange={(value) => setEditForm((form) => ({ ...form, latitude: value }))} />
            <RestaurantEditField label={controlCopy.longitude} type="number" min="-180" max="180" step="0.000001" value={editForm.longitude} onChange={(value) => setEditForm((form) => ({ ...form, longitude: value }))} />
            <RestaurantEditField label={editCopy.fee} type="number" value={editForm.delivery_fee} onChange={(value) => setEditForm((form) => ({ ...form, delivery_fee: value }))} />
            <RestaurantEditField label={editCopy.minimum} type="number" value={editForm.minimum_order} onChange={(value) => setEditForm((form) => ({ ...form, minimum_order: value }))} />
            <RestaurantEditField label={editCopy.radius} type="number" value={editForm.delivery_radius_km} onChange={(value) => setEditForm((form) => ({ ...form, delivery_radius_km: value }))} />
            <RestaurantEditField label={editCopy.commission} type="number" value={editForm.commission_pct} onChange={(value) => setEditForm((form) => ({ ...form, commission_pct: value }))} />
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-text-muted">{editCopy.description}</span><textarea rows={4} maxLength={2000} value={editForm.description} onChange={(event) => setEditForm((form) => ({ ...form, description: event.target.value }))} className="w-full rounded-xl border border-border bg-bg p-3 text-sm outline-none focus:border-brand-red" /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-text-muted">{controlCopy.hours}</span><textarea rows={6} value={editForm.opening_hours} onChange={(event) => setEditForm((form) => ({ ...form, opening_hours: event.target.value }))} className="w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs outline-none focus:border-brand-red" /></label>
            <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{controlCopy.logo}</span><span className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-3 text-sm text-text-secondary"><Upload className="size-4" />{logoFile?.name ?? controlCopy.imageRule}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} /></span>{editing.logo_url && <button type="button" onClick={() => void removeMedia('restaurant_logo')} className="mt-2 text-xs font-bold text-status-error">{controlCopy.removeLogo}</button>}</label>
            <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{controlCopy.cover}</span><span className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-3 text-sm text-text-secondary"><Upload className="size-4" />{coverFile?.name ?? controlCopy.imageRule}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /></span>{editing.cover_url && <button type="button" onClick={() => void removeMedia('restaurant_cover')} className="mt-2 text-xs font-bold text-status-error">{controlCopy.removeCover}</button>}</label>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-xl border border-border px-5 text-sm font-bold">{editCopy.cancel}</button><button type="button" onClick={saveEdit} disabled={busyKey === `${editing.id}:edit`} className="min-h-11 rounded-xl bg-brand-red px-6 text-sm font-black text-white disabled:opacity-50">{busyKey === `${editing.id}:edit` ? copy.processing : editCopy.save}</button></div>
        </section>
      </div>}
    </div>
  </PortalShell>;
}

function RestaurantEditField({ label, value, onChange, type = 'text', required = false, min, max, step }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: string; max?: string; step?: string }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{label}{required ? ' *' : ''}</span><input type={type} required={required} min={min ?? (type === 'number' ? '0' : undefined)} max={max} step={step ?? (type === 'number' ? '0.01' : undefined)} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red" /></label>;
}
