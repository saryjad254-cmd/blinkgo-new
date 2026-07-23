'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ChefHat, Package, Check, AlertCircle } from 'lucide-react';
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
  { id: 'pending', title: 'Neu', color: 'from-blue-500 to-blue-700', icon: Clock },
  { id: 'confirmed', title: 'Bestätigt', color: 'from-indigo-500 to-indigo-700', icon: Check },
  { id: 'preparing', title: 'Zubereitung', color: 'from-brand-yellow-500 to-brand-yellow-700', icon: ChefHat },
  { id: 'ready', title: 'Bereit', color: 'from-emerald-500 to-emerald-700', icon: Package },
];

function DateNow(): number {
  return Date.now();
}

export function KitchenView({ initialOrders }: KitchenViewProps) {
  const t = useT();
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [now, setNow] = useState(DateNow());

  // Tick for live timers
  useEffect(() => {
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
    const transitions: Record<string, string> = {
      pending: 'confirmed',
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'picked_up',
    };
    const next = transitions[currentStatus];
    if (!next) return;

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
    }
  };

  const getOrdersForColumn = (status: string) =>
    orders.filter((o) => o.status === status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-ink-1 dark:text-zinc-100">🍳 Kitchen</h2>
        <div className="text-sm text-zinc-500">
          {orders.length} active orders
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
                  <span className="font-bold">{col.title}</span>
                </div>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
                  {colOrders.length}
                </span>
              </div>

              <div className="space-y-2">
                {colOrders.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800">
                    Empty
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
                              {elapsed}m
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
                            <div className="text-zinc-500">+{order.items.length - 4} more</div>
                          )}
                        </div>
                        {order.notes && (
                          <div className="mb-2 rounded-lg bg-brand-yellow-50 p-2 text-xs text-brand-yellow-700 dark:bg-brand-yellow-950/30 dark:text-brand-yellow-300">
                            <AlertCircle className="me-1 inline h-3 w-3" />
                            {order.notes}
                          </div>
                        )}
                        <button
                          onClick={() => moveOrder(order.id, order.status)}
                          className={`w-full rounded-lg bg-gradient-to-r ${col.color} py-1.5 text-xs font-bold text-white transition hover:opacity-90`}
                        >
                          → {col.id === 'ready' ? 'Mark picked up' : 'Next'}
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
