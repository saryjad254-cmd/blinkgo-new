'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Check, Clock, ChefHat, Truck, PackageCheck, MapPin, Navigation, X } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { Order, OrderStatus } from '@/lib/types';

/**
 * OrderTracker — live tracker shown on the customer order details page.
 * Uses i18n for all labels so DE/AR stay consistent.
 */
export const OrderTracker = memo(function OrderTracker({ initialOrder }: { initialOrder: Order }) {
  const { locale, t } = useI18n();
  const [order, setOrder] = useState<Order>(initialOrder);

  const desc = t.customer.orderStatusDescription;
  // Memoize steps so they don't get re-created on every poll
  const steps = useMemo(() => [
    { status: 'pending' as OrderStatus, label: t.customer.orderPlaced, icon: Clock, description: desc?.pending },
    { status: 'confirmed' as OrderStatus, label: t.customer.orderStatus.confirmed, icon: Check, description: desc?.confirmed },
    { status: 'preparing' as OrderStatus, label: t.customer.orderStatus.preparing, icon: ChefHat, description: desc?.preparing },
    { status: 'ready' as OrderStatus, label: t.customer.orderStatus.ready, icon: PackageCheck, description: desc?.ready },
    { status: 'picked_up' as OrderStatus, label: t.customer.orderStatus.picked_up, icon: Truck, description: desc?.picked_up },
    { status: 'delivered' as OrderStatus, label: t.customer.orderStatus.delivered, icon: MapPin, description: desc?.delivered },
  ], [t, desc]);

  // Realtime subscription via polling
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const { createBrowserClient } = await import('@/lib/supabase/client');
        const supabase = createBrowserClient();
        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('id', initialOrder.id)
          .single();
        if (mounted && data) setOrder(data as Order);
      } catch {
        // ignore
      }
    };
    const t = setInterval(poll, 10_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [initialOrder.id]);

  const statusIndex = steps.findIndex((s) => s.status === order.status);
  const isCancelled = order.status === 'cancelled' || order.status === 'refunded';

  if (isCancelled) {
    return (
      <div className="card text-center">
        <span className="text-3xl">{order.status === 'cancelled' ? '⚠️' : '↩️'}</span>
        <h3 className="font-bold mt-2">{order.status === 'cancelled' ? t.customer.orderStatus.cancelled : t.customer.refundedShort}</h3>
        <p className="text-sm text-text-secondary mt-1">
          {order.status === 'cancelled' ? t.customer.cancelledDesc : t.customer.refundedDesc}
        </p>
        <Link href="/" className="mt-3 inline-block text-brand text-sm font-bold">
          {t.customer.homeCta}
        </Link>
      </div>
    );
  }

  const liveStatuses: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'];

  return (
    <div className="space-y-3">
      {liveStatuses.includes(order.status) && (
        <Link
          href={`/orders/${order.id}/track`}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-speed-gradient text-white font-bold rounded-md shadow-speed hover:shadow-speed-lg transition-all"
        >
          <Navigation className="w-4 h-4" />
          {t.customer.viewTracking}
        </Link>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-text">
            {t.customer.orderStatusTitle}
          </h2>
          <span className="badge badge-warning">{t.customer.orderStatus[order.status as keyof typeof t.customer.orderStatus] || order.status}</span>
        </div>

        <div className="space-y-4">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isPast = idx <= statusIndex;
            const isCurrent = idx === statusIndex;
            return (
              <div key={step.status} className="flex items-start gap-3 relative">
                {idx < steps.length - 1 && (
                  <div className={`absolute right-[19px] top-10 w-0.5 h-8 ${isPast ? 'bg-brand' : 'bg-edge'}`} />
                )}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isPast ? 'bg-brand text-white' : 'bg-bg-elevated text-text-muted'
                  } ${isCurrent ? 'ring-4 ring-brand-yellow-100' : ''}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 pt-1">
                  <p className={`font-medium ${isPast ? 'text-text' : 'text-text-muted'}`}>{step.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );});
