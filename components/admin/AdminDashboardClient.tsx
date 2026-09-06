'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowRight, Award, BarChart3, Bell, Box, CreditCard, Euro, Home, Map,
  Megaphone, Settings, ShoppingBag, Star, Store, Tag, Truck, UserPlus, Users,
} from 'lucide-react';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import { EmptyState, KpiTile, PageHeader, PortalCard, SectionTitle, StatusPill } from '@/components/portal/PortalPrimitives';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';

interface DashboardOrder {
  id: string;
  order_number?: string | null;
  status: string;
  total?: number | string | null;
  created_at?: string;
  customer?: { name?: string | null } | Array<{ name?: string | null }> | null;
  restaurants?: { name?: string | null } | Array<{ name?: string | null }> | null;
}

interface DashboardRestaurant {
  id: string;
  name?: string | null;
  rating?: number | string | null;
  review_count?: number | null;
}

function relationName(relation: { name?: string | null } | Array<{ name?: string | null }> | null | undefined): string {
  const record = Array.isArray(relation) ? relation[0] : relation;
  return record?.name || '—';
}

interface AdminData {
  today: { orders: number; revenue: number };
  week: { orders: number; revenue: number };
  month: { orders: number; revenue: number };
  activeOrders: DashboardOrder[];
  activeOrderCount: number;
  users: { total: number; breakdown: Record<string, { total: number; active: number }> };
  drivers: { total: number; online: number; available: number };
  restaurants: { total: number; active: number; top: DashboardRestaurant[] };
  recentOrders: DashboardOrder[];
  orderStatusBreakdown: Record<string, number>;
  dailyRevenue: { date: string; revenue: number; orders: number }[];
}

const COPY = {
  de: {
    dashboard: 'Dashboard', operations: 'Operations Center', overview: 'Übersicht', controlCenter: 'Control Center', orders: 'Bestellungen', management: 'Management', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', zones: 'Lieferzonen', business: 'Business', finance: 'Finanzen', analytics: 'Analytics', coupons: 'Gutscheine', loyalty: 'Treueprogramm', system: 'System', announcements: 'Ankündigungen', notifications: 'Benachrichtigungen', configuration: 'Konfiguration', title: 'Plattformübersicht', subtitle: 'Live-Einblick in Umsatz, Bestellungen und Lieferbetrieb.', todayRevenue: 'Umsatz heute', deliveredRevenue: 'Nur zugestellte Bestellungen', weekRevenue: 'Umsatz diese Woche', monthRevenue: 'Umsatz im Monat', todayOrders: 'Bestellungen heute', activeOrders: 'Aktive Bestellungen', onlineDrivers: 'Fahrer online', availableDrivers: 'verfügbar', activeRestaurants: 'aktive Restaurants', totalCustomers: 'Benutzer gesamt', weeklyTrend: '7-Tage-Verlauf', weeklyHint: 'Zugestellter Umsatz und alle eingegangenen Bestellungen', orderCount: 'Bestellungen', platform: 'Betriebsstatus', driversLive: 'Fahrerverfügbarkeit', online: 'Online', available: 'Verfügbar', total: 'Gesamt', manageDrivers: 'Fahrer verwalten', restaurantsLive: 'Restaurantstatus', active: 'Aktiv', topRestaurants: 'Top-Restaurants', byRating: 'Nach Bewertung', reviews: 'Bewertungen', noRatings: 'Noch keine Bewertungen vorhanden.', allRestaurants: 'Alle Restaurants', users: 'Benutzer', byRole: 'Verteilung nach Rolle', activeOfTotal: 'aktiv von', statusToday: 'Heutige Statusverteilung', noOrdersToday: 'Heute noch keine Bestellungen.', activeOrdersHint: 'Bestellungen, die gerade bearbeitet oder ausgeliefert werden', viewAll: 'Alle ansehen', noActive: 'Keine aktiven Bestellungen', noActiveBody: 'Neue Bestellungen erscheinen hier automatisch.', order: 'Bestellung', customer: 'Kunde', restaurant: 'Restaurant', status: 'Status', amount: 'Betrag', recent: 'Letzte Bestellungen', recentHint: 'Die neuesten Aktivitäten auf der Plattform', noRecent: 'Noch keine Bestellungen vorhanden.', quickActions: 'Schnellzugriff', financeAction: 'Finanzen prüfen', analyticsAction: 'Analysen öffnen', controlAction: 'Live-Betrieb öffnen', configurationAction: 'System konfigurieren',
  },
  ar: {
    dashboard: 'لوحة التحكم', operations: 'مركز العمليات', overview: 'نظرة عامة', controlCenter: 'مركز التحكم', orders: 'الطلبات', management: 'الإدارة', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', zones: 'مناطق التوصيل', business: 'الأعمال', finance: 'المالية', analytics: 'التحليلات', coupons: 'القسائم', loyalty: 'الولاء', system: 'النظام', announcements: 'الإعلانات', notifications: 'الإشعارات', configuration: 'الإعدادات', title: 'نظرة عامة على المنصة', subtitle: 'متابعة مباشرة للإيرادات والطلبات وعمليات التوصيل.', todayRevenue: 'إيراد اليوم', deliveredRevenue: 'من الطلبات المكتملة فقط', weekRevenue: 'إيراد هذا الأسبوع', monthRevenue: 'إيراد الشهر', todayOrders: 'طلبًا اليوم', activeOrders: 'الطلبات النشطة', onlineDrivers: 'السائقون المتصلون', availableDrivers: 'متاحون', activeRestaurants: 'مطاعم نشطة', totalCustomers: 'إجمالي المستخدمين', weeklyTrend: 'أداء آخر 7 أيام', weeklyHint: 'إيراد الطلبات المكتملة وجميع الطلبات الواردة', orderCount: 'طلبًا', platform: 'حالة التشغيل', driversLive: 'توفر السائقين', online: 'متصل', available: 'متاح', total: 'الإجمالي', manageDrivers: 'إدارة السائقين', restaurantsLive: 'حالة المطاعم', active: 'نشط', topRestaurants: 'أفضل المطاعم', byRating: 'حسب التقييم', reviews: 'تقييمات', noRatings: 'لا توجد تقييمات بعد.', allRestaurants: 'كل المطاعم', users: 'المستخدمون', byRole: 'التوزيع حسب الدور', activeOfTotal: 'نشط من', statusToday: 'توزيع حالات اليوم', noOrdersToday: 'لا توجد طلبات اليوم بعد.', activeOrdersHint: 'طلبات يجري تجهيزها أو توصيلها الآن', viewAll: 'عرض الكل', noActive: 'لا توجد طلبات نشطة', noActiveBody: 'ستظهر الطلبات الجديدة هنا تلقائيًا.', order: 'الطلب', customer: 'الزبون', restaurant: 'المطعم', status: 'الحالة', amount: 'المبلغ', recent: 'أحدث الطلبات', recentHint: 'آخر الأنشطة على المنصة', noRecent: 'لا توجد طلبات حتى الآن.', quickActions: 'اختصارات سريعة', financeAction: 'مراجعة المالية', analyticsAction: 'فتح التحليلات', controlAction: 'فتح التشغيل المباشر', configurationAction: 'إعداد النظام',
  },
  en: {
    dashboard: 'Dashboard', operations: 'Operations Center', overview: 'Overview', controlCenter: 'Control Center', orders: 'Orders', management: 'Management', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', zones: 'Delivery zones', business: 'Business', finance: 'Finance', analytics: 'Analytics', coupons: 'Coupons', loyalty: 'Loyalty', system: 'System', announcements: 'Announcements', notifications: 'Notifications', configuration: 'Configuration', title: 'Platform overview', subtitle: 'Live view of revenue, orders, and delivery operations.', todayRevenue: 'Revenue today', deliveredRevenue: 'Delivered orders only', weekRevenue: 'Revenue this week', monthRevenue: 'Revenue this month', todayOrders: 'Orders today', activeOrders: 'Active orders', onlineDrivers: 'Drivers online', availableDrivers: 'available', activeRestaurants: 'active restaurants', totalCustomers: 'Total users', weeklyTrend: 'Last 7 days', weeklyHint: 'Delivered revenue and all incoming orders', orderCount: 'orders', platform: 'Operating status', driversLive: 'Driver availability', online: 'Online', available: 'Available', total: 'Total', manageDrivers: 'Manage drivers', restaurantsLive: 'Restaurant status', active: 'Active', topRestaurants: 'Top restaurants', byRating: 'By rating', reviews: 'reviews', noRatings: 'No ratings yet.', allRestaurants: 'All restaurants', users: 'Users', byRole: 'Distribution by role', activeOfTotal: 'active of', statusToday: "Today's status distribution", noOrdersToday: 'No orders today yet.', activeOrdersHint: 'Orders currently being prepared or delivered', viewAll: 'View all', noActive: 'No active orders', noActiveBody: 'New orders will appear here automatically.', order: 'Order', customer: 'Customer', restaurant: 'Restaurant', status: 'Status', amount: 'Amount', recent: 'Recent orders', recentHint: 'Latest activity across the platform', noRecent: 'No orders yet.', quickActions: 'Quick actions', financeAction: 'Review finance', analyticsAction: 'Open analytics', controlAction: 'Open live operations', configurationAction: 'Configure system',
  },
} satisfies Record<Locale, Record<string, string>>;

function formatEUR(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
}

function statusLabel(status: string, locale: Locale): string {
  const labels: Record<string, Record<Locale, string>> = {
    pending: { de: 'Neu', ar: 'جديد', en: 'New' }, confirmed: { de: 'Bestätigt', ar: 'مؤكد', en: 'Confirmed' }, preparing: { de: 'Zubereitung', ar: 'قيد التحضير', en: 'Preparing' }, ready: { de: 'Bereit', ar: 'جاهز', en: 'Ready' }, picked_up: { de: 'Abgeholt', ar: 'تم الاستلام', en: 'Picked up' }, delivering: { de: 'Unterwegs', ar: 'في الطريق', en: 'On the way' }, delivered: { de: 'Zugestellt', ar: 'تم التوصيل', en: 'Delivered' }, cancelled: { de: 'Storniert', ar: 'ملغي', en: 'Cancelled' }, could_not_deliver: { de: 'Nicht zustellbar', ar: 'تعذر التوصيل', en: 'Could not deliver' }, refunded: { de: 'Erstattet', ar: 'مسترد', en: 'Refunded' },
  };
  return labels[status]?.[locale] ?? status.replaceAll('_', ' ');
}

function roleLabel(role: string, locale: Locale): string {
  const labels: Record<string, Record<Locale, string>> = {
    customer: { de: 'Kunden', ar: 'الزبائن', en: 'Customers' }, driver: { de: 'Fahrer', ar: 'السائقون', en: 'Drivers' }, restaurant: { de: 'Restaurants', ar: 'المطاعم', en: 'Restaurants' }, admin: { de: 'Admins', ar: 'المديرون', en: 'Admins' }, super_admin: { de: 'Super-Admins', ar: 'المديرون العامون', en: 'Super admins' }, manager: { de: 'Manager', ar: 'المشرفون', en: 'Managers' },
  };
  return labels[role]?.[locale] ?? role;
}

function weekdayLabel(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
}

export function AdminDashboardClient({ initialData, userName }: { initialData: AdminData; userName: string }) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = COPY[locale];
  const [data] = useState(initialData);
  const maxDailyRevenue = Math.max(...data.dailyRevenue.map((entry) => entry.revenue), 1);
  const statusTotal = Object.values(data.orderStatusBreakdown).reduce((sum, value) => sum + value, 0);

  const logout = useCallback(async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }, [router]);
  const navSections = useMemo<{ title: string; items: NavItem[] }[]>(() => [
    { title: copy.overview, items: [{ href: '/admin/dashboard', label: copy.dashboard, icon: Home, exact: true }, { href: '/admin/control-center', label: copy.controlCenter, icon: Activity }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }] },
    { title: copy.management, items: [{ href: '/admin/onboarding', label: locale === 'ar' ? 'الإنشاء والتجهيز' : locale === 'de' ? 'Erstellen & einrichten' : 'Create & onboard', icon: UserPlus }, { href: '/admin/users', label: copy.customers, icon: Users }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }, { href: '/admin/products', label: locale === 'ar' ? 'المنتجات' : locale === 'de' ? 'Produkte' : 'Products', icon: Box }, { href: '/admin/zones', label: copy.zones, icon: Map }] },
    { title: copy.business, items: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }, { href: '/admin/coupons', label: copy.coupons, icon: Tag }, { href: '/admin/loyalty', label: copy.loyalty, icon: Award }] },
    { title: copy.system, items: [{ href: '/admin/announcements', label: copy.announcements, icon: Megaphone }, { href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ], [copy, locale]);

  const quickActions = [
    { href: '/admin/onboarding?type=driver', label: locale === 'ar' ? 'إضافة سائق وتجهيز حسابه' : locale === 'de' ? 'Fahrer samt Konto hinzufügen' : 'Add driver with account', icon: Truck },
    { href: '/admin/onboarding?type=restaurant', label: locale === 'ar' ? 'إضافة مطعم وحساب المالك' : locale === 'de' ? 'Restaurant samt Betreiber hinzufügen' : 'Add restaurant and owner', icon: Store },
    { href: '/admin/onboarding?type=product', label: locale === 'ar' ? 'إضافة منتج إلى مطعم' : locale === 'de' ? 'Produkt zu Restaurant hinzufügen' : 'Add product to restaurant', icon: Box },
    { href: '/admin/zones', label: locale === 'ar' ? 'إضافة منطقة توصيل' : locale === 'de' ? 'Lieferzone hinzufügen' : 'Add delivery zone', icon: Map },
    { href: '/admin/control-center', label: copy.controlAction, icon: Activity },
    { href: '/admin/finance', label: copy.financeAction, icon: CreditCard },
    { href: '/admin/analytics', label: copy.analyticsAction, icon: BarChart3 },
    { href: '/admin/configuration', label: copy.configurationAction, icon: Settings },
  ];

  return <PortalShell brand={{ name: 'BlinkGo Admin', tagline: copy.operations, emoji: '👑' }} navSections={navSections} user={{ name: userName, email: userName, role: 'admin' }} locale={locale} onLocaleChange={setLocale} onLogout={logout} notificationCount={data.activeOrderCount}>
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader title={copy.title} description={copy.subtitle} />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={copy.todayRevenue} value={formatEUR(data.today.revenue, locale)} hint={`${data.today.orders} ${copy.todayOrders}`} tone="success" icon={<Euro className="size-5" />} />
        <KpiTile label={copy.weekRevenue} value={formatEUR(data.week.revenue, locale)} hint={`${data.week.orders} ${copy.orderCount}`} tone="info" icon={<BarChart3 className="size-5" />} />
        <KpiTile label={copy.activeOrders} value={data.activeOrderCount} hint={`${data.restaurants.active} ${copy.activeRestaurants}`} tone={data.activeOrderCount ? 'warning' : 'default'} icon={<Activity className="size-5" />} />
        <KpiTile label={copy.onlineDrivers} value={data.drivers.online} hint={`${data.drivers.available} ${copy.availableDrivers}`} tone="default" icon={<Truck className="size-5" />} />
      </div>

      <PortalCard className="mb-6">
        <SectionTitle hint={copy.weeklyHint}>{copy.weeklyTrend}</SectionTitle>
        <div className="grid h-44 grid-cols-7 gap-2" role="img" aria-label={copy.weeklyTrend}>
          {data.dailyRevenue.map((entry) => {
            const height = Math.max(entry.revenue ? 5 : 0, (entry.revenue / maxDailyRevenue) * 100);
            return <div key={entry.date} className="flex min-w-0 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center rounded-t-lg bg-bg/50 px-1">
                <div className="w-full max-w-12 rounded-t-md bg-gradient-to-t from-brand-red to-brand-yellow transition-all" style={{ height: `${height}%` }} title={`${weekdayLabel(entry.date, locale)}: ${formatEUR(entry.revenue, locale)}`} />
              </div>
              <p className="truncate text-[11px] font-bold text-text-muted">{weekdayLabel(entry.date, locale)}</p>
              <p className="text-[10px] tabular-nums text-text-muted">{entry.orders}</p>
            </div>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4 text-xs text-text-muted"><span>{copy.deliveredRevenue}</span><span>·</span><span>{copy.monthRevenue}: <strong className="text-text-primary">{formatEUR(data.month.revenue, locale)}</strong></span></div>
      </PortalCard>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PortalCard>
          <SectionTitle hint={copy.driversLive}>{copy.platform}</SectionTitle>
          <div className="space-y-4">
            {[[copy.online, data.drivers.online, 'bg-status-success'], [copy.available, data.drivers.available, 'bg-status-info'], [copy.total, data.drivers.total, 'bg-text-muted']].map(([label, value, tone]) => <div key={String(label)} className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><span className={`size-2 rounded-full ${tone}`} />{label}</span><strong className="text-2xl tabular-nums">{value}</strong></div>)}
          </div>
          <Link href="/admin/drivers" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold text-brand-red hover:bg-bg">{copy.manageDrivers}<ArrowRight className="size-4 rtl:-scale-x-100" /></Link>
        </PortalCard>

        <PortalCard>
          <SectionTitle hint={copy.byRating}>{copy.topRestaurants}</SectionTitle>
          {data.restaurants.top.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">{copy.noRatings}</p> : <div className="space-y-3">{data.restaurants.top.map((restaurant) => <div key={restaurant.id} className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-brand-red/10"><Store className="size-4 text-brand-red" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{restaurant.name || copy.restaurant}</p><p className="text-[11px] text-text-muted">{restaurant.review_count || 0} {copy.reviews}</p></div><span className="flex items-center gap-1 text-sm font-black"><Star className="size-3.5 fill-status-warning text-status-warning" />{Number(restaurant.rating || 0).toFixed(1)}</span></div>)}</div>}
          <Link href="/admin/restaurants" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold text-brand-red hover:bg-bg">{copy.allRestaurants}<ArrowRight className="size-4 rtl:-scale-x-100" /></Link>
        </PortalCard>

        <PortalCard>
          <SectionTitle hint={copy.byRole}>{copy.users}</SectionTitle>
          {Object.keys(data.users.breakdown).length === 0 ? <p className="py-8 text-center text-sm text-text-muted">—</p> : <div className="space-y-3">{Object.entries(data.users.breakdown).map(([role, info]) => <div key={role}><div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="font-bold">{roleLabel(role, locale)}</span><span className="text-xs text-text-muted">{info.active} {copy.activeOfTotal} {info.total}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-gradient-to-r from-brand-red to-brand-yellow" style={{ width: `${info.total ? (info.active / info.total) * 100 : 0}%` }} /></div></div>)}</div>}
          <p className="mt-5 border-t border-border pt-4 text-sm text-text-muted">{copy.totalCustomers}: <strong className="text-text-primary">{data.users.total}</strong></p>
        </PortalCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <PortalCard className="xl:col-span-2" padding="none">
          <div className="p-4 sm:p-5"><SectionTitle hint={copy.activeOrdersHint} action={<Link href="/admin/orders" className="text-sm font-bold text-brand-red hover:underline">{copy.viewAll}</Link>}>{copy.activeOrders}</SectionTitle></div>
          {data.activeOrders.length === 0 ? <EmptyState icon={<ShoppingBag className="size-8" />} title={copy.noActive} description={copy.noActiveBody} /> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="border-y border-border bg-bg text-xs text-text-muted"><tr><th className="p-3 text-start">{copy.order}</th><th className="p-3 text-start">{copy.customer}</th><th className="p-3 text-start">{copy.restaurant}</th><th className="p-3 text-start">{copy.status}</th><th className="p-3 text-end">{copy.amount}</th></tr></thead><tbody>{data.activeOrders.map((order) => <tr key={order.id} className="border-b border-border last:border-0 hover:bg-bg/50"><td className="p-3"><Link href={`/admin/orders/${order.id}`} dir="ltr" className="font-mono text-xs font-bold hover:text-brand-red">#{order.order_number || order.id.slice(0, 8)}</Link></td><td className="p-3">{relationName(order.customer)}</td><td className="p-3">{relationName(order.restaurants)}</td><td className="p-3"><StatusPill status={order.status} label={statusLabel(order.status, locale)} /></td><td className="p-3 text-end font-black">{formatEUR(Number(order.total || 0), locale)}</td></tr>)}</tbody></table></div>}
        </PortalCard>

        <PortalCard>
          <SectionTitle>{copy.statusToday}</SectionTitle>
          {statusTotal === 0 ? <p className="py-8 text-center text-sm text-text-muted">{copy.noOrdersToday}</p> : <div className="space-y-3">{Object.entries(data.orderStatusBreakdown).sort((a, b) => b[1] - a[1]).map(([status, count]) => <div key={status}><div className="mb-1 flex items-center justify-between gap-2"><StatusPill status={status} label={statusLabel(status, locale)} /><strong className="tabular-nums">{count}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-brand-red" style={{ width: `${(count / statusTotal) * 100}%` }} /></div></div>)}</div>}
        </PortalCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <PortalCard className="xl:col-span-2">
          <SectionTitle hint={copy.recentHint}>{copy.recent}</SectionTitle>
          {data.recentOrders.length === 0 ? <EmptyState icon={<ShoppingBag className="size-8" />} title={copy.noRecent} /> : <div className="divide-y divide-border">{data.recentOrders.slice(0, 8).map((order) => <Link key={order.id} href={`/admin/orders/${order.id}`} className="flex min-h-16 items-center gap-3 py-2 hover:bg-bg/50"><time className="w-12 shrink-0 text-xs tabular-nums text-text-muted">{order.created_at ? new Date(order.created_at).toLocaleTimeString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'}</time><div className="min-w-0 flex-1"><p dir="ltr" className="w-fit font-mono text-xs font-bold">#{order.order_number || order.id.slice(0, 8)}</p><p className="truncate text-xs text-text-muted">{relationName(order.customer)} · {relationName(order.restaurants)}</p></div><StatusPill status={order.status} label={statusLabel(order.status, locale)} /><strong className="hidden w-24 text-end text-sm sm:block">{formatEUR(Number(order.total || 0), locale)}</strong><ArrowRight className="size-4 shrink-0 text-text-muted rtl:-scale-x-100" /></Link>)}</div>}
        </PortalCard>

        <PortalCard>
          <SectionTitle>{copy.quickActions}</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">{quickActions.map((action) => { const Icon = action.icon; return <Link key={action.href} href={action.href} className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-bg px-4 text-sm font-bold transition hover:border-brand-red/50 hover:text-brand-red"><Icon className="size-4" /><span className="flex-1">{action.label}</span><ArrowRight className="size-4 text-text-muted rtl:-scale-x-100" /></Link>; })}</div>
        </PortalCard>
      </div>
    </div>
  </PortalShell>;
}
