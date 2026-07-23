'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Users, Truck, Store, DollarSign, Activity, Award, BarChart3 } from 'lucide-react';

interface ExecutiveKPIs {
  gmv: number;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  gross_revenue: number;
  commission_revenue: number;
  delivery_fee_revenue: number;
  net_revenue: number;
  gross_profit: number;
  profit_margin: number;
  active_customers: number;
  new_customers: number;
  active_drivers: number;
  active_restaurants: number;
  average_order_value: number;
  orders_per_hour: number;
  orders_per_day: number;
  payment_processing_fees: number;
}

interface DashboardData {
  current: ExecutiveKPIs;
  previous: ExecutiveKPIs;
  growth: Record<string, number>;
}

function formatCurrency(n: number): string {
  return '€' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function formatGrowth(n: number): string {
  const pct = (n * 100).toFixed(1);
  return parseFloat(pct) >= 0 ? '+' + pct + '%' : pct + '%';
}

function GrowthIndicator({ value }: { value: number }) {
  const positive = value > 0;
  return (
    <span className={'text-sm font-semibold flex items-center gap-0.5 ' + (positive ? 'text-green-600' : 'text-red-600')}>
      {value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {formatGrowth(value)}
    </span>
  );
}

function HeroCard({ title, value, growth, icon, color }: { title: string; value: string; growth?: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={'bg-gradient-to-br ' + color + ' p-3 text-white'}>{icon}</div>
      <div className="p-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide">{title}</div>
        <div className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{value}</div>
        {growth !== undefined && (
          <div className="mt-1">
            <GrowthIndicator value={growth} />
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value, growth, subtitle }: { title: string; value: string; growth?: number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{title}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {growth !== undefined && (
        <div className="mt-1">
          <GrowthIndicator value={growth} />
        </div>
      )}
      {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}

function StatCard({ icon, title, value, growth }: { icon: React.ReactNode; title: string; value: string; growth?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 uppercase tracking-wide truncate">{title}</div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        {growth !== undefined && <GrowthIndicator value={growth} />}
      </div>
    </div>
  );
}

function RevenueBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-semibold text-gray-900">€{value.toFixed(0)} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={'h-full ' + color + ' transition-all'} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

export default function ExecutiveDashboardV3() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/executive?period=' + period);
      const json = await res.json();
      if (json.ok) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) {
    return <div className="p-8 text-center text-gray-500">Loading…</div>;
  }

  const k = data.current;
  const g = data.growth;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Executive Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Top-level business KPIs and growth</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={'px-4 py-1.5 rounded-md text-sm font-medium transition ' + (period === p ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900')}
            >
              {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <HeroCard title="GMV" value={formatCurrency(k.gmv)} growth={g.gmv} icon={<DollarSign className="w-5 h-5" />} color="from-emerald-500 to-emerald-600" />
        <HeroCard title="Net Revenue" value={formatCurrency(k.net_revenue)} growth={g.net_revenue} icon={<BarChart3 className="w-5 h-5" />} color="from-blue-500 to-blue-600" />
        <HeroCard title="Gross Profit" value={formatCurrency(k.gross_profit)} growth={g.gross_profit} icon={<Award className="w-5 h-5" />} color="from-purple-500 to-purple-600" />
        <HeroCard title="Profit Margin" value={formatPct(k.profit_margin)} growth={g.profit_margin} icon={<Activity className="w-5 h-5" />} color="from-brand-red-500 to-brand-red-600" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <MetricCard title="Orders" value={k.completed_orders.toLocaleString()} growth={g.completed_orders} subtitle={k.total_orders + ' total'} />
        <MetricCard title="AOV" value={formatCurrency(k.average_order_value)} growth={g.average_order_value} />
        <MetricCard title="Orders/hour" value={k.orders_per_hour.toFixed(1)} growth={g.orders_per_hour} />
        <MetricCard title="Orders/day" value={String(Math.round(k.orders_per_day))} growth={g.orders_per_day} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={<Users className="w-4 h-4" />} title="Active Customers" value={k.active_customers.toLocaleString()} growth={g.active_customers} />
        <StatCard icon={<Award className="w-4 h-4" />} title="New Customers" value={k.new_customers.toLocaleString()} growth={g.new_customers} />
        <StatCard icon={<Truck className="w-4 h-4" />} title="Active Drivers" value={k.active_drivers.toLocaleString()} />
        <StatCard icon={<Store className="w-4 h-4" />} title="Active Restaurants" value={k.active_restaurants.toLocaleString()} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Breakdown</h2>
        <div className="space-y-3">
          <RevenueBar label="Commission Revenue" value={k.commission_revenue} total={k.gross_revenue} color="bg-blue-500" />
          <RevenueBar label="Delivery Fees" value={k.delivery_fee_revenue} total={k.gross_revenue} color="bg-emerald-500" />
          <RevenueBar label="Processing Costs" value={k.payment_processing_fees} total={k.gross_revenue} color="bg-red-400" />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-900">Net Revenue</span>
          <span className="font-bold text-emerald-600">{formatCurrency(k.net_revenue)}</span>
        </div>
      </div>
    </div>
  );
}
