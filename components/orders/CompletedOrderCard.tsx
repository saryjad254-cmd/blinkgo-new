'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingBag, ChevronRight, RotateCw, Plus, Loader2 } from 'lucide-react';
import { useCart } from '@/lib/cart-store';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/cn';
import { formatEUR } from '@/lib/format';

export interface CompletedOrderSummary {
  id: string;
  order_number?: string | number;
  status: string;
  total: number;
  created_at: string;
  restaurants?: { name: string } | null;
  /** Item count, fetched server-side */
  item_count?: number;
  /** First item name for preview */
  preview_name?: string;
}

interface CompletedOrderCardProps {
  order: CompletedOrderSummary;
  locale: 'de' | 'ar' | 'en';
  /** Translated strings for the Reorder button */
  t?: {
    reorder?: string;
    reorderLoading?: string;
    reorderAdded?: string;
    orderAgain?: string;
  };
}

const CAN_REORDER = new Set(['delivered', 'cancelled', 'completed']);

/**
 * Order list card — Careem / Uber Eats style.
 * - Status pill on top
 * - Restaurant name + order #
 * - Item preview text
 * - Total + "Order again" button if applicable
 */
export function CompletedOrderCard({ order, locale, t }: CompletedOrderCardProps) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'added'>('idle');
  const addToCart = useCart((s) => s.add);
  const restaurantName = order.restaurants?.name ?? 'Restaurant';

  const canReorder = CAN_REORDER.has(order.status?.toLowerCase?.() ?? '');

  async function handleReorder(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (state !== 'idle') return;
    setState('loading');
    try {
      const res = await fetch(`/api/orders/${order.id}/reorder`, { method: 'POST' });
      if (!res.ok) throw new Error('reorder failed');
      const data = await res.json();
      // Map items to cart shape
      for (const it of data.items ?? []) {
        addToCart(
          {
            product_id: it.product_id ?? it.id,
            product_name: it.name,
            product_price: it.unit_price,
            image_url: null,
            restaurant_id: data.order?.restaurant_id ?? '',
            restaurant_name: restaurantName,
            restaurant_lat: data.order?.restaurant_latitude ?? undefined,
            restaurant_lng: data.order?.restaurant_longitude ?? undefined,
          },
          it.quantity ?? 1,
        );
      }
      setState('added');
      setTimeout(() => router.push('/cart'), 600);
    } catch (err) {
      setState('idle');
      console.error(err);
    }
  }

  const dateFmt = new Date(order.created_at).toLocaleDateString(
    locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US',
    { day: '2-digit', month: 'short' },
  );

  return (
    <div className="group relative rounded-2xl bg-surface-elevated border border-edge hover:border-edge-strong transition-all duration-200 ease-silk overflow-hidden">
      <Link
        href={`/orders/${order.id}`}
        className="block p-4 hover:-translate-y-0.5 transition-transform duration-200 ease-silk"
      >
        <div className="flex items-start gap-3.5">
          <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-brand-red-500/15 to-brand-yellow-500/10 border border-brand-red-500/20 flex items-center justify-center text-brand flex-shrink-0">
            <ShoppingBag className="w-5 h-5" strokeWidth={2} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="font-extrabold text-white truncate text-sm">{restaurantName}</p>
              <StatusBadge status={order.status} size="sm" />
            </div>

            <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
              <span className="font-mono text-text-muted">#{order.order_number ?? order.id.slice(0, 6)}</span>
              <span className="text-text-muted">·</span>
              <span>{dateFmt}</span>
              {order.item_count ? (
                <>
                  <span className="text-text-muted">·</span>
                  <span>
                    {order.item_count} {locale === 'ar' ? 'عنصر' : locale === 'en' ? 'items' : 'Artikel'}
                  </span>
                </>
              ) : null}
            </div>

            {order.preview_name && (
              <p className="text-xs text-text-secondary truncate">{order.preview_name}</p>
            )}
          </div>

          <ChevronRight
            className={cn(
              'w-5 h-5 text-text-muted group-hover:text-brand group-hover:translate-x-0.5',
              'transition-all flex-shrink-0 mt-1',
              locale === 'ar' && 'rotate-180',
            )}
            strokeWidth={2}
          />
        </div>
      </Link>

      {/* Footer: total + Reorder button */}
      <div className="px-4 pb-3 pt-2 border-t border-edge flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
            {locale === 'ar' ? 'الإجمالي' : locale === 'en' ? 'Total' : 'Gesamt'}
          </span>
          <span className="font-extrabold text-white text-sm tabular-nums">
            {formatEUR(Number(order.total))}
          </span>
        </div>

        {canReorder && (
          <button
            type="button"
            onClick={handleReorder}
            disabled={state !== 'idle'}
            aria-busy={state === 'loading'}
            className={cn(
              'h-9 px-3.5 rounded-xl flex items-center gap-1.5',
              'font-extrabold text-xs',
              'transition-all duration-200 ease-silk active:scale-[0.97]',
              'focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2',
              state === 'added'
                ? 'bg-tip-gradient text-white shadow-glow-success'
                : 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5',
            )}
          >
            {state === 'loading' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : state === 'added' ? (
              <span>✓</span>
            ) : (
              <RotateCw className="w-3.5 h-3.5" />
            )}
            {state === 'loading'
              ? (t?.reorderLoading ?? 'Lädt...')
              : state === 'added'
                ? (t?.reorderAdded ?? 'Hinzugefügt')
                : (t?.reorder ?? 'Nochmal bestellen')}
          </button>
        )}
      </div>
    </div>
  );
}
