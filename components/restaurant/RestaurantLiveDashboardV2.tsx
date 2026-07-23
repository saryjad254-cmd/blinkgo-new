'use client';

/**
 * RestaurantLiveDashboardV2 — operations-first command center.
 *
 * Designed for 100+ orders/day, multiple staff working in parallel:
 * - Live order queue with prep timers (auto-counting up from accepted_at)
 * - Stage grouping (new / preparing / ready) for visual scanning
 * - Capacity indicator (concurrent orders vs max)
 * - Quick action chips on every order
 * - Surge warning when order rate spikes
 * - Audio + haptic on new order
 * - Estimated ready time projection
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { 
  ShoppingBag, Clock, Bell, TrendingUp, AlertTriangle, ChevronRight, 
  Volume2, VolumeX, CheckCircle2, XCircle, ChefHat, Package, Truck,
  Coffee, Flame, Zap, Timer
} from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { haptic } from '@/lib/utils/haptics';
import { playDriverSound } from '@/lib/utils/driver-sound';
import { apiGet, apiPost } from '@/lib/api/client';
import { formatEUR } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/Card';

interface Order {
  id: string;
  order_number: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready';
  created_at: string;
  accepted_at?: string | null;
  total: number;
  delivery_address: string;
  customer_name?: string;
  items_count?: number;
}

interface RestaurantLiveDashboardV2Props {
  restaurantId: string;
  restaurantName: string;
  initialActiveOrders: Order[];
  initialTodayCount: number;
  initialTodayRevenue: number;
  initialAvgPrepMin: number;
  isOnline: boolean;
  isPaused: boolean;
  busyMode: boolean;
  maxConcurrentOrders: number;
}

export function RestaurantLiveDashboardV2({
  restaurantId,
  restaurantName,
  initialActiveOrders,
  initialTodayCount,
  initialTodayRevenue,
  initialAvgPrepMin,
  isOnline: initialIsOnline,
  isPaused: initialIsPaused,
  busyMode: initialBusyMode,
  maxConcurrentOrders = 8,
}: RestaurantLiveDashboardV2Props) {
  const t = useT();
  const [activeOrders, setActiveOrders] = useState<Order[]>(initialActiveOrders);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [todayRevenue, setTodayRevenue] = useState(initialTodayRevenue);
  const [avgPrepMin, setAvgPrepMin] = useState(initialAvgPrepMin);
  const [isOnline, setIsOnline] = useState(initialIsOnline);
  const [isPaused, setIsPaused] = useState(initialIsPaused);
  const [busyMode, setBusyMode] = useState(initialBusyMode);
  const [audioOn, setAudioOn] = useState(true);
  const [, setTick] = useState(0);
  const lastOrderCountRef = useRef(initialActiveOrders.length);
  const online = useOnlineStatus();

  // Re-render every 30s to keep prep timers accurate
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Realtime subscription for new orders
  useRealtime({
    channels: [
      {
        name: `restaurant-orders-${restaurantId}`,
        table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`,
        event: '*',
        onChange: (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOrder = payload.new as Order;
            setActiveOrders((prev) => {
              if (prev.find((o) => o.id === newOrder.id)) return prev;
              return [...prev, newOrder];
            });
            if (audioOn) {
              playDriverSound('offer');
              haptic('heavy');
            }
            lastOrderCountRef.current = lastOrderCountRef.current + 1;
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Order;
            setActiveOrders((prev) =>
              prev
                .map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
                .filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status))
            );
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string };
            setActiveOrders((prev) => prev.filter((o) => o.id !== old.id));
          }
        },
      },
    ],
  });

  // Group orders by stage
  const grouped = useMemo(() => {
    const newOrders = activeOrders.filter((o) => o.status === 'pending' || o.status === 'confirmed');
    const preparing = activeOrders.filter((o) => o.status === 'preparing');
    const ready = activeOrders.filter((o) => o.status === 'ready');
    return { newOrders, preparing, ready };
  }, [activeOrders]);

  // Capacity & surge
  const capacityPct = Math.min(100, (activeOrders.length / maxConcurrentOrders) * 100);
  const isAtCapacity = activeOrders.length >= maxConcurrentOrders;
  const isSurge = lastOrderCountRef.current > 5 && activeOrders.length > 3;

  // Order actions
  const handleAccept = async (orderId: string) => {
    haptic('success');
    playDriverSound('success');
    setActiveOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'confirmed' as const, accepted_at: new Date().toISOString() } : o))
    );
    try {
      await apiPost(`/api/restaurant/orders/${orderId}/accept`, {});
    } catch {
      // Refetch on failure
      refetchOrders();
    }
  };

  const handleReject = async (orderId: string) => {
    haptic('warning');
    setActiveOrders((prev) => prev.filter((o) => o.id !== orderId));
    try {
      await apiPost(`/api/restaurant/orders/${orderId}/reject`, { reason: 'busy' });
    } catch {
      // ignore
    }
  };

  const handleStartPreparing = async (orderId: string) => {
    haptic('success');
    setActiveOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'preparing' as const } : o))
    );
    try {
      await apiPost(`/api/restaurant/orders/${orderId}/start-preparing`, {});
    } catch {
      // ignore
    }
  };

  const handleMarkReady = async (orderId: string) => {
    haptic('success');
    playDriverSound('arrived');
    setActiveOrders((prev) => prev.filter((o) => o.id !== orderId));
    setTodayCount((c) => c + 1);
    try {
      await apiPost(`/api/restaurant/orders/${orderId}/ready`, {});
    } catch {
      // ignore
    }
  };

  const refetchOrders = useCallback(async () => {
    try {
      const res = await apiGet<any>('/api/restaurant/dashboard', { cacheTtl: 0 });
      if (res.ok && res.data) {
        setActiveOrders(res.data.activeOrders ?? []);
        setTodayCount(res.data.todayCount ?? todayCount);
        setTodayRevenue(res.data.todayRevenue ?? todayRevenue);
        setAvgPrepMin(res.data.avgPrepMin ?? avgPrepMin);
      }
    } catch {
      // ignore
    }
  }, [todayCount, todayRevenue, avgPrepMin]);

  // Toggle online/paused/busy
  const toggleOnline = async () => {
    const newState = !isOnline;
    setIsOnline(newState);
    try {
      await apiPost('/api/restaurant/online', { is_online: newState });
      haptic('success');
    } catch {
      setIsOnline(!newState);
    }
  };

  const togglePaused = async () => {
    const newState = !isPaused;
    setIsPaused(newState);
    try {
      await apiPost('/api/restaurant/paused', { is_paused: newState });
      haptic('medium');
    } catch {
      setIsPaused(!newState);
    }
  };

  const toggleBusy = async () => {
    const newState = !busyMode;
    setBusyMode(newState);
    try {
      await apiPost('/api/restaurant/busy', { busy_mode: newState });
      haptic('warning');
    } catch {
      setBusyMode(!newState);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base pb-32">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        {/* Header — restaurant name + online toggle */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-2 uppercase tracking-wide">
              {t.driver?.p13_portal ?? 'Restaurant Portal'}
            </div>
            <h1 className="text-2xl font-bold text-ink-1 truncate">{restaurantName}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => { setAudioOn(!audioOn); haptic('light'); }}
              className="w-11 h-11 rounded-xl bg-bg-card border-2 border-ink-3/30 flex items-center justify-center active:scale-95 transition-transform"
              aria-label={audioOn ? 'Stummschalten' : 'Ton an'}
            >
              {audioOn ? <Volume2 className="h-5 w-5 text-ink-1" /> : <VolumeX className="h-5 w-5 text-ink-2" />}
            </button>
            <button
              type="button"
              onClick={toggleOnline}
              aria-pressed={isOnline}
              className={`
                h-11 px-4 rounded-xl font-semibold text-sm flex items-center gap-2
                active:scale-95 transition-transform
                ${isOnline ? 'bg-success-500 text-white' : 'bg-ink-3 text-ink-1'}
              `}
            >
              <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-ink-1'}`} />
              {isOnline ? (t.driver?.online ?? 'Online') : (t.driver?.offline ?? 'Offline')}
            </button>
          </div>
        </header>

        {/* Status indicators */}
        {(isPaused || busyMode || isAtCapacity || isSurge || !online) && (
          <div className="grid gap-2">
            {!online && (
              <StatusBanner tone="danger" icon={AlertTriangle} label={t.driver?.offline ?? 'Offline — Bestellungen werden möglicherweise nicht empfangen'} />
            )}
            {isPaused && (
              <StatusBanner tone="warning" icon={PauseIcon} label={t.driver?.p13_paused ?? 'Pausiert — keine neuen Bestellungen'} />
            )}
            {busyMode && (
              <StatusBanner tone="info" icon={Flame} label={t.driver?.p13_busy_mode ?? 'Beschäftigt — verzögerte Annahme'} />
            )}
            {isAtCapacity && (
              <StatusBanner tone="warning" icon={AlertTriangle} label={t.driver?.p13_at_capacity ?? 'Maximale Kapazität erreicht — keine neuen Bestellungen'} />
            )}
            {isSurge && !isAtCapacity && (
              <StatusBanner tone="info" icon={Zap} label={t.driver?.p13_surge ?? 'Ansturm — viele Bestellungen gleichzeitig'} />
            )}
          </div>
        )}

        {/* Live KPIs — 4 stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label={t.driver?.p13_active_orders ?? 'Aktive Bestellungen'}
            value={activeOrders.length}
            icon={<ShoppingBag className="h-5 w-5" />}
            accent={isAtCapacity ? 'danger' : activeOrders.length > 0 ? 'brand' : 'info'}
            
          />
          <StatCard
            label={t.driver?.p13_today_count ?? 'Heute'}
            value={todayCount}
            icon={<TrendingUp className="h-5 w-5" />}
            accent="success"
            trend={{ value: t.driver?.p13_order_count ?? 'Bestellungen', up: true }}
          />
          <StatCard
            label={t.driver?.p13_today_revenue ?? 'Tagesumsatz'}
            value={formatEUR(todayRevenue)}
            icon={<TrendingUp className="h-5 w-5" />}
            accent="brand"
          />
          <StatCard
            label={t.driver?.p13_avg_prep_time ?? 'Ø Zubereitung'}
            value={avgPrepMin > 0 ? `${avgPrepMin} min` : '—'}
            icon={<Clock className="h-5 w-5" />}
            accent="info"
            trend={{ value: t.driver?.p13_today_label ?? 'Heute', up: false }}
          />
        </div>

        {/* Capacity bar */}
        {activeOrders.length > 0 && (
          <div className="bg-bg-card border-2 border-ink-3/20 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink-1">
                {t.driver?.p13_capacity ?? 'Auslastung'}
              </span>
              <span className="text-sm font-bold text-ink-1">
                {activeOrders.length} / {maxConcurrentOrders}
              </span>
            </div>
            <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  capacityPct >= 100 ? 'bg-danger-500' :
                  capacityPct >= 75 ? 'bg-warning-500' : 'bg-success-500'
                }`}
                style={{ width: `${capacityPct}%` }}
                role="progressbar"
                aria-valuenow={activeOrders.length}
                aria-valuemin={0}
                aria-valuemax={maxConcurrentOrders}
              />
            </div>
          </div>
        )}

        {/* Stage tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <StageTab label={t.driver?.p13_stage_new ?? 'Neu'} count={grouped.newOrders.length} active color="warning" />
          <StageTab label={t.driver?.p13_stage_preparing ?? 'In Zubereitung'} count={grouped.preparing.length} active={false} color="info" />
          <StageTab label={t.driver?.p13_stage_ready ?? 'Abholbereit'} count={grouped.ready.length} active={false} color="success" />
        </div>

        {/* Order queue */}
        {activeOrders.length === 0 ? (
          <EmptyState
            icon={<ChefHat className="h-7 w-7" />}
            title={t.driver?.p13_no_active_orders ?? 'Keine aktiven Bestellungen'}
            description={t.driver?.p13_no_active_orders_desc ?? 'Neue Bestellungen erscheinen hier automatisch.'}
            size="md"
          />
        ) : (
          <div className="space-y-2">
            {activeOrders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onAccept={handleAccept}
                onReject={handleReject}
                onStartPreparing={handleStartPreparing}
                onMarkReady={handleMarkReady}
                avgPrepMin={avgPrepMin}
              />
            ))}
          </div>
        )}

        {/* Bottom action chips */}
        <div className="grid grid-cols-3 gap-2">
          <ActionChip
            label={isPaused ? (t.driver?.p13_resume ?? 'Fortsetzen') : (t.driver?.p13_pause ?? 'Pausieren')}
            icon={isPaused ? Play : PauseIcon}
            onClick={togglePaused}
            tone={isPaused ? 'success' : 'warning'}
          />
          <ActionChip
            label={busyMode ? (t.driver?.p13_normal_mode ?? 'Normal') : (t.driver?.p13_busy ?? 'Beschäftigt')}
            icon={Flame}
            onClick={toggleBusy}
            tone={busyMode ? 'success' : 'info'}
          />
          <ActionChip
            label={t.driver?.p13_menu ?? 'Speisekarte'}
            icon={Coffee}
            href="/restaurant/menu"
          />
        </div>
      </div>
    </div>
  );
}

// Helpers
function StatusBanner({ tone, icon: Icon, label }: { tone: 'danger' | 'warning' | 'info' | 'success'; icon: any; label: string }) {
  const colors = {
    danger: 'bg-danger-500/15 text-danger-700 border-danger-500/30',
    warning: 'bg-warning-500/15 text-warning-700 border-warning-500/30',
    info: 'bg-info-500/15 text-info-700 border-info-500/30',
    success: 'bg-success-500/15 text-success-700 border-success-500/30',
  };
  return (
    <div role="status" className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium ${colors[tone]}`}>
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

function StageTab({ label, count, active, color }: { label: string; count: number; active: boolean; color: 'warning' | 'info' | 'success' }) {
  const colors = {
    warning: 'bg-warning-500/15 text-warning-700 border-warning-500/30',
    info: 'bg-info-500/15 text-info-700 border-info-500/30',
    success: 'bg-success-500/15 text-success-700 border-success-500/30',
  };
  return (
    <div className={`
      flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap
      ${active ? colors[color] : 'bg-bg-card text-ink-2 border-ink-3/20'}
    `}>
      <span>{label}</span>
      <span className={`
        px-1.5 py-0.5 rounded-full text-[10px] font-bold
        ${active ? 'bg-white/30' : 'bg-bg-elevated'}
      `}>
        {count}
      </span>
    </div>
  );
}

function OrderRow({
  order,
  onAccept,
  onReject,
  onStartPreparing,
  onMarkReady,
  avgPrepMin,
}: {
  order: Order;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onStartPreparing: (id: string) => void;
  onMarkReady: (id: string) => void;
  avgPrepMin: number;
}) {
  const elapsedMs = order.accepted_at ? Date.now() - new Date(order.accepted_at).getTime() : 0;
  const elapsedMin = Math.floor(elapsedMs / 60_000);
  const expectedReady = elapsedMin + (avgPrepMin || 15);
  const isOverdue = elapsedMin > (avgPrepMin || 15);

  const stageInfo = {
    pending: { label: 'Neu', color: 'warning', action: 'accept' as const },
    confirmed: { label: 'Bestätigt', color: 'info', action: 'prepare' as const },
    preparing: { label: 'Zubereitung', color: 'info', action: 'ready' as const },
    ready: { label: 'Bereit', color: 'success', action: null },
  }[order.status];

  return (
    <div className={`
      bg-bg-card border-2 rounded-2xl p-3 transition-all
      ${isOverdue ? 'border-danger-500/40 shadow-lg' : 'border-ink-3/20'}
    `}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-bold text-ink-1">#{order.order_number}</span>
            <span className={`
              text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded
              ${stageInfo.color === 'warning' ? 'bg-warning-500/15 text-warning-700' : ''}
              ${stageInfo.color === 'info' ? 'bg-info-500/15 text-info-700' : ''}
              ${stageInfo.color === 'success' ? 'bg-success-500/15 text-success-700' : ''}
            `}>
              {stageInfo.label}
            </span>
            {isOverdue && (
              <span className="text-[10px] font-bold text-danger-600 flex items-center gap-0.5">
                <Timer className="h-3 w-3" /> {elapsedMin}min
              </span>
            )}
          </div>
          <div className="text-sm text-ink-2 line-clamp-1">{formatAddress(order.delivery_address)}</div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-2">
            <span className="font-semibold text-ink-1">{formatEUR(order.total)}</span>
            {order.accepted_at && <span>⏱ {elapsedMin} min</span>}
            {order.items_count != null && <span>📦 {order.items_count} items</span>}
          </div>
        </div>
      </div>

      {/* Stage actions */}
      {stageInfo.action && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {stageInfo.action === 'accept' && (
            <>
              <button
                type="button"
                onClick={() => onReject(order.id)}
                className="h-10 rounded-xl bg-bg-elevated text-ink-2 font-medium text-sm active:scale-95 transition-transform"
              >
                Ablehnen
              </button>
              <button
                type="button"
                onClick={() => onAccept(order.id)}
                className="h-10 rounded-xl bg-success-500 text-white font-semibold text-sm active:scale-95 transition-transform"
              >
                Annehmen
              </button>
            </>
          )}
          {stageInfo.action === 'prepare' && (
            <button
              type="button"
              onClick={() => onStartPreparing(order.id)}
              className="col-span-2 h-10 rounded-xl bg-info-500 text-white font-semibold text-sm active:scale-95 transition-transform"
            >
              Zubereitung starten
            </button>
          )}
          {stageInfo.action === 'ready' && (
            <button
              type="button"
              onClick={() => onMarkReady(order.id)}
              className="col-span-2 h-10 rounded-xl bg-success-500 text-white font-semibold text-sm active:scale-95 transition-transform"
            >
              Abholbereit markieren
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ActionChip({ label, icon: Icon, onClick, href, tone = 'neutral' }: { label: string; icon: any; onClick?: () => void; href?: string; tone?: 'neutral' | 'warning' | 'success' | 'info' }) {
  const colors = {
    neutral: 'bg-bg-card border-2 border-ink-3/20 text-ink-1',
    warning: 'bg-warning-500/15 border border-warning-500/30 text-warning-700',
    success: 'bg-success-500/15 border border-success-500/30 text-success-700',
    info: 'bg-info-500/15 border border-info-500/30 text-info-700',
  };
  const className = `h-12 rounded-xl px-3 flex items-center justify-center gap-2 font-semibold text-sm active:scale-95 transition-transform touch-manipulation ${colors[tone]}`;
  if (href) {
    return (
      <Link href={href} className={className}>
        <Icon className="h-5 w-5" aria-hidden />
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      <Icon className="h-5 w-5" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

// Re-export Pause as PauseIcon to avoid name conflict
import { Pause, Play } from 'lucide-react';
const PauseIcon = Pause
const PlayIcon = Play;

function formatAddress(addr: any): string {
  if (!addr) return '—';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    return (
      addr.formatted_address ||
      addr.address ||
      [addr.street, addr.postal || addr.postal_code, addr.city].filter(Boolean).join(', ') ||
      '—'
    );
  }
  return String(addr);
}
