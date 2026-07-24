'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Package, ChevronRight, MapPin, Store as StoreIcon, Phone, Calendar, Filter, Bell } from 'lucide-react';
import { OrderCalendar } from './OrderCalendar';
import { cn } from '@/lib/cn';
import { AcceptOrderCard, type AvailableOrder } from '@/components/restaurant/AcceptOrderCard';
import { formatCurrency } from '@/lib/i18n/format';

interface RestaurantOrder {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  customer_id: string;
  delivery_address?: any;
  item_count?: number;
  item_summary?: string;
  customer_name?: string;
}

interface Props {
  orders: RestaurantOrder[];
  locale: 'de' | 'ar' | 'en';
  /** When true, the top available order is shown as a hero AcceptOrderCard */
  isDashboard?: boolean;
}

/**
 * Restaurant order list — uses the shared OrderCalendar to group
 * orders by day/week/month + status filter.
 *
 * The newest PENDING order (if any) gets the new big AcceptOrderCard
 * treatment — large, animated, easy to tap.
 */
export function RestaurantOrderCalendar({ orders, locale, isDashboard = false }: Props) {
  // Find the topmost pending order for the hero CTA
  const topPending = orders.find((o) => o.status === 'pending');

  const renderOrder = (order: RestaurantOrder) => {
    // Special: top pending order → big AcceptOrderCard
    if (isDashboard && order.id === topPending?.id) {
      const ageMs = Date.now() - new Date(order.created_at).getTime();
      return (
        <AcceptOrderCard
          key={order.id}
          order={{
            id: order.id,
            order_number: order.order_number,
            total: order.total,
            created_at: order.created_at,
            status: order.status,
            customer_id: order.customer_id,
            customer_name: order.customer_name,
            delivery_address: order.delivery_address,
            item_count: order.item_count,
            item_summary: order.item_summary,
            age_ms: ageMs,
          } as AvailableOrder}
          isHero
          isFresh={ageMs < 120000}
          locale={locale}
        />
      );
    }

    // Standard compact order row
    const isCancelled = order.status === 'cancelled';
    const isCompleted = order.status === 'delivered';
    const isPending = order.status === 'pending';

    return (
      <Link
        href={`/restaurant/orders/${order.id}`}
        key={order.id}
        className={cn(
          'group block relative overflow-hidden rounded-2xl',
          'bg-surface-elevated border border-edge',
          'hover:border-edge-strong hover:-translate-y-0.5',
          'transition-all duration-200 ease-silk',
          isCancelled && 'opacity-60',
        )}
      >
        {isPending && (
          <span
            className="absolute top-3 end-3 w-2 h-2 rounded-full bg-brand-red-500 animate-pulse"
            aria-label="New order"
          />
        )}
        <div className="p-4 flex items-center gap-3.5">
          <div
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
              isPending
                ? 'bg-brand-red-500/15 text-brand-red-500'
                : isCompleted
                ? 'bg-success/15 text-success'
                : isCancelled
                ? 'bg-danger/15 text-danger'
                : 'bg-info/15 text-info',
            )}
          >
            <StoreIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="font-extrabold text-text text-sm truncate">
                {order.customer_name ? `#${order.order_number}` : `#${order.order_number}`}
              </p>
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex-shrink-0">
                {timeAgo(order.created_at, locale)}
              </span>
            </div>
            {order.item_summary && (
              <p className="text-xs text-text-secondary truncate">{order.item_summary}</p>
            )}
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-text-muted">
                {order.item_count ?? 0} {locale === 'ar' ? 'عنصر' : locale === 'en' ? 'items' : 'Artikel'}
              </span>
              <span className="text-sm font-extrabold text-text tabular-nums">
                {formatCurrency(order.total, locale)}
              </span>
            </div>
          </div>
          <ChevronRight
            className={cn(
              'w-5 h-5 text-text-muted group-hover:text-brand-red-500',
              'transition-transform flex-shrink-0',
              locale === 'ar' ? 'rotate-180 group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5',
            )}
            strokeWidth={2}
          />
        </div>
      </Link>
    );
  };

  return (
    <OrderCalendar
      orders={orders}
      locale={locale}
      renderOrder={renderOrder}
      showGrouping
      showStatusFilter
      showSummary
      defaultGrouping="day"
      defaultStatusFilter="all"
    />
  );
}

function timeAgo(iso: string, locale: 'de' | 'ar' | 'en'): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 1) return locale === 'ar' ? 'الآن' : locale === 'en' ? 'Now' : 'Gerade';
  if (min < 60) return locale === 'ar' ? `${min} د` : locale === 'en' ? `${min}m` : `${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return locale === 'ar' ? `${h} س` : locale === 'en' ? `${h}h` : `${h} Std.`;
  const d = Math.floor(h / 24);
  return locale === 'ar' ? `${d} يوم` : locale === 'en' ? `${d}d` : `${d} Tg.`;
}
