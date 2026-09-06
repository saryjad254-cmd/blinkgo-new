'use client';

import { useState, useEffect } from 'react';
import Search from 'lucide-react/dist/esm/icons/search';
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import MousePointerClick from 'lucide-react/dist/esm/icons/mouse-pointer-click';
import ShoppingCart from 'lucide-react/dist/esm/icons/shopping-cart';
import Store from 'lucide-react/dist/esm/icons/store';
import UtensilsCrossed from 'lucide-react/dist/esm/icons/utensils-crossed';
import { cn } from '@/lib/cn';

const T = {
  de: {
    search: 'Suche',
    totalSearches: 'Suchen gesamt',
    zeroResults: 'Null-Treffer',
    clickThrough: 'Klickrate',
    conversion: 'Conversion',
    uniqueQueries: 'Eindeutige Queries',
    topQueries: 'Top Suchanfragen',
    zeroResultQueries: 'Suchanfragen ohne Treffer',
    popularRestaurants: 'Beliebte Restaurants',
    popularProducts: 'Beliebte Produkte',
    refresh: 'Aktualisieren',
    noData: 'Keine Daten',
    times: '×',
    backend: 'Persistiert in Datenbank',
  },
  ar: {
    search: 'البحث',
    totalSearches: 'إجمالي عمليات البحث',
    zeroResults: 'بدون نتائج',
    clickThrough: 'معدل النقر',
    conversion: 'التحويل',
    uniqueQueries: 'الاستعلامات الفريدة',
    topQueries: 'أهم الاستعلامات',
    zeroResultQueries: 'الاستعلامات بدون نتائج',
    popularRestaurants: 'المطاعم الشائعة',
    popularProducts: 'المنتجات الشائعة',
    refresh: 'تحديث',
    noData: 'لا توجد بيانات',
    times: '×',
    backend: 'محفوظ في قاعدة البيانات',
  },
  en: {
    search: 'Search',
    totalSearches: 'Total searches',
    zeroResults: 'Zero results',
    clickThrough: 'Click-through rate',
    conversion: 'Conversion',
    uniqueQueries: 'Unique queries',
    topQueries: 'Top queries',
    zeroResultQueries: 'Zero-result queries',
    popularRestaurants: 'Popular restaurants',
    popularProducts: 'Popular products',
    refresh: 'Refresh',
    noData: 'No data',
    times: '×',
    backend: 'Persisted in database',
  },
};

interface Stats {
  totalSearches: number;
  totalZeroResults: number;
  totalClicks: number;
  totalConversions: number;
  zeroResultRate: number;
  clickThroughRate: number;
  conversionRate: number;
  uniqueQueries: number;
  totalEvents?: number;
}

interface InitialData {
  stats: Stats;
  popularQueries: { queries: Array<{ query: string; count: number; last_seen: string }> };
  popularRestaurants: { restaurants: Array<{ id: string; count: number; last_seen: string }> };
  popularProducts: { products: Array<{ id: string; count: number; last_seen: string }> };
  zeroResultQueries: { queries: Array<{ query: string; count: number; last_seen: string }> };
}

interface Props {
  initial: InitialData;
  user: { id: string; email: string | null; role: string; name?: string | null | undefined; isActive?: boolean | undefined; isVerified?: boolean | undefined };
  locale: 'de' | 'ar' | 'en';
}

export function SearchAnalyticsClient({ initial, locale }: Props) {
  const t = T[locale] || T.de;
  const [stats, setStats] = useState<Stats>(initial.stats || {} as Stats);
  const [queries, setQueries] = useState(initial.popularQueries?.queries || []);
  const [zeroQ, setZeroQ] = useState(initial.zeroResultQueries?.queries || []);
  const [restaurants, setRestaurants] = useState(initial.popularRestaurants?.restaurants || []);
  const [products, setProducts] = useState(initial.popularProducts?.products || []);
  const [loading, setLoading] = useState(false);
  const timeLocale = locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE';
  const formatRefreshTime = (date: Date) => date.toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const [lastRefreshed, setLastRefreshed] = useState<string>('—');

  async function refresh() {
    setLoading(true);
    try {
      const [stats, popularQueries, popularRestaurants, popularProducts, zeroResultQueries] = await Promise.all([
        fetch('/api/search/analytics?type=stats').then((r) => r.json()),
        fetch('/api/search/analytics?type=popular-queries').then((r) => r.json()),
        fetch('/api/search/analytics?type=popular-restaurants').then((r) => r.json()),
        fetch('/api/search/analytics?type=popular-products').then((r) => r.json()),
        fetch('/api/search/analytics?type=zero-result-queries').then((r) => r.json()),
      ]);
      setStats(stats || {});
      setQueries(popularQueries?.queries || []);
      setZeroQ(zeroResultQueries?.queries || []);
      setRestaurants(popularRestaurants?.restaurants || []);
      setProducts(popularProducts?.products || []);
      setLastRefreshed(formatRefreshTime(new Date()));
    } catch (e) {
      console.error('Failed to refresh analytics', e);
    }
    setLoading(false);
  }

  // Auto-refresh every 60s
  useEffect(() => {
    const firstPaint = window.setTimeout(() => setLastRefreshed(formatRefreshTime(new Date())), 0);
    const id = setInterval(refresh, 60_000);
    return () => { window.clearTimeout(firstPaint); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <Search className="w-4 h-4" />
          <span className="font-mono">{t.backend}</span>
          <span>·</span>
          <span>Last refresh: {lastRefreshed}</span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-bg-elevated border border-edge hover:border-brand-primary text-text-primary text-sm font-medium disabled:opacity-50"
        >
          {t.refresh}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={<Search className="w-5 h-5" />} label={t.totalSearches} value={stats.totalSearches ?? 0} color="text-brand-primary" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label={t.uniqueQueries} value={stats.uniqueQueries ?? 0} color="text-emerald-500" />
        <StatCard icon={<AlertCircle className="w-5 h-5" />} label={t.zeroResults} value={pct(stats.zeroResultRate ?? 0)} sub={`${stats.totalZeroResults ?? 0}`} color="text-amber-500" />
        <StatCard icon={<MousePointerClick className="w-5 h-5" />} label={t.clickThrough} value={pct(stats.clickThroughRate ?? 0)} sub={`${stats.totalClicks ?? 0}`} color="text-blue-500" />
        <StatCard icon={<ShoppingCart className="w-5 h-5" />} label={t.conversion} value={pct(stats.conversionRate ?? 0)} sub={`${stats.totalConversions ?? 0}`} color="text-purple-500" />
        <StatCard icon={<Store className="w-5 h-5" />} label="Events" value={stats.totalEvents ?? 0} color="text-cyan-500" />
      </div>

      {/* Top queries + zero-result queries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ListCard title={t.topQueries} entries={queries.map((q) => ({ key: q.query, value: q.count, sub: q.query }))} t={t} />
        <ListCard title={t.zeroResultQueries} entries={zeroQ.map((q) => ({ key: q.query, value: q.count, sub: q.query }))} t={t} />
      </div>

      {/* Popular restaurants + products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ListCard title={t.popularRestaurants} entries={restaurants.map((r) => ({ key: r.id, value: r.count, sub: r.id }))} icon={<Store className="w-4 h-4" />} t={t} />
        <ListCard title={t.popularProducts} entries={products.map((p) => ({ key: p.id, value: p.count, sub: p.id }))} icon={<UtensilsCrossed className="w-4 h-4" />} t={t} />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="card-glass p-4">
      <div className={cn('flex items-center gap-2 mb-1', color)}>
        {icon}
        <span className="text-xs text-text-muted font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      {sub ? <div className="text-xs text-text-muted mt-0.5">{sub}</div> : null}
    </div>
  );
}

function ListCard({ title, entries, icon, t }: { title: string; entries: Array<{ key: string; value: number; sub: string }>; icon?: React.ReactNode; t: { times: string; noData: string } }) {
  return (
    <div className="card-glass p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-6">{t.noData}</p>
      ) : (
        <ul className="space-y-2">
          {entries.slice(0, 10).map((e) => (
            <li key={e.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-text-primary flex-1" dir="auto">{e.sub}</span>
              <span className="text-text-muted font-mono shrink-0">
                {e.value}
                <span className="text-xs ml-1">{t.times}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
