'use client';

/**
 * RestaurantAnalytics — performance insights for operations.
 *
 * Shows:
 * - Revenue by day (7/30 day)
 * - Order volume by hour (peak detection)
 * - Top restaurants (sorted by revenue)
 * - Performance distribution
 * - KPIs at a glance
 */

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Clock, Star, Store, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';

interface AnalyticsData {
  period_days: number;
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  unique_customers: number;
  repeat_rate: number;
  peak_hour: number;
  peak_hour_orders: number;
  revenue_by_day: Array<{ date: string; revenue: number; orders: number }>;
  orders_by_hour: Array<{ hour: number; orders: number; revenue: number }>;
  top_restaurants: Array<{ id: string; name: string; revenue: number; orders: number; rating: number }>;
  prev_period: {
    total_revenue: number;
    total_orders: number;
    avg_order_value: number;
  };
}

export function RestaurantAnalytics({ data }: { data: AnalyticsData }) {
  const t = useT();
  const [period, setPeriod] = useState<7 | 30>(data.period_days === 30 ? 30 : 7);

  const revenueChange = data.prev_period.total_revenue > 0
    ? ((data.total_revenue - data.prev_period.total_revenue) / data.prev_period.total_revenue) * 100
    : 0;
  const ordersChange = data.prev_period.total_orders > 0
    ? ((data.total_orders - data.prev_period.total_orders) / data.prev_period.total_orders) * 100
    : 0;

  // Hour bar max for chart scaling
  const maxHourOrders = useMemo(
    () => Math.max(...data.orders_by_hour.map((h) => h.orders), 1),
    [data.orders_by_hour]
  );
  const maxDayRevenue = useMemo(
    () => Math.max(...data.revenue_by_day.map((d) => d.revenue), 1),
    [data.revenue_by_day]
  );

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-1">Performance</h2>
        <div className="inline-flex rounded-xl bg-bg-card border border-ink-3/30 p-0.5">
          {([7, 30] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors ${
                period === p ? 'bg-brand-primary text-white' : 'text-ink-2'
              }`}
            >
              {p} Tage
            </button>
          ))}
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Umsatz"
          value={formatEUR(data.total_revenue)}
          change={revenueChange}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Bestellungen"
          value={data.total_orders.toLocaleString('de-DE')}
          change={ordersChange}
        />
        <KpiCard
          icon={TrendingUp}
          label="Ø Bestellwert"
          value={formatEUR(data.avg_order_value)}
        />
        <KpiCard
          icon={Clock}
          label="Stoßzeit"
          value={`${data.peak_hour}:00 Uhr`}
          sublabel={`${data.peak_hour_orders} Bestellungen`}
        />
      </div>

      {/* Customer metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MiniCard label="Eindeutige Kunden" value={data.unique_customers.toLocaleString('de-DE')} icon={Star} />
        <MiniCard
          label="Wiederkehrrate"
          value={`${data.repeat_rate.toFixed(1)}%`}
          icon={TrendingUp}
          tone={data.repeat_rate >= 30 ? 'success' : 'warning'}
        />
      </div>

      {/* Revenue by day — bar chart */}
      <div className="bg-bg-card border-2 border-ink-3/20 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-ink-1 mb-3">Umsatz pro Tag</h3>
        <div className="flex items-end gap-1 h-32">
          {data.revenue_by_day.map((d, i) => {
            const height = (d.revenue / maxDayRevenue) * 100;
            const isToday = i === data.revenue_by_day.length - 1;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t ${isToday ? 'bg-brand-primary' : 'bg-brand-primary/40'} transition-all hover:bg-brand-primary/70`}
                  style={{ height: `${height}%`, minHeight: '4px' }}
                  title={`${d.date}: ${formatEUR(d.revenue)} (${d.orders})`}
                  aria-label={`${d.date}: ${formatEUR(d.revenue)}`}
                />
                {data.revenue_by_day.length <= 14 && (
                  <div className="text-[9px] text-ink-2 truncate w-full text-center">
                    {new Date(d.date).getDate()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Orders by hour — peak hour analysis */}
      <div className="bg-bg-card border-2 border-ink-3/20 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-ink-1 mb-3">Bestellungen pro Stunde</h3>
        <div className="flex items-end gap-0.5 h-24">
          {data.orders_by_hour.map((h) => {
            const height = (h.orders / maxHourOrders) * 100;
            const isPeak = h.hour === data.peak_hour;
            return (
              <div
                key={h.hour}
                className="flex-1 flex flex-col items-center gap-1"
                title={`${h.hour}:00 — ${h.orders} Bestellungen (${formatEUR(h.revenue)})`}
              >
                <div
                  className={`w-full rounded-t ${isPeak ? 'bg-warning-500' : 'bg-info-500/60'}`}
                  style={{ height: `${height}%`, minHeight: '2px' }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-ink-2 mt-1">
          <span>0</span>
          <span>6</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>
        <p className="text-xs text-ink-2 mt-2">
          🔥 Stoßzeit: <span className="font-semibold text-ink-1">{data.peak_hour}:00 Uhr</span> mit {data.peak_hour_orders} Bestellungen
        </p>
      </div>

      {/* Top restaurants */}
      <div className="bg-bg-card border-2 border-ink-3/20 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-ink-1 mb-3">Top-Restaurants</h3>
        <div className="space-y-2">
          {data.top_restaurants.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 p-2 rounded-xl bg-bg-elevated">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i === 0 ? 'bg-golden-yellow text-white' :
                i === 1 ? 'bg-ink-2 text-white' :
                i === 2 ? 'bg-warning-500 text-white' : 'bg-bg-card text-ink-2'
              }`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-1 truncate">{r.name}</div>
                <div className="text-xs text-ink-2">{r.orders} Bestellungen · ⭐ {r.rating.toFixed(1)}</div>
              </div>
              <div className="text-end">
                <div className="text-sm font-bold text-tip-gradient">{formatEUR(r.revenue)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, change, sublabel }: { icon: any; label: string; value: string; change?: number; sublabel?: string }) {
  return (
    <div className="bg-bg-card border-2 border-ink-3/20 rounded-2xl p-3">
      <div className="flex items-center gap-1.5 text-xs text-ink-2 mb-1">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-ink-1">{value}</div>
      {change !== undefined && (
        <div className={`text-xs font-medium flex items-center gap-0.5 mt-0.5 ${change >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
          {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {change >= 0 ? '+' : ''}{change.toFixed(1)}%
        </div>
      )}
      {sublabel && <div className="text-xs text-ink-2 mt-0.5">{sublabel}</div>}
    </div>
  );
}

function MiniCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone?: 'success' | 'warning' }) {
  const colors = {
    success: 'text-success-700',
    warning: 'text-warning-700',
  };
  return (
    <div className="bg-bg-card border border-ink-3/20 rounded-xl p-3 flex items-center gap-2">
      <Icon className={`h-5 w-5 ${tone ? colors[tone] : 'text-ink-2'}`} aria-hidden />
      <div>
        <div className="text-xs text-ink-2">{label}</div>
        <div className={`text-lg font-bold ${tone ? colors[tone] : 'text-ink-1'}`}>{value}</div>
      </div>
    </div>
  );
}
