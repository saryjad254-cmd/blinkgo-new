'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Clock from 'lucide-react/dist/esm/icons/clock';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import Package from 'lucide-react/dist/esm/icons/package';
import Check from 'lucide-react/dist/esm/icons/check';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import { useRealtime } from '@/lib/realtime/use-realtime';

interface Order {
  id: string;
  order_number: string;
  status: string;
  items: any[];
  customer_name: string;
  notes?: string;
  created_at: string;
  total: number;
}

interface KitchenViewProps {
  initialOrders: Order[];
}

const COLUMNS = [
  { id: 'pending', de: 'Neu', ar: 'جديد', en: 'New', color: 'from-blue-500 to-blue-700', icon: Clock },
  { id: 'confirmed', de: 'Bestätigt', ar: 'مؤكد', en: 'Confirmed', color: 'from-indigo-500 to-indigo-700', icon: Check },
  { id: 'preparing', de: 'Zubereitung', ar: 'قيد التحضير', en: 'Preparing', color: 'from-brand-yellow-500 to-brand-yellow-700', icon: ChefHat },
  { id: 'ready', de: 'Bereit', ar: 'جاهز', en: 'Ready', color: 'from-emerald-500 to-emerald-700', icon: Package },
];

/**
 * `now` is initialized to 0 to keep server- and client-rendered HTML identical
 * (avoiding hydration mismatch). The real value is set inside an effect on the
 * client only — see useEffect below.
 */
export function KitchenView({ initialOrders }: KitchenViewProps) {
  const t = useT();
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [now, setNow] = useState(0);
  // v82 fix: ref-based in-flight guard for moveOrder. Without this, a
  // restaurant staff double-tapping "Weiter" sends two PATCHes — the
  // first transitions pending→confirmed, the second would (with the
  // server's idempotent state) re-transition confirmed→preparing
  // because the optimistic state is already past it.
  const moveInFlightRef = useRef<Set<string>>(new Set());

  // Tick for live timers — set initial value on mount to keep SSR happy.
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(i);
  }, []);

  // Real-time: refresh kitchen on any order change
  useRealtime({
    channels: [
      {
        name: 'kitchen-orders',
        table: 'orders',
        event: '*',
        onChange: () => router.refresh(),
      },
    ],
  });

  const moveOrder = async (orderId: string, currentStatus: string) => {
    // v82 fix: per-order in-flight guard. We use a Set (not a single
    // boolean) so different orders can be moved concurrently, but the
    // SAME order can't be moved twice in flight.
    if (moveInFlightRef.current.has(orderId)) return;
    const transitions: Record<string, string> = {
      pending: 'confirmed',
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'picked_up',
    };
    const next = transitions[currentStatus];
    if (!next) return;
    moveInFlightRef.current.add(orderId);

    // Optimistic update
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)));

    try {
      const res = await fetch('/api/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: next }),
      });
      if (!res.ok) {
        // Revert
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: currentStatus } : o)));
      }
    } catch {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: currentStatus } : o)));
    } finally {
      moveInFlightRef.current.delete(orderId);
    }
  };

  const getOrdersForColumn = (status: string) =>
    orders.filter((o) => o.status === status);

  // Resolve locale once for the column labels + status text.
  const locale: 'de' | 'ar' | 'en' =
    (typeof document !== 'undefined' &&
      (document.cookie.split('; ').find((c) => c.startsWith('blinkgo-locale='))?.split('=')[1] as any)) ||
    'de';

  const T = {
    de: {
      header: 'Küche',
      activeOrders: (n: number) => `${n} aktive Bestellungen`,
      empty: 'Keine',
      minutes: (m: number) => `${m} Min`,
      more: (n: number) => `+${n} weitere`,
      markPickedUp: 'Abgeholt markieren',
      next: 'Weiter',
    },
    ar: {
      header: 'المطبخ',
      activeOrders: (n: number) => `${n} طلب نشط`,
      empty: 'فارغ',
      minutes: (m: number) => `${m} د`,
      more: (n: number) => `+${n} المزيد`,
      markPickedUp: 'تم الاستلام',
      next: 'التالي',
    },
    en: {
      header: 'Kitchen',
      activeOrders: (n: number) => `${n} active order${n === 1 ? '' : 's'}`,
      empty: 'Empty',
      minutes: (m: number) => `${m} min`,
      more: (n: number) => `+${n} more`,
      markPickedUp: 'Mark picked up',
      next: 'Next',
    },
  } as const;
  const tt = T[locale];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-ink-1 dark:text-zinc-100">🍳 {tt.header}</h2>
        <div className="text-sm text-zinc-500">
          {tt.activeOrders(orders.length)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {COLUMNS.map((col) => {
          const Icon = col.icon;
          const colOrders = getOrdersForColumn(col.id);
          return (
            <div key={col.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className={`mb-3 flex items-center justify-between rounded-xl bg-gradient-to-r ${col.color} p-3 text-white`}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="font-bold">{(col as any)[locale] ?? col.de}</span>
                </div>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
                  {colOrders.length}
                </span>
              </div>

              <div className="space-y-2">
                {colOrders.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800">
                    {tt.empty}
                  </div>
                ) : (
                  colOrders.map((order) => {
                    const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
                    const isUrgent = elapsed > 20;
                    return (
                      <div
                        key={order.id}
                        className={`rounded-xl border bg-white p-3 shadow-sm transition hover:shadow-md dark:bg-zinc-900 ${
                          isUrgent ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-racing-red">
                            #{order.order_number?.slice(0, 6)}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-zinc-500">
                            <Clock className="h-3 w-3" />
                            <span className={isUrgent ? 'font-bold text-rose-500' : ''}>
                              {tt.minutes(elapsed)}
                            </span>
                          </div>
                        </div>
                        <div className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {order.customer_name}
                        </div>
                        <div className="mb-2 space-y-0.5 text-xs">
                          {Array.isArray(order.items) && order.items.slice(0, 4).map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between">
                              <span className="truncate">{item.quantity}× {item.name}</span>
                            </div>
                          ))}
                          {Array.isArray(order.items) && order.items.length > 4 && (
                            <div className="text-zinc-500">{tt.more(order.items.length - 4)}</div>
                          )}
                        </div>
                        {order.notes && (
                          <div className="mb-2 rounded-lg bg-brand-yellow-50 p-2 text-xs text-brand-yellow-700 dark:bg-brand-yellow-950/30 dark:text-brand-yellow-300">
                            <AlertCircle className="mr-1 inline h-3 w-3" />
                            {order.notes}
                          </div>
                        )}
                        <button
                          onClick={() => moveOrder(order.id, order.status)}
                          className={`w-full rounded-lg bg-gradient-to-r ${col.color} py-1.5 text-xs font-bold text-white transition hover:opacity-90`}
                        >
                          → {col.id === 'ready' ? tt.markPickedUp : tt.next}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
