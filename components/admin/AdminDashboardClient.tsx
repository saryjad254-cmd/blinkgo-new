'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Truck,
  Store,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  DollarSign,
  TrendingUp,
  Activity,
  Clock,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  Calendar,
  Banknote,
  Receipt,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from './AdminLayout';
import Link from 'next/link';
import { formatCurrency } from '@/lib/i18n/format';

interface Stats {
  users: {
    totalCustomers: number;
    totalDrivers: number;
    totalRestaurants: number;
    onlineDrivers: number;
  };
  orders: {
    total: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  revenue: {
    total: number;
    today: number;
    week: number;
    month: number;
    commission: number;
    commissionRate: number;
  };
  recent: any[];
}

const T = {
  de: {
    title: 'Admin Dashboard',
    subtitle: 'Vollständige Systemübersicht in Echtzeit',
    refresh: 'Aktualisieren',
    customers: 'Kunden',
    drivers: 'Fahrer',
    restaurants: 'Restaurants',
    online: 'Online',
    activeOrders: 'Aktive Bestellungen',
    completed: 'Abgeschlossen',
    cancelled: 'Storniert',
    orderStatus: 'Bestellstatus',
    revenueHeader: 'Umsatz',
    revenueToday: 'Umsatz heute',
    revenueWeek: 'Diese Woche',
    revenueMonth: 'Diesen Monat',
    totalRevenue: 'Gesamtumsatz',
    commission: 'Plattform-Provision',
    onlineDrivers: 'Fahrer online',
    recentOrders: 'Letzte Bestellungen',
    viewAll: 'Alle anzeigen',
    noRecent: 'Keine Bestellungen',
    error: 'Statistiken konnten nicht geladen werden',
    retry: 'Erneut versuchen',
  },
  ar: {
    title: 'لوحة الإدارة',
    subtitle: 'نظرة شاملة على النظام في الوقت الفعلي',
    refresh: 'تحديث',
    customers: 'العملاء',
    drivers: 'السائقون',
    restaurants: 'المطاعم',
    online: 'متصل',
    activeOrders: 'الطلبات النشطة',
    completed: 'مكتمل',
    cancelled: 'ملغي',
    orderStatus: 'حالة الطلبات',
    revenueHeader: 'الإيرادات',
    revenueToday: 'إيرادات اليوم',
    revenueWeek: 'هذا الأسبوع',
    revenueMonth: 'هذا الشهر',
    totalRevenue: 'إجمالي الإيرادات',
    commission: 'عمولة المنصة',
    onlineDrivers: 'السائقون المتصلون',
    recentOrders: 'آخر الطلبات',
    viewAll: 'عرض الكل',
    noRecent: 'لا توجد طلبات',
    error: 'تعذر تحميل الإحصائيات',
    retry: 'حاول مجدداً',
  },
  en: {
    title: 'Admin Dashboard',
    subtitle: 'Complete real-time system overview',
    refresh: 'Refresh',
    customers: 'Customers',
    drivers: 'Drivers',
    restaurants: 'Restaurants',
    online: 'Online',
    activeOrders: 'Active orders',
    completed: 'Completed',
    cancelled: 'Cancelled',
    orderStatus: 'Order status',
    revenueHeader: 'Revenue',
    revenueToday: 'Revenue today',
    revenueWeek: 'This week',
    revenueMonth: 'This month',
    totalRevenue: 'Total revenue',
    commission: 'Platform commission',
    onlineDrivers: 'Online drivers',
    recentOrders: 'Recent orders',
    viewAll: 'View all',
    noRecent: 'No recent orders',
    error: 'Failed to load stats',
    retry: 'Retry',
  },
};

export function AdminDashboardClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setError(null);
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t.error);
      }
      setStats(data.stats);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // refresh every 30s
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
            <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={fetchStats}
            disabled={loading}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-700 border border-edge text-sm font-bold text-text-secondary hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {t.refresh}
          </button>
        </header>

        {error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-400">{t.error}</p>
              <p className="text-xs text-red-500/80 mt-0.5">{error}</p>
            </div>
            <button
              type="button"
              onClick={fetchStats}
              className="h-8 px-3 rounded-lg bg-red-500/20 text-red-300 text-xs font-bold hover:bg-red-500/30"
            >
              {t.retry}
            </button>
          </div>
        )}

        {/* Top stat cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard locale={locale}
            icon={Users}
            label={t.customers}
            value={stats?.users.totalCustomers ?? 0}
            accent="from-blue-500 to-cyan-500"
          />
          <StatCard locale={locale}
            icon={Truck}
            label={t.drivers}
            value={stats?.users.totalDrivers ?? 0}
            subValue={stats ? `${t.online}: ${stats.users.onlineDrivers}` : ''}
            accent="from-emerald-500 to-green-600"
          />
          <StatCard locale={locale}
            icon={Store}
            label={t.restaurants}
            value={stats?.users.totalRestaurants ?? 0}
            accent="from-brand-yellow-500 to-brand-red-600"
          />
          <StatCard locale={locale}
            icon={ShoppingBag}
            label={t.activeOrders}
            value={stats?.orders.active ?? 0}
            accent="from-brand-500 to-pink-600"
            pulse
          />
        </section>

        {/* Order status overview */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface-elevated border border-edge p-5">
            <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
              {t.orderStatus}
            </h2>
            <div className="space-y-2">
              <StatusRow
                icon={Activity}
                label={t.activeOrders}
                value={stats?.orders.active ?? 0}
                total={stats?.orders.total ?? 1}
                color="bg-brand-500"
              />
              <StatusRow
                icon={CheckCircle2}
                label={t.completed}
                value={stats?.orders.completed ?? 0}
                total={stats?.orders.total ?? 1}
                color="bg-emerald-500"
              />
              <StatusRow
                icon={XCircle}
                label={t.cancelled}
                value={stats?.orders.cancelled ?? 0}
                total={stats?.orders.total ?? 1}
                color="bg-red-500"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-surface-elevated border border-edge p-5">
            <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
              {t.revenueHeader}
            </h2>
            <div className="space-y-2">
              <RevenueRow
                icon={Clock}
                label={t.revenueToday}
                value={stats?.revenue.today ?? 0}
              />
              <RevenueRow
                icon={Calendar}
                label={t.revenueWeek}
                value={stats?.revenue.week ?? 0}
              />
              <RevenueRow
                icon={TrendingUp}
                label={t.revenueMonth}
                value={stats?.revenue.month ?? 0}
              />
              <div className="pt-2 border-t border-edge">
                <RevenueRow
                  icon={DollarSign}
                  label={t.totalRevenue}
                  value={stats?.revenue.total ?? 0}
                  bold
                />
                <RevenueRow
                  icon={Receipt}
                  label={t.commission + ` (${((stats?.revenue.commissionRate ?? 0.15) * 100).toFixed(0)}%)`}
                  value={stats?.revenue.commission ?? 0}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Recent orders */}
        <section className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          <header className="px-5 py-4 border-b border-edge flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider">
              {t.recentOrders}
            </h2>
            <Link
              href="/admin/orders"
              className="text-xs font-bold text-brand-500 hover:text-brand-400 inline-flex items-center gap-1"
            >
              {t.viewAll}
              <ChevronRight className="w-3 h-3 rtl:rotate-180" />
            </Link>
          </header>
          {stats?.recent.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm">
              {t.noRecent}
            </div>
          ) : (
            <div className="divide-y divide-edge">
              {stats?.recent.map((o: any) => (
                <Link
                  key={o.id}
                  href={`/admin/orders/${o.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-surface transition-colors"
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      o.status === 'delivered' && 'bg-emerald-500/15 text-emerald-400',
                      o.status === 'cancelled' && 'bg-red-500/15 text-red-400',
                      o.status === 'pending' && 'bg-warning/15 text-warning',
                      !['delivered', 'cancelled', 'pending'].includes(o.status) &&
                        'bg-ink-700 text-text-secondary',
                    )}
                  >
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-white truncate">
                      #{o.order_number}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {o.restaurants?.name ?? '—'} ·{' '}
                      {new Date(o.created_at).toLocaleString(
                        locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE',
                        { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
                      )}
                    </p>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <p className="text-sm font-extrabold text-white tabular-nums">
                      {formatCurrency(Number(o.total), locale)}
                    </p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">
                      {o.status}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  accent,
  pulse,
  locale = 'de',
}: {
  icon: any;
  label: string;
  value: number;
  subValue?: string;
  locale?: string;
  accent: string;
  pulse?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface-elevated border border-edge p-4 sm:p-5 group">
      <div
        className={cn(
          'absolute -top-6 -end-6 w-24 h-24 rounded-full blur-2xl opacity-30 group-hover:opacity-50 transition-opacity bg-gradient-to-br',
          accent,
        )}
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br',
              accent,
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
          {pulse && (
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-brand-500 animate-ping opacity-75" />
              <span className="relative inline-block w-2 h-2 rounded-full bg-brand-500" />
            </span>
          )}
        </div>
        <p className="text-2xl sm:text-3xl font-black text-white tabular-nums leading-none">
          {value.toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-US' : 'de-DE')}
        </p>
        <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider mt-1.5">
          {label}
        </p>
        {subValue && (
          <p className="text-[10px] text-emerald-400 font-bold mt-0.5">{subValue}</p>
        )}
      </div>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  total,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-bold text-text-secondary flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>
        <span className="font-extrabold text-white tabular-nums">
          {value} <span className="text-text-muted font-normal">/ {total}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RevenueRow({
  icon: Icon,
  label,
  value,
  bold,
}: {
  icon: any;
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-1.5',
        bold && 'border-t border-edge pt-3 mt-1',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1.5',
          bold ? 'text-sm font-extrabold text-white' : 'text-xs text-text-secondary',
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          bold
            ? 'text-lg font-black text-emerald-400'
            : 'text-sm font-extrabold text-white',
        )}
      >
        {value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
      </span>
    </div>
  );
}
