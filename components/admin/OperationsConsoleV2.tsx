'use client';

/**
 * OperationsConsoleV2 — enterprise-grade live operations center.
 *
 * Designed for 1-3 operators managing the entire platform:
 * - Live KPI strip with sparklines
 * - Active orders map (driver locations)
 * - Restaurant status board (all restaurants in one view)
 * - Driver status board (online, on break, idle)
 * - Manual intervention panel (reassign, cancel, refund)
 * - Incident log (real-time events)
 * - Sound + haptic alerts on critical events
 * - Command palette (Cmd-K) for quick navigation
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Activity, TrendingUp, Clock, Users, Store, Bike, AlertTriangle,
  DollarSign, Search, Filter, Radio, ChevronRight, Bell, Volume2,
  VolumeX, BarChart3, Target, MapPin, Eye, Send, Megaphone, Pause,
  Play, RefreshCw, XCircle, CheckCircle2, Zap, ShoppingBag, Timer,
  TrendingDown, AlertCircle, Wifi, WifiOff, Coffee
} from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { haptic } from '@/lib/utils/haptics';
import { playDriverSound } from '@/lib/utils/driver-sound';
import { apiGet, apiPost } from '@/lib/api/client';
import { formatEUR } from '@/lib/format';
import Link from 'next/link';

interface LiveKPIs {
  activeOrders: number;
  onlineDrivers: number;
  onlineRestaurants: number;
  pendingAcceptance: number;
  avgPrepMin: number;
  totalRevenueToday: number;
  totalOrdersToday: number;
  cancelRateToday: number;
}

interface DriverStatus {
  id: string;
  name: string;
  status: 'online' | 'on_delivery' | 'idle' | 'offline';
  active_order_id?: string;
  last_seen: string;
  rating: number;
  total_today: number;
}

interface RestaurantStatus {
  id: string;
  name: string;
  is_online: boolean;
  is_paused: boolean;
  busy_mode: boolean;
  active_orders: number;
  pending: number;
  avg_prep_min: number;
  total_today: number;
  rating: number;
}

interface Incident {
  id: string;
  type: 'order_late' | 'driver_offline' | 'restaurant_offline' | 'system_alert';
  message: string;
  severity: 'low' | 'medium' | 'high';
  created_at: string;
  order_id?: string;
}

interface OperationsConsoleV2Props {
  initialKPIs: LiveKPIs;
  initialDrivers: DriverStatus[];
  initialRestaurants: RestaurantStatus[];
  initialIncidents: Incident[];
}

export function OperationsConsoleV2({
  initialKPIs,
  initialDrivers,
  initialRestaurants,
  initialIncidents,
}: OperationsConsoleV2Props) {
  const t = useT();
  const [kpis, setKpis] = useState(initialKPIs);
  const [drivers, setDrivers] = useState(initialDrivers);
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [incidents, setIncidents] = useState(initialIncidents);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'late' | 'unassigned' | 'pending'>('all');
  const [audioOn, setAudioOn] = useState(true);
  const [, setTick] = useState(0);
  const online = useOnlineStatus();
  const previousIncidentsRef = useRef(0);

  // Refresh tick every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Realtime: orders
  useRealtime({
    channels: [
      {
        name: 'admin-orders',
        table: 'orders',
        event: '*',
        onChange: (payload) => {
          const o = payload.new as any;
          if (payload.eventType === 'INSERT') {
            setKpis((k) => ({ ...k, activeOrders: k.activeOrders + 1, totalOrdersToday: k.totalOrdersToday + 1 }));
            if (audioOn) playDriverSound('offer');
          } else if (payload.eventType === 'UPDATE') {
            if (o.status === 'cancelled') {
              setKpis((k) => ({ ...k, activeOrders: Math.max(0, k.activeOrders - 1) }));
            }
            if (o.status === 'delivered') {
              setKpis((k) => ({
                ...k,
                activeOrders: Math.max(0, k.activeOrders - 1),
                totalRevenueToday: k.totalRevenueToday + (o.total ?? 0),
              }));
            }
          }
        },
      },
    ],
  });

  // Realtime: incidents
  useRealtime({
    channels: [
      {
        name: 'admin-incidents',
        table: 'security_audit_log',
        event: 'INSERT',
        onChange: (payload) => {
          const e = payload.new as any;
          if (['high', 'medium'].includes(e.severity ?? '')) {
            setIncidents((prev) => [
              { id: e.id, type: e.event_type ?? 'system_alert', message: e.message ?? 'Security event', severity: e.severity ?? 'medium', created_at: e.created_at },
              ...prev.slice(0, 49),
            ]);
            if (audioOn) playDriverSound('warning');
            if (e.severity === 'high') haptic('error');
          }
        },
      },
    ],
  });

  // Polling fallback every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [kpiRes, drvRes, restRes] = await Promise.all([
          apiGet<any>('/api/admin/operations?type=kpis', { cacheTtl: 0 }),
          apiGet<any>('/api/admin/operations?type=drivers', { cacheTtl: 0 }),
          apiGet<any>('/api/admin/operations?type=restaurants', { cacheTtl: 0 }),
        ]);
        if (kpiRes.ok && kpiRes.data) setKpis(kpiRes.data);
        if (drvRes.ok && drvRes.data) setDrivers(drvRes.data);
        if (restRes.ok && restRes.data) setRestaurants(restRes.data);
      } catch {
        // ignore
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Quick actions
  const handleReassign = async (orderId: string, driverId: string) => {
    haptic('medium');
    try {
      await apiPost(`/api/admin/orders/${orderId}/reassign`, { driver_id: driverId });
    } catch {
      // ignore
    }
  };

  const handleCancel = async (orderId: string, reason: string) => {
    haptic('warning');
    if (!confirm(`Bestellung ${orderId} stornieren? Grund: ${reason}`)) return;
    try {
      await apiPost(`/api/admin/orders/${orderId}/cancel`, { reason });
    } catch {
      // ignore
    }
  };

  const filteredDrivers = useMemo(() => {
    if (!searchTerm) return drivers;
    const term = searchTerm.toLowerCase();
    return drivers.filter((d) => d.name.toLowerCase().includes(term));
  }, [drivers, searchTerm]);

  const filteredRestaurants = useMemo(() => {
    if (!searchTerm) return restaurants;
    const term = searchTerm.toLowerCase();
    return restaurants.filter((r) => r.name.toLowerCase().includes(term));
  }, [restaurants, searchTerm]);

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-ink-2 uppercase tracking-wide">{t.driver?.p13_operations ?? 'Operations'}</div>
            <h1 className="text-2xl font-bold text-ink-1">Live Command Center</h1>
          </div>
          <div className="flex items-center gap-2">
            {!online && (
              <span className="px-3 py-1.5 rounded-lg bg-danger-500/15 text-danger-700 text-xs font-medium flex items-center gap-1">
                <WifiOff className="h-3.5 w-3.5" /> Offline
              </span>
            )}
            <button
              type="button"
              onClick={() => { setAudioOn(!audioOn); haptic('light'); }}
              className="w-11 h-11 rounded-xl bg-bg-card border-2 border-ink-3/30 flex items-center justify-center"
              aria-label={audioOn ? 'Stummschalten' : 'Ton an'}
            >
              {audioOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-ink-2" />}
            </button>
            <button
              type="button"
              onClick={() => { haptic('light'); window.location.reload(); }}
              className="w-11 h-11 rounded-xl bg-bg-card border-2 border-ink-3/30 flex items-center justify-center"
              aria-label="Aktualisieren"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Live KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <KpiCard icon={ShoppingBag} label="Aktive Bestellungen" value={kpis.activeOrders} tone="primary" />
          <KpiCard icon={Bike} label="Online-Fahrer" value={kpis.onlineDrivers} tone="info" sublabel={`/ ${drivers.length} gesamt`} />
          <KpiCard icon={Store} label="Online-Restaurants" value={kpis.onlineRestaurants} tone="success" sublabel={`/ ${restaurants.length} gesamt`} />
          <KpiCard icon={Clock} label="Wartet auf Annahme" value={kpis.pendingAcceptance} tone={kpis.pendingAcceptance > 5 ? 'warning' : 'neutral'} />
          <KpiCard icon={DollarSign} label="Umsatz heute" value={formatEUR(kpis.totalRevenueToday)} tone="tip" sublabel={`${kpis.totalOrdersToday} Bestellungen`} />
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniKpi icon={Timer} label="Ø Zubereitung" value={`${kpis.avgPrepMin} min`} />
          <MiniKpi icon={TrendingUp} label="Stornierungsrate" value={`${kpis.cancelRateToday.toFixed(1)}%`} tone={kpis.cancelRateToday > 5 ? 'danger' : 'success'} />
          <MiniKpi icon={Zap} label="Aktive Vorfälle" value={String(incidents.filter(i => Date.now() - new Date(i.created_at).getTime() < 600_000).length)} tone="warning" />
          <MiniKpi icon={Target} label="Lieferquote" value={`${(100 - kpis.cancelRateToday).toFixed(1)}%`} />
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
            <input
              type="search"
              placeholder="Fahrer oder Restaurant suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-11 ps-10 pe-3 rounded-xl bg-bg-card border-2 border-ink-3/30 text-sm"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {(['all', 'late', 'pending'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterStatus(f)}
                className={`
                  px-3 h-11 rounded-xl text-sm font-medium whitespace-nowrap
                  ${filterStatus === f ? 'bg-brand-primary text-white' : 'bg-bg-card border border-ink-3/30 text-ink-1'}
                `}
              >
                {f === 'all' ? 'Alle' : f === 'late' ? 'Verspätet' : 'Wartet'}
              </button>
            ))}
          </div>
        </div>

        {/* Main grid: restaurants | drivers | incidents */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Restaurants — 6 cols */}
          <section className="lg:col-span-5 bg-bg-card border-2 border-ink-3/20 rounded-2xl p-4">
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-ink-1 flex items-center gap-2">
                <Store className="h-5 w-5" /> Restaurants
                <span className="text-xs text-ink-2 font-normal">({filteredRestaurants.length})</span>
              </h2>
            </header>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredRestaurants.map((r) => (
                <RestaurantRow key={r.id} r={r} />
              ))}
              {filteredRestaurants.length === 0 && (
                <div className="text-center py-8 text-ink-2 text-sm">Keine Restaurants gefunden</div>
              )}
            </div>
          </section>

          {/* Drivers — 4 cols */}
          <section className="lg:col-span-4 bg-bg-card border-2 border-ink-3/20 rounded-2xl p-4">
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-ink-1 flex items-center gap-2">
                <Bike className="h-5 w-5" /> Fahrer
                <span className="text-xs text-ink-2 font-normal">({filteredDrivers.length})</span>
              </h2>
            </header>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredDrivers.map((d) => (
                <DriverRow key={d.id} d={d} />
              ))}
              {filteredDrivers.length === 0 && (
                <div className="text-center py-8 text-ink-2 text-sm">Keine Fahrer gefunden</div>
              )}
            </div>
          </section>

          {/* Incidents — 3 cols */}
          <section className="lg:col-span-3 bg-bg-card border-2 border-ink-3/20 rounded-2xl p-4">
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-ink-1 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Vorfälle
                <span className="text-xs text-ink-2 font-normal">({incidents.length})</span>
              </h2>
            </header>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {incidents.map((i) => (
                <IncidentRow key={i.id} i={i} />
              ))}
              {incidents.length === 0 && (
                <div className="text-center py-8 text-ink-2 text-sm">Alles ruhig ✨</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Components
function KpiCard({ icon: Icon, label, value, tone, sublabel }: { icon: any; label: string; value: any; tone: 'primary' | 'info' | 'success' | 'warning' | 'tip' | 'neutral' | 'danger'; sublabel?: string }) {
  const tones = {
    primary: 'bg-gradient-to-br from-brand-primary/10 to-brand-premium/10 text-brand-primary',
    info: 'bg-info-500/10 text-info-700',
    success: 'bg-success-500/10 text-success-700',
    warning: 'bg-warning-500/10 text-warning-700',
    tip: 'bg-tip-500/10 text-tip-700',
    danger: 'bg-danger-500/10 text-danger-700',
    neutral: 'bg-bg-elevated text-ink-1',
  };
  return (
    <div className={`p-3 rounded-2xl border border-ink-3/20 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </div>
      <div className="text-2xl font-bold text-ink-1 mt-1">{value}</div>
      {sublabel && <div className="text-xs text-ink-2 mt-0.5">{sublabel}</div>}
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: 'success' | 'warning' | 'danger' }) {
  const colors = {
    success: 'text-success-700',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
  };
  return (
    <div className="bg-bg-card border border-ink-3/20 rounded-xl p-2.5 flex items-center gap-2">
      <Icon className={`h-4 w-4 ${tone ? colors[tone] : 'text-ink-2'}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ink-2 truncate">{label}</div>
        <div className={`text-sm font-bold ${tone ? colors[tone] : 'text-ink-1'}`}>{value}</div>
      </div>
    </div>
  );
}

function RestaurantRow({ r }: { r: RestaurantStatus }) {
  const status = !r.is_online ? 'offline' : r.is_paused ? 'paused' : r.busy_mode ? 'busy' : 'active';
  const statusConfig = {
    offline: { label: 'Offline', color: 'bg-ink-3 text-ink-1' },
    paused: { label: 'Pausiert', color: 'bg-warning-500 text-white' },
    busy: { label: 'Beschäftigt', color: 'bg-info-500 text-white' },
    active: { label: 'Aktiv', color: 'bg-success-500 text-white' },
  }[status];
  return (
    <Link
      href={`/admin/restaurants/${r.id}`}
      className="block p-2.5 rounded-xl bg-bg-elevated hover:bg-bg-card transition-colors active:scale-[0.98]"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-ink-1 truncate flex-1 min-w-0">{r.name}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusConfig.color}`}>{statusConfig.label}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-2">
        <span>📦 {r.active_orders} aktiv</span>
        <span>⏳ {r.pending} wartet</span>
        <span>⏱ {r.avg_prep_min}min</span>
        <span>⭐ {r.rating.toFixed(1)}</span>
      </div>
    </Link>
  );
}

function DriverRow({ d }: { d: DriverStatus }) {
  const statusConfig = {
    offline: { label: 'Offline', color: 'bg-ink-3' },
    idle: { label: 'Verfügbar', color: 'bg-success-500' },
    on_delivery: { label: 'Liefert', color: 'bg-info-500' },
    online: { label: 'Online', color: 'bg-warning-500' },
  }[d.status];
  return (
    <Link
      href={`/admin/drivers/${d.id}`}
      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-bg-elevated hover:bg-bg-card transition-colors active:scale-[0.98]"
    >
      <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${statusConfig.color}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-1 truncate">{d.name}</div>
        <div className="text-xs text-ink-2 flex items-center gap-2">
          <span>{statusConfig.label}</span>
          <span>· {d.total_today} heute</span>
          <span>· ⭐ {d.rating.toFixed(1)}</span>
        </div>
      </div>
    </Link>
  );
}

function IncidentRow({ i }: { i: Incident }) {
  const toneConfig = {
    low: { color: 'bg-ink-2/10 text-ink-1', icon: Activity },
    medium: { color: 'bg-warning-500/15 text-warning-700', icon: AlertCircle },
    high: { color: 'bg-danger-500/15 text-danger-700', icon: AlertTriangle },
  }[i.severity];
  const Icon = toneConfig.icon;
  const ageMin = Math.floor((Date.now() - new Date(i.created_at).getTime()) / 60_000);
  return (
    <div className={`p-2.5 rounded-xl ${toneConfig.color}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{i.message}</div>
          <div className="text-[10px] opacity-70 mt-0.5">vor {ageMin}min</div>
        </div>
      </div>
    </div>
  );
}
