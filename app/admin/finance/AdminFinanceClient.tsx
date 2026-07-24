'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Receipt, Store, Truck, RefreshCw, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';
import { formatCurrency } from '@/lib/i18n/format';

const T = {
  de: {
    title: 'Finanzen',
    subtitle: 'Umsatz, Provisionen und Auszahlungen',
    total: 'Gesamtumsatz (30 Tage)',
    commission: 'Plattform-Provision',
    drivers: 'Aktive Fahrer',
    restaurants: 'Aktive Restaurants',
    revenueChart: 'Umsatz pro Tag',
    topRestaurants: 'Top-Restaurants nach Umsatz',
    restaurant: 'Restaurant',
    revenue: 'Umsatz',
    orders: 'Bestellungen',
    rate: '15%',
    refresh: 'Aktualisieren',
    noData: 'Keine Daten',
  },
  ar: {
    title: 'المالية',
    subtitle: 'الإيرادات والعمولات والمدفوعات',
    total: 'إجمالي الإيرادات (30 يوم)',
    commission: 'عمولة المنصة',
    drivers: 'السائقون النشطون',
    restaurants: 'المطاعم النشطة',
    revenueChart: 'الإيرادات اليومية',
    topRestaurants: 'أفضل المطاعم من حيث الإيرادات',
    restaurant: 'المطعم',
    revenue: 'الإيرادات',
    orders: 'الطلبات',
    rate: '15%',
    refresh: 'تحديث',
    noData: 'لا توجد بيانات',
  },
  en: {
    title: 'Finance',
    subtitle: 'Revenue, commissions and payouts',
    total: 'Total revenue (30 days)',
    commission: 'Platform commission',
    drivers: 'Active drivers',
    restaurants: 'Active restaurants',
    revenueChart: 'Daily revenue',
    topRestaurants: 'Top restaurants by revenue',
    restaurant: 'Restaurant',
    revenue: 'Revenue',
    orders: 'Orders',
    rate: '15%',
    refresh: 'Refresh',
    noData: 'No data',
  },
};

export function AdminFinanceClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/finance');
      const json = await res.json();
      if (res.ok && json.ok) setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
            <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-700 border border-edge text-sm font-bold text-text-secondary hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </header>

        {/* Top stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={DollarSign}
            label={t.total}
            value={data?.totalRevenue ?? 0}
            accent="from-emerald-500 to-green-600"
          />
          <StatCard
            icon={Receipt}
            label={`${t.commission} ${t.rate}`}
            value={data?.platformCommission ?? 0}
            accent="from-brand-500 to-pink-600"
          />
          <StatCard
            icon={Truck}
            label={t.drivers}
            value={data?.driverCount ?? 0}
            accent="from-cyan-500 to-blue-600"
          />
          <StatCard
            icon={Store}
            label={t.restaurants}
            value={data?.restaurantCount ?? 0}
            accent="from-brand-yellow-500 to-brand-red-600"
          />
        </section>

        {/* Revenue chart */}
        <section className="rounded-2xl bg-surface-elevated border border-edge p-5">
          <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
            {t.revenueChart}
          </h2>
          {data?.series && data.series.length > 0 ? (
            <RevenueChart series={data.series} locale={locale} />
          ) : (
            <p className="text-sm text-text-muted text-center py-8">{t.noData}</p>
          )}
        </section>

        {/* Top restaurants */}
        <section className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          <header className="px-5 py-4 border-b border-edge">
            <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider">
              {t.topRestaurants}
            </h2>
          </header>
          <div className="divide-y divide-edge">
            {data?.topRestaurants?.map((r: any, i: number) => (
              <div key={r.id} className="flex items-center gap-3 p-4">
                <span className="w-7 h-7 rounded-lg bg-brand-gradient flex items-center justify-center text-white text-xs font-black">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-white truncate">
                    {r.name ?? '—'}
                  </p>
                  <p className="text-xs text-text-muted">
                    {r.orders} {t.orders}
                  </p>
                </div>
                <p className="text-base font-black text-emerald-400 tabular-nums">
                  {formatCurrency(r.revenue, locale)}
                </p>
              </div>
            ))}
            {(!data?.topRestaurants || data.topRestaurants.length === 0) && (
              <p className="p-8 text-center text-text-muted text-sm">{t.noData}</p>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge p-4 sm:p-5">
      <div
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br mb-3',
          accent,
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xl sm:text-2xl font-black text-white tabular-nums leading-none">
        {typeof value === 'number' && value > 100
          ? value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : value}
        {typeof value === 'number' && label?.includes('Umsatz') && ' €'}
        {typeof value === 'number' && label?.includes('Provision') && ' €'}
        {typeof value === 'number' && (label?.includes('الإيرادات') || label?.includes('العمولة')) && ' €'}
      </p>
      <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider mt-1.5">
        {label}
      </p>
    </div>
  );
}

function RevenueChart({
  series,
  locale,
}: {
  series: { date: string; revenue: number; orders: number }[];
  locale: 'de' | 'ar' | 'en';
}) {
  const max = Math.max(...series.map((s) => s.revenue), 1);
  const chartHeight = 200;
  const barWidth = 100 / series.length;
  return (
    <div className="space-y-3">
      <div
        className="flex items-end gap-0.5 h-[200px] w-full"
        dir="ltr"
      >
        {series.map((s) => {
          const height = (s.revenue / max) * chartHeight;
          return (
            <div
              key={s.date}
              className="group relative flex-1 flex items-end h-full"
            >
              <div
                className="w-full bg-gradient-to-t from-brand-500 to-accent-500 rounded-t-sm hover:opacity-80 transition-opacity cursor-pointer"
                style={{ height: `${Math.max(height, 1)}px` }}
                title={`${s.date}: ${formatCurrency(s.revenue, locale)} (${s.orders} ${s.orders === 1 ? 'order' : 'orders'})`}
              />
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:block bg-ink-900 border border-edge rounded-lg px-2 py-1 text-[10px] font-bold text-white whitespace-nowrap z-10">
                {formatCurrency(s.revenue, locale)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-text-muted" dir="ltr">
        <span>{new Date(series[0]?.date).toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: 'short' })}</span>
        <span>{new Date(series[Math.floor(series.length / 2)]?.date).toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: 'short' })}</span>
        <span>{new Date(series[series.length - 1]?.date).toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: 'short' })}</span>
      </div>
    </div>
  );
}
