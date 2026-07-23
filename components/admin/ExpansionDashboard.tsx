'use client';

import { useState, useMemo } from 'react';
import { MapPin, Download, Search, Filter, ChevronDown, Mail, Phone, Calendar, User, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ExpansionRequest {
  id: string;
  address: string;
  city: string;
  postal_code?: string | null;
  lat: number;
  lng: number;
  distance_km?: number | null;
  email?: string | null;
  name?: string | null;
  notes?: string | null;
  status: 'pending' | 'reviewing' | 'planned' | 'declined';
  created_at: string;
  updated_at: string;
}

interface ExpansionDashboardProps {
  requests: ExpansionRequest[];
  loadError: string | null;
}

const COPY = {
  de: {
    title: 'Expansions-Anfragen',
    subtitle: 'Adressen außerhalb der Lieferzone — Priorisierung für die Expansion',
    stats: 'Statistik',
    total: 'Gesamt',
    pending: 'Offen',
    reviewing: 'In Prüfung',
    planned: 'Geplant',
    declined: 'Abgelehnt',
    cities: 'Städte',
    avgDistance: 'Ø Entfernung',
    search: 'Suche nach Adresse, Stadt, PLZ…',
    filterAll: 'Alle',
    filterPending: 'Offen',
    filterReviewing: 'In Prüfung',
    filterPlanned: 'Geplant',
    filterDeclined: 'Abgelehnt',
    export: 'CSV exportieren',
    noData: 'Keine Anfragen',
    noDataDesc: 'Wenn Benutzer außerhalb der Zone bestellen möchten, werden ihre Anfragen hier gespeichert.',
    requestedAt: 'Angefragt am',
    distance: 'Entfernung',
    setStatus: 'Status ändern',
    loading: 'Lädt…',
  },
  ar: {
    title: 'طلبات التوسع',
    subtitle: 'العناوين خارج منطقة التوصيل — تحديد الأولويات للتوسع',
    stats: 'الإحصائيات',
    total: 'المجموع',
    pending: 'قيد الانتظار',
    reviewing: 'قيد المراجعة',
    planned: 'مخطط',
    declined: 'مرفوض',
    cities: 'المدن',
    avgDistance: 'متوسط المسافة',
    search: 'البحث عن عنوان أو مدينة أو رمز بريدي…',
    filterAll: 'الكل',
    filterPending: 'قيد الانتظار',
    filterReviewing: 'قيد المراجعة',
    filterPlanned: 'مخطط',
    filterDeclined: 'مرفوض',
    export: 'تصدير CSV',
    noData: 'لا توجد طلبات',
    noDataDesc: 'عندما يريد المستخدمون خارج المنطقة الطلب، ستُحفظ طلباتهم هنا.',
    requestedAt: 'تاريخ الطلب',
    distance: 'المسافة',
    setStatus: 'تغيير الحالة',
    loading: 'جاري التحميل…',
  },
  en: {
    title: 'Expansion requests',
    subtitle: 'Addresses outside the delivery zone — prioritise for expansion',
    stats: 'Statistics',
    total: 'Total',
    pending: 'Pending',
    reviewing: 'Reviewing',
    planned: 'Planned',
    declined: 'Declined',
    cities: 'Cities',
    avgDistance: 'Avg distance',
    search: 'Search by address, city, postal code…',
    filterAll: 'All',
    filterPending: 'Pending',
    filterReviewing: 'Reviewing',
    filterPlanned: 'Planned',
    filterDeclined: 'Declined',
    export: 'Export CSV',
    noData: 'No requests',
    noDataDesc: 'When users outside the zone try to order, their requests are saved here.',
    requestedAt: 'Requested at',
    distance: 'Distance',
    setStatus: 'Set status',
    loading: 'Loading…',
  },
};

function getLocaleFromCookie(): 'de' | 'ar' | 'en' {
  if (typeof document === 'undefined') return 'de';
  const m = document.cookie.split(';').find((c) => c.trim().startsWith('blinkgo-locale='));
  const v = m?.split('=')[1]?.trim();
  return (v === 'ar' || v === 'en') ? v : 'de';
}

function formatDate(iso: string, locale: 'de' | 'ar' | 'en'): string {
  return new Date(iso).toLocaleDateString(
    locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US',
    { day: '2-digit', month: 'short', year: 'numeric' },
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/15 text-warning border-warning/30',
  reviewing: 'bg-info/15 text-info border-info/30',
  planned: 'bg-brand-yellow-500/15 text-brand-yellow-500 border-brand-yellow-500/30',
  declined: 'bg-danger/15 text-danger border-danger/30',
};

export function ExpansionDashboard({ requests, loadError }: ExpansionDashboardProps) {
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // SSR safe: only read cookie after mount
  useMemo(() => {
    if (typeof window !== 'undefined') setLocale(getLocaleFromCookie());
  }, []);

  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  // Compute stats
  const stats = useMemo(() => {
    const byStatus: Record<string, number> = { pending: 0, reviewing: 0, planned: 0, declined: 0 };
    const cityMap = new Map<string, number>();
    let totalDist = 0;
    let distCount = 0;
    for (const r of requests) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      const c = r.city || 'Unknown';
      cityMap.set(c, (cityMap.get(c) || 0) + 1);
      if (r.distance_km != null) {
        totalDist += r.distance_km;
        distCount++;
      }
    }
    const topCities = Array.from(cityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { byStatus, topCities, avgDistance: distCount > 0 ? totalDist / distCount : 0 };
  }, [requests]);

  // Filter + search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.address?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q) ||
        r.postal_code?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.name?.toLowerCase().includes(q)
      );
    });
  }, [requests, filter, search]);

  // CSV export
  function exportCSV() {
    const rows = [
      ['id', 'address', 'city', 'postal_code', 'lat', 'lng', 'distance_km', 'email', 'name', 'status', 'created_at'],
      ...requests.map((r) => [
        r.id, r.address, r.city, r.postal_code || '',
        r.lat, r.lng, r.distance_km ?? '',
        r.email || '', r.name || '', r.status, r.created_at,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expansion-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div dir={dir} className="relative p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-text mb-1">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 flex items-start gap-2">
          <Mail className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-warning">{loadError}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: t.total, value: requests.length, accent: 'from-brand-red-500/20 to-brand-red-500/0', color: 'text-brand-red-500' },
          { label: t.pending, value: stats.byStatus.pending || 0, accent: 'from-warning/20 to-warning/0', color: 'text-warning' },
          { label: t.reviewing, value: stats.byStatus.reviewing || 0, accent: 'from-info/20 to-info/0', color: 'text-info' },
          { label: t.planned, value: stats.byStatus.planned || 0, accent: 'from-brand-yellow-500/20 to-brand-yellow-500/0', color: 'text-brand-yellow-500' },
          { label: t.cities, value: stats.topCities.length, accent: 'from-purple-500/20 to-purple-500/0', color: 'text-purple-400' },
          { label: t.avgDistance, value: stats.avgDistance ? `${stats.avgDistance.toFixed(1)} km` : '—', accent: 'from-cyan-500/20 to-cyan-500/0', color: 'text-cyan-400' },
        ].map((s, i) => (
          <div key={i} className="relative card-glass p-4 overflow-hidden">
            <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', s.accent)} />
            <div className="relative">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted mb-1">{s.label}</p>
              <p className={cn('text-2xl font-black tabular-nums', s.color)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + search + export */}
      <div className="card-glass p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.search}
            style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
            className="w-full ps-10 pe-3 py-2.5 rounded-xl bg-bg-elevated/60 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { key: 'all', label: t.filterAll },
            { key: 'pending', label: t.filterPending },
            { key: 'reviewing', label: t.filterReviewing },
            { key: 'planned', label: t.filterPlanned },
            { key: 'declined', label: t.filterDeclined },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex-shrink-0',
                filter === f.key
                  ? 'bg-gradient-to-r from-brand-red-500/15 to-brand-yellow-500/10 text-brand border border-brand-red-500/30'
                  : 'bg-bg-elevated/40 text-text-secondary hover:text-text border border-edge hover:border-edge-strong'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={exportCSV}
          className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white text-xs font-extrabold shadow-glow active:scale-95 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          {t.export}
        </button>
      </div>

      {/* Top cities (mini map / leaderboard) */}
      {stats.topCities.length > 0 && (
        <div className="card-glass p-4 sm:p-5">
          <h2 className="text-sm font-extrabold text-text mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand-red-500" />
            {t.cities}
          </h2>
          <div className="space-y-2">
            {stats.topCities.map(([city, count]) => {
              const max = stats.topCities[0][1] || 1;
              return (
                <div key={city} className="flex items-center gap-3">
                  <span className="w-32 sm:w-40 text-sm font-bold text-text-secondary truncate">{city}</span>
                  <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-red-500 to-brand-yellow-500 rounded-full"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-end text-sm font-black text-text tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card-glass p-10 sm:p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-bg-elevated border border-edge flex items-center justify-center mb-4">
            <MapPin className="w-8 h-8 text-text-muted" />
          </div>
          <h3 className="text-lg font-extrabold text-text mb-1">{t.noData}</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto">{t.noDataDesc}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <div key={r.id} className="card-glass p-4 hover:border-edge-strong transition-all">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-edge flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-brand-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-extrabold text-text truncate">{r.address}</p>
                    <span className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border',
                      STATUS_COLORS[r.status] || STATUS_COLORS.pending
                    )}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {r.postal_code} {r.city}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {r.distance_km != null && <span>📍 {r.distance_km.toFixed(1)} km</span>}
                    <span>🕐 {formatDate(r.created_at, locale)}</span>
                    {r.email && <span className="truncate max-w-[120px]">✉️ {r.email}</span>}
                  </div>
                  {r.notes && (
                    <p className="mt-2 text-xs text-text-muted italic line-clamp-2">"{r.notes}"</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
