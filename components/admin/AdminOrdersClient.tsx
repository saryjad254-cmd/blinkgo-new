'use client';

/**
 * Admin Orders Client — list with filters and search.
 */

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import {
  PageHeader,
  PortalCard,
  StatusPill,
  EmptyState,
} from '@/components/portal/PortalPrimitives';
import {
  Home,
  ShoppingBag,
  Users,
  Truck,
  Store,
  Map,
  BarChart3,
  CreditCard,
  Settings,
  Bell,
  Search,
  ChevronRight,
  ShoppingBag as ShoppingBagIcon,
  User,
} from 'lucide-react';

import { Activity } from 'lucide-react';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';

const COPY = {
  de: { orders: 'Bestellungen', overview: 'Übersicht', dashboard: 'Dashboard', controlCenter: 'Control Center', management: 'Management', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', zones: 'Lieferzonen', business: 'Business', finance: 'Finanzen', analytics: 'Analytics', system: 'System', notifications: 'Benachrichtigungen', configuration: 'Konfiguration', total: 'Bestellungen insgesamt', shown: 'werden angezeigt', search: 'Suchen nach Nr., Kunde, Restaurant, Fahrer oder Adresse…', all: 'Alle', active: 'Aktiv', empty: 'Keine Bestellungen gefunden', emptyBody: 'Versuchen Sie eine andere Suche oder einen anderen Filter.', notAssigned: 'Nicht zugewiesen', cash: 'Barzahlung', card: 'Karte', online: 'Online' },
  ar: { orders: 'الطلبات', overview: 'نظرة عامة', dashboard: 'لوحة التحكم', controlCenter: 'مركز التحكم', management: 'الإدارة', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', zones: 'مناطق التوصيل', business: 'الأعمال', finance: 'المالية', analytics: 'التحليلات', system: 'النظام', notifications: 'الإشعارات', configuration: 'الإعدادات', total: 'إجمالي الطلبات', shown: 'معروض حالياً', search: 'ابحث برقم الطلب أو الزبون أو المطعم أو السائق أو العنوان…', all: 'الكل', active: 'النشطة', empty: 'لم يتم العثور على طلبات', emptyBody: 'جرّب عبارة بحث أو فلتر حالة مختلفاً.', notAssigned: 'غير معيّن', cash: 'نقداً', card: 'بطاقة', online: 'إلكتروني' },
  en: { orders: 'Orders', overview: 'Overview', dashboard: 'Dashboard', controlCenter: 'Control Center', management: 'Management', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', zones: 'Delivery zones', business: 'Business', finance: 'Finance', analytics: 'Analytics', system: 'System', notifications: 'Notifications', configuration: 'Configuration', total: 'orders in total', shown: 'currently shown', search: 'Search by number, customer, restaurant, driver, or address…', all: 'All', active: 'Active', empty: 'No orders found', emptyBody: 'Try a different search term or status filter.', notAssigned: 'Not assigned', cash: 'Cash', card: 'Card', online: 'Online' },
} satisfies Record<Locale, Record<string, string>>;

function formatEUR(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function statusLabel(s: string, locale: Locale): string {
  const map: Record<string, Record<Locale, string>> = {
    pending: { de: 'Neu', ar: 'جديد', en: 'New' },
    confirmed: { de: 'Bestätigt', ar: 'مؤكد', en: 'Confirmed' },
    preparing: { de: 'Zubereitung', ar: 'قيد التحضير', en: 'Preparing' },
    ready: { de: 'Bereit', ar: 'جاهز', en: 'Ready' },
    picked_up: { de: 'Unterwegs', ar: 'في الطريق', en: 'On the way' },
    delivered: { de: 'Zugestellt', ar: 'تم التوصيل', en: 'Delivered' },
    cancelled: { de: 'Storniert', ar: 'ملغي', en: 'Cancelled' },
  };
  return map[s]?.[locale] || s;
}

function paymentLabel(method: string | null | undefined, copy: typeof COPY.de): string {
  const value = String(method || 'online').toLowerCase();
  if (value === 'cash') return copy.cash;
  if (['card', 'stripe', 'credit_card'].includes(value)) return copy.card;
  return copy.online;
}

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready', 'picked_up']);

type OrderRelation = { name?: string | null; phone?: string | null };
export interface AdminOrderRecord {
  id: string;
  order_number?: string | null;
  status: string;
  total?: number | string | null;
  payment_method?: string | null;
  created_at: string;
  delivery_address?: unknown;
  customer?: OrderRelation | OrderRelation[] | null;
  restaurants?: OrderRelation | OrderRelation[] | null;
  driver?: OrderRelation | OrderRelation[] | null;
}

function oneRelation(value: OrderRelation | OrderRelation[] | null | undefined): OrderRelation | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function AdminOrdersClient({ initialOrders, totalCount, userName }: { initialOrders: AdminOrderRecord[]; totalCount: number; userName: string }) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = COPY[locale];
  const [orders] = useState(initialOrders);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      // Status filter
      if (statusFilter === 'active' && !ACTIVE_STATUSES.has(o.status)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'active' && o.status !== statusFilter) return false;
      // Search
      if (search) {
        const s = search.toLowerCase();
        const matches = [
          o.order_number,
          oneRelation(o.customer)?.name,
          oneRelation(o.restaurants)?.name,
          oneRelation(o.driver)?.name,
          typeof o.delivery_address === 'object' ? JSON.stringify(o.delivery_address) : o.delivery_address,
        ].some((v) => v && String(v).toLowerCase().includes(s));
        if (!matches) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }, [router]);

  const navSections: { title: string; items: NavItem[] }[] = [
    { title: copy.overview, items: [
      { href: '/admin/dashboard', label: copy.dashboard, icon: Home, exact: true },
      { href: '/admin/control-center', label: copy.controlCenter, icon: Activity },
      { href: '/admin/orders', label: copy.orders, icon: ShoppingBag },
    ]},
    { title: copy.management, items: [
      { href: '/admin/users', label: copy.customers, icon: Users },
      { href: '/admin/drivers', label: copy.drivers, icon: Truck },
      { href: '/admin/restaurants', label: copy.restaurants, icon: Store },
      { href: '/admin/zones', label: copy.zones, icon: Map },
    ]},
    { title: copy.business, items: [
      { href: '/admin/finance', label: copy.finance, icon: CreditCard },
      { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 },
    ]},
    { title: copy.system, items: [
      { href: '/admin/notifications', label: copy.notifications, icon: Bell },
      { href: '/admin/configuration', label: copy.configuration, icon: Settings },
    ]},
  ];
  const statusFilters = [
    { value: 'all', label: copy.all },
    { value: 'active', label: copy.active },
    ...['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'].map((value) => ({ value, label: statusLabel(value, locale) })),
  ];

  return (
    <PortalShell
      brand={{ name: 'BlinkGo Admin', tagline: copy.orders, emoji: '👑' }}
      navSections={navSections}
      user={{ name: userName, email: userName, role: 'admin' }}
      locale={locale}
      onLocaleChange={setLocale}
      onLogout={logout}
    >
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <PageHeader
          title={copy.orders}
          description={`${totalCount} ${copy.total} · ${filtered.length} ${copy.shown}`}
        />

        {/* Search + Filter */}
        <PortalCard padding="md" className="mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder={copy.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg py-2.5 ps-10 pe-4 text-sm focus:border-brand-red focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  statusFilter === f.value
                    ? 'bg-brand-red text-white'
                    : 'bg-bg text-text-secondary hover:text-text-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </PortalCard>

        {/* Orders list */}
        {filtered.length === 0 ? (
          <PortalCard>
            <EmptyState
              icon={<ShoppingBagIcon className="w-8 h-8" />}
              title={copy.empty}
              description={copy.emptyBody}
            />
          </PortalCard>
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => (
              <Link key={o.id} href={`/admin/orders/${o.id}`}>
                <PortalCard padding="md" className="hover:border-brand-red transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-mono text-sm font-bold">
                          #{o.order_number || o.id.slice(0, 8)}
                        </p>
                        <StatusPill status={o.status} label={statusLabel(o.status, locale)} />
                        <span className="text-xs text-text-muted">
                          {new Date(o.created_at).toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-text-muted">
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3 h-3 flex-shrink-0" />
                          {oneRelation(o.customer)?.name || '—'}
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Store className="w-3 h-3 flex-shrink-0" />
                          {oneRelation(o.restaurants)?.name || '—'}
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Truck className="w-3 h-3 flex-shrink-0" />
                          {oneRelation(o.driver)?.name || copy.notAssigned}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-end">
                      <p className="text-lg font-extrabold text-status-success">
                        {formatEUR(Number(o.total || 0), locale)}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {paymentLabel(o.payment_method, copy)}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 flex-shrink-0 text-text-muted rtl:-scale-x-100" />
                  </div>
                </PortalCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
