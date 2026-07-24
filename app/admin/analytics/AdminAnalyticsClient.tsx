'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, BarChart3, Activity, Users, ShoppingBag, DollarSign, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';

const T = {
  de: {
    title: 'Analytics',
    subtitle: 'Detaillierte Einblicke in das Systemverhalten',
    avgOrder: 'Ø Bestellwert',
    activeCustomers: 'Aktive Kunden (7 Tage)',
    totalCustomers: 'Gesamt Kunden',
    hourly: 'Bestellungen nach Uhrzeit',
    daily: 'Letzte 14 Tage',
    weekday: 'Bestellungen nach Wochentag',
    status: 'Status-Verteilung',
    sun: 'So', mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa',
    refresh: 'Aktualisieren',
    noData: 'Keine Daten',
  },
  ar: {
    title: 'التحليلات',
    subtitle: 'رؤى تفصيلية في سلوك النظام',
    avgOrder: 'متوسط قيمة الطلب',
    activeCustomers: 'العملاء النشطون (7 أيام)',
    totalCustomers: 'إجمالي العملاء',
    hourly: 'الطلبات حسب الساعة',
    daily: 'آخر 14 يوم',
    weekday: 'الطلبات حسب يوم الأسبوع',
    status: 'توزيع الحالات',
    sun: 'أحد', mon: 'إثنين', tue: 'ثلاثاء', wed: 'أربعاء', thu: 'خميس', fri: 'جمعة', sat: 'سبت',
    refresh: 'تحديث',
    noData: 'لا توجد بيانات',
  },
  en: {
    title: 'Analytics',
    subtitle: 'Detailed insights into system behavior',
    avgOrder: 'Avg order value',
    activeCustomers: 'Active customers (7 days)',
    totalCustomers: 'Total customers',
    hourly: 'Orders by hour',
    daily: 'Last 14 days',
    weekday: 'Orders by weekday',
    status: 'Status distribution',
    sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
    refresh: 'Refresh',
    noData: 'No data',
  },
};

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning',
  confirmed: 'bg-blue-500',
  preparing: 'bg-brand-yellow-500',
  ready: 'bg-violet-500',
  picked_up: 'bg-cyan-500',
  delivered: 'bg-emerald-500',
  cancelled: 'bg-red-500',
};

export function AdminAnalyticsClient({
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
      const res = await fetch('/api/admin/analytics');
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

  const maxHourly = Math.max(...(data?.hourly ?? [1]));
  const maxDaily = Math.max(...(data?.series?.map((s: any) => s.orders) ?? [1]));
  const maxWeekday = Math.max(...(data?.dayOfWeek ?? [1]));

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header>
          <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
          <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            icon={DollarSign}
            label={t.avgOrder}
            value={`${data?.aov ?? 0} €`}
            color="text-emerald-400"
          />
          <StatCard
            icon={Users}
            label={t.activeCustomers}
            value={data?.activeCustomers ?? 0}
            sub={`/ ${data?.totalCustomers ?? 0}`}
            color="text-cyan-400"
          />
          <StatCard
            icon={ShoppingBag}
            label={t.daily}
            value={data?.series?.reduce((s: number, x: any) => s + x.orders, 0) ?? 0}
            color="text-brand-500"
          />
        </section>

        {/* Hourly chart */}
        <section className="rounded-2xl bg-surface-elevated border border-edge p-5">
          <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
            <Clock className="inline w-4 h-4 me-1" />
            {t.hourly}
          </h2>
          {data && (
            <div className="flex items-end gap-0.5 h-[140px]" dir="ltr">
              {data.hourly.map((count: number, h: number) => {
                const h2 = (count / maxHourly) * 100;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1 group">
                    <div
                      className="w-full bg-gradient-to-t from-brand-500 to-accent-500 rounded-t-sm hover:opacity-80 transition-opacity"
                      style={{ height: `${Math.max(h2, 1)}%` }}
                      title={`${h}:00 - ${count}`}
                    />
                    {h % 4 === 0 && (
                      <span className="text-[8px] text-text-muted">{h}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Daily chart */}
        <section className="rounded-2xl bg-surface-elevated border border-edge p-5">
          <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
            <Calendar className="inline w-4 h-4 me-1" />
            {t.daily}
          </h2>
          {data && (
            <div className="space-y-2">
              {data.series.map((s: any) => {
                const pct = (s.orders / maxDaily) * 100;
                return (
                  <div key={s.date} className="flex items-center gap-2 text-xs" dir="ltr">
                    <span className="w-12 text-text-muted tabular-nums">{s.date}</span>
                    <div className="flex-1 h-6 bg-ink-700 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-accent-500 flex items-center justify-end px-2 text-[10px] font-extrabold text-white"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      >
                        {s.orders > 0 && s.orders}
                      </div>
                    </div>
                    <span className="w-16 text-end text-text-secondary tabular-nums font-extrabold">
                      {s.revenue.toFixed(0)}€
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Weekday + status */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface-elevated border border-edge p-5">
            <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
              {t.weekday}
            </h2>
            {data && (
              <div className="flex items-end gap-2 h-[140px]" dir="ltr">
                {data.dayOfWeek.map((count: number, i: number) => {
                  const pct = (count / maxWeekday) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-gradient-to-t from-cyan-500 to-blue-500 rounded-t-md"
                        style={{ height: `${Math.max(pct, 1)}%` }}
                        title={`${t[DAYS[i]]} - ${count}`}
                      />
                      <span className="text-[10px] text-text-muted font-bold uppercase">
                        {t[DAYS[i]]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-surface-elevated border border-edge p-5">
            <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
              {t.status}
            </h2>
            {data && (
              <div className="space-y-2">
                {Object.entries(data.statusDist)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([status, count]) => {
                    const total = Object.values(data.statusDist).reduce(
                      (s: number, v) => s + (v as number),
                      0,
                    );
                    const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                    return (
                      <div key={status} className="flex items-center gap-2 text-xs">
                        <span
                          className={cn(
                            'w-2.5 h-2.5 rounded-sm flex-shrink-0',
                            STATUS_COLORS[status] ?? 'bg-ink-700',
                          )}
                        />
                        <span className="w-20 font-bold text-text-secondary uppercase tracking-wider text-[10px]">
                          {status}
                        </span>
                        <div className="flex-1 h-2 bg-ink-700 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full', STATUS_COLORS[status] ?? 'bg-ink-600')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-12 text-end text-white font-extrabold tabular-nums">
                          {count as number}
                        </span>
                      </div>
                    );
                  })}
              </div>
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
  sub,
  color,
}: {
  icon: any;
  label: string;
  value: any;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge p-4 sm:p-5">
      <Icon className={cn('w-5 h-5 mb-2', color)} />
      <p className="text-2xl sm:text-3xl font-black text-white tabular-nums leading-none">
        {value}
        {sub && <span className="text-base text-text-muted font-normal ms-1">{sub}</span>}
      </p>
      <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider mt-1.5">
        {label}
      </p>
    </div>
  );
}
