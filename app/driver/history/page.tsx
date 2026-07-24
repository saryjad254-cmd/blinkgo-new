'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  X,
  Download,
  Calendar,
  MapPin,
  Store,
  CheckCircle2,
  Package,
  Truck,
  ChefHat,
  XCircle,
  Home,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { formatEUR, formatDateDE } from '@/lib/format';
import { cn } from '@/lib/cn';

type DateRange = 'all' | 'today' | 'week' | 'month' | 'quarter';
type StatusFilter = 'all' | 'delivered' | 'cancelled' | 'picked_up' | 'ready';

interface HistoryItem {
  id: string;
  order_number: string;
  status: string;
  total: number;
  tip: number;
  delivery_fee: number;
  created_at: string;
  delivered_at?: string;
  restaurants?: { name?: string; id?: string };
  customer_id?: string;
}

/**
 * Driver Order History
 * ────────────────────
 * Filterable list of past orders with date / status / restaurant / search
 * filters and CSV export.
 */
export default function DriverHistoryPage() {
  const { t, locale } = useI18n();
  const isRtl = locale === 'ar';

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [restaurantFilter, setRestaurantFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load history
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/driver/history', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        if (cancelled) return;
        setItems(data?.orders ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Date range filter
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart); monthStart.setDate(monthStart.getDate() - 30);
  const quarterStart = new Date(todayStart); quarterStart.setDate(quarterStart.getDate() - 90);

  // Unique restaurants for the filter
  const restaurants = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      if (i.restaurants?.id && i.restaurants?.name) {
        map.set(i.restaurants.id, i.restaurants.name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      // Search
      if (q) {
        const haystack = `${it.order_number} ${it.restaurants?.name ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Status
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      // Restaurant
      if (restaurantFilter !== 'all' && it.restaurants?.id !== restaurantFilter) return false;
      // Date
      const ts = it.delivered_at || it.created_at;
      const d = new Date(ts);
      if (dateRange === 'today' && d < todayStart) return false;
      if (dateRange === 'week' && d < weekStart) return false;
      if (dateRange === 'month' && d < monthStart) return false;
      if (dateRange === 'quarter' && d < quarterStart) return false;
      return true;
    });
  }, [items, search, statusFilter, restaurantFilter, dateRange]);

  // Summary stats for filtered
  const stats = useMemo(() => {
    let totalEarnings = 0;
    let totalTip = 0;
    let count = 0;
    for (const it of filtered) {
      totalEarnings += Number(it.delivery_fee ?? 0) * 0.8 + Number(it.tip ?? 0);
      totalTip += Number(it.tip ?? 0);
      count += 1;
    }
    return { totalEarnings, totalTip, count };
  }, [filtered]);

  // Export to CSV
  const exportCSV = () => {
    const headers = ['Order #', 'Status', 'Restaurant', 'Total', 'Tip', 'Date'];
    const rows = filtered.map((it) => [
      it.order_number,
      it.status,
      it.restaurants?.name ?? '',
      (Number(it.delivery_fee ?? 0) * 0.8 + Number(it.tip ?? 0)).toFixed(2),
      Number(it.tip ?? 0).toFixed(2),
      new Date(it.delivered_at || it.created_at).toISOString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtersActive = search || dateRange !== 'all' || statusFilter !== 'all' || restaurantFilter !== 'all';

  return (
    <div className="min-h-screen bg-bg pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="sticky top-0 z-sticky bg-bg-elevated/95 backdrop-blur-xl border-b border-edge">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/driver/dashboard"
            className="w-12 h-12 rounded-full bg-ink-700 text-text-secondary flex items-center justify-center touch-manipulation active:scale-95"
            aria-label="Back"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold text-white truncate">
              {locale === 'ar' ? 'السجل' : locale === 'en' ? 'History' : 'Verlauf'}
            </h1>
            <p className="text-xs text-text-muted truncate">
              {filtered.length} {locale === 'ar' ? 'طلب' : locale === 'en' ? 'orders' : 'Bestellungen'}
              {filtersActive && (
                <span className="ms-2 text-brand-500">
                  · {locale === 'ar' ? 'تمت التصفية' : locale === 'en' ? 'filtered' : 'gefiltert'}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="h-10 px-3 rounded-pill bg-ink-700 text-text-secondary hover:text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 touch-manipulation"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={locale === 'ar' ? 'ابحث برقم الطلب أو المطعم' : locale === 'en' ? 'Search order # or restaurant' : 'Bestellnr. oder Restaurant suchen'}
            className="w-full h-12 ps-10 pe-10 rounded-pill bg-ink-700 border border-edge text-white placeholder:text-text-muted text-sm focus:border-brand-500 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute top-1/2 -translate-y-1/2 end-3 w-8 h-8 rounded-full text-text-muted hover:text-white hover:bg-ink-600 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Date range chips */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider px-2 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {locale === 'ar' ? 'الفترة' : locale === 'en' ? 'Date range' : 'Zeitraum'}
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {([
              ['all', locale === 'ar' ? 'الكل' : locale === 'en' ? 'All' : 'Alle'],
              ['today', locale === 'ar' ? 'اليوم' : locale === 'en' ? 'Today' : 'Heute'],
              ['week', locale === 'ar' ? 'الأسبوع' : locale === 'en' ? 'This week' : 'Diese Woche'],
              ['month', locale === 'ar' ? 'الشهر' : locale === 'en' ? 'This month' : 'Monat'],
              ['quarter', locale === 'ar' ? 'ربع سنة' : locale === 'en' ? 'Quarter' : 'Quartal'],
            ] as [DateRange, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setDateRange(k)}
                className={cn(
                  'h-9 px-3.5 rounded-pill text-xs font-extrabold whitespace-nowrap transition-all touch-manipulation flex-shrink-0',
                  dateRange === k
                    ? 'bg-brand-gradient text-white shadow-glow'
                    : 'bg-ink-700 border border-edge text-text-secondary hover:text-white'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Status chips */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider px-2 flex items-center gap-1.5">
            <Filter className="w-3 h-3" />
            {locale === 'ar' ? 'الحالة' : locale === 'en' ? 'Status' : 'Status'}
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {([
              ['all', locale === 'ar' ? 'الكل' : locale === 'en' ? 'All' : 'Alle'],
              ['delivered', locale === 'ar' ? 'تم التوصيل' : locale === 'en' ? 'Delivered' : 'Zugestellt'],
              ['picked_up', locale === 'ar' ? 'تم الاستلام' : locale === 'en' ? 'Picked up' : 'Abgeholt'],
              ['ready', locale === 'ar' ? 'جاهز' : locale === 'en' ? 'Ready' : 'Bereit'],
              ['cancelled', locale === 'ar' ? 'ملغى' : locale === 'en' ? 'Cancelled' : 'Storniert'],
            ] as [StatusFilter, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatusFilter(k)}
                className={cn(
                  'h-9 px-3.5 rounded-pill text-xs font-extrabold whitespace-nowrap transition-all touch-manipulation flex-shrink-0',
                  statusFilter === k
                    ? 'bg-brand-gradient text-white shadow-glow'
                    : 'bg-ink-700 border border-edge text-text-secondary hover:text-white'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Restaurant filter (only show if there are restaurants) */}
        {restaurants.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider px-2 flex items-center gap-1.5">
              <Store className="w-3 h-3" />
              {locale === 'ar' ? 'المطعم' : locale === 'en' ? 'Restaurant' : 'Restaurant'}
            </p>
            <select
              value={restaurantFilter}
              onChange={(e) => setRestaurantFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-pill bg-ink-700 border border-edge text-white text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="all">{locale === 'ar' ? 'كل المطاعم' : locale === 'en' ? 'All restaurants' : 'Alle Restaurants'}</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Summary card */}
        {filtered.length > 0 && (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-700/5 border border-emerald-500/30 p-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">
                {locale === 'ar' ? 'الإجمالي' : locale === 'en' ? 'Total' : 'Gesamt'}
              </p>
              <p className="text-lg sm:text-xl font-black text-white tabular-nums">{formatEUR(stats.totalEarnings)}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">
                {locale === 'ar' ? 'البقشيش' : locale === 'en' ? 'Tip' : 'Trinkgeld'}
              </p>
              <p className="text-lg sm:text-xl font-black text-emerald-400 tabular-nums">{formatEUR(stats.totalTip)}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">
                {locale === 'ar' ? 'الطلبات' : locale === 'en' ? 'Orders' : 'Bestellungen'}
              </p>
              <p className="text-lg sm:text-xl font-black text-cyan-400 tabular-nums">{stats.count}</p>
            </div>
          </div>
        )}

        {/* Reset filters */}
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setDateRange('all');
              setStatusFilter('all');
              setRestaurantFilter('all');
            }}
            className="w-full h-11 rounded-pill bg-ink-700 border border-edge text-text-secondary hover:text-white text-sm font-bold flex items-center justify-center gap-1.5 touch-manipulation"
          >
            <X className="w-4 h-4" />
            {locale === 'ar' ? 'مسح الفلاتر' : locale === 'en' ? 'Clear filters' : 'Filter zurücksetzen'}
          </button>
        )}

        {/* List */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 text-text-muted">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-ink-700 mx-auto mb-3 flex items-center justify-center text-text-muted">
                <Search className="w-7 h-7" />
              </div>
              <p className="text-sm font-extrabold text-white">
                {locale === 'ar' ? 'لا توجد طلبات' : locale === 'en' ? 'No orders found' : 'Keine Bestellungen gefunden'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {locale === 'ar' ? 'حاول تغيير الفلاتر' : locale === 'en' ? 'Try changing the filters' : 'Versuche, die Filter zu ändern'}
              </p>
            </div>
          ) : (
            filtered.map((it) => {
              const ts = it.delivered_at || it.created_at;
              const earning = Number(it.delivery_fee ?? 0) * 0.8 + Number(it.tip ?? 0);
              const expanded = expandedId === it.id;
              return (
                <article
                  key={it.id}
                  className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : it.id)}
                    className="w-full p-4 flex items-center gap-3 touch-manipulation active:bg-ink-700/30 transition-colors text-start"
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      it.status === 'delivered' ? 'bg-emerald-500/15 text-emerald-400' :
                      it.status === 'cancelled' ? 'bg-red-500/15 text-red-400' :
                      'bg-brand-yellow-500/15 text-brand-yellow-400'
                    )}>
                      {it.status === 'delivered' ? <CheckCircle2 className="w-5 h-5" /> :
                       it.status === 'cancelled' ? <XCircle className="w-5 h-5" /> :
                       it.status === 'picked_up' ? <Truck className="w-5 h-5" /> :
                       <Package className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-white truncate">
                        {it.restaurants?.name || (locale === 'ar' ? 'مطعم' : 'Restaurant')}
                      </p>
                      <p className="text-xs text-text-muted">
                        #{it.order_number} · {new Date(ts).toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-extrabold text-white tabular-nums">{formatEUR(earning)}</p>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted rtl:rotate-180" />}
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-edge space-y-2 text-xs text-text-secondary">
                      <div className="flex justify-between">
                        <span>{locale === 'ar' ? 'الإجمالي' : locale === 'de' ? 'Gesamt' : 'Total'}</span>
                        <span className="font-bold text-white">{formatEUR(Number(it.total))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{locale === 'ar' ? 'البقشيش' : locale === 'de' ? 'Trinkgeld' : 'Tip'}</span>
                        <span className="font-bold text-emerald-400">{formatEUR(Number(it.tip ?? 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{locale === 'ar' ? 'التاريخ' : locale === 'de' ? 'Datum' : 'Date'}</span>
                        <span className="font-bold text-white">{new Date(ts).toLocaleString(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US')}</span>
                      </div>
                      <Link
                        href={`/driver/orders/${it.id}`}
                        className="block w-full h-10 rounded-xl bg-ink-700 hover:bg-ink-600 text-white font-bold text-center text-sm flex items-center justify-center touch-manipulation mt-2"
                      >
                        {locale === 'ar' ? 'عرض التفاصيل' : locale === 'en' ? 'View details' : 'Details anzeigen'}
                      </Link>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
