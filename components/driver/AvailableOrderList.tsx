'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import {
  MapPin, DollarSign, Clock, Store, ArrowRight, ChevronRight,
  Filter, Package, Truck, Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { AcceptOrderButton } from '@/components/driver/AcceptOrderButton';
import { formatEUR } from '@/lib/format';
import { cn } from '@/lib/cn';

type Order = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  total: number;
  delivery_fee: number;
  tip: number;
  delivery_address?: any;
  restaurants?: { name: string; address: string };
};

type Locale = 'de' | 'ar' | 'en';

function getMinutesAgo(dateStr: string, locale: Locale): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diff < 1) return locale === 'ar' ? 'الآن' : locale === 'en' ? 'Just now' : 'Gerade eben';
  return `${diff} ${locale === 'ar' ? 'د' : locale === 'en' ? 'min' : 'Min'}`;
}

function deliveryAddr(order: Order): string {
  if (typeof order.delivery_address === 'object' && order.delivery_address?.address) {
    return order.delivery_address.address;
  }
  if (typeof order.delivery_address === 'string') {
    try {
      const parsed = JSON.parse(order.delivery_address);
      return parsed?.address || order.delivery_address;
    } catch {
      return order.delivery_address;
    }
  }
  return '';
}

// Haversine distance in km (rough — for sort)
function roughDistanceKm(a: { lat: number; lng: number }, order: Order): number {
  const dLat = (50.732 - a.lat) * 111;
  const dLng = (7.09 - a.lng) * 78;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function AvailableOrderList({
  orders,
  locale,
  t,
}: {
  orders: Order[];
  locale: Locale;
  t: any;
}) {
  const [filter, setFilter] = useState<'all' | 'payout_high' | 'closest'>('all');
  const driverPos = useMemo(() => ({ lat: 50.732, lng: 7.09 }), []);

  const filtered = useMemo(() => {
    const arr = [...orders];
    if (filter === 'payout_high') arr.sort((a, b) => Number(b.total) - Number(a.total));
    if (filter === 'closest') {
      arr.sort((a, b) => {
        // Use restaurant coords
        const ra = (a.restaurants as any)?.latitude ?? 0;
        const rb = (b.restaurants as any)?.latitude ?? 0;
        return Math.abs(ra - driverPos.lat) - Math.abs(rb - driverPos.lat);
      });
    }
    return arr;
  }, [orders, filter, driverPos.lat]);

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          icon={<Package className="w-3.5 h-3.5" />}
          label={t?.all || (locale === 'ar' ? 'الكل' : locale === 'de' ? 'Alle' : 'All')}
        />
        <FilterChip
          active={filter === 'payout_high'}
          onClick={() => setFilter('payout_high')}
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label={t?.highestPayout || (locale === 'ar' ? 'الأعلى أجراً' : locale === 'de' ? 'Höchste Vergütung' : 'Highest payout')}
        />
        <FilterChip
          active={filter === 'closest'}
          onClick={() => setFilter('closest')}
          icon={<Truck className="w-3.5 h-3.5" />}
          label={t?.closest || (locale === 'ar' ? 'الأقرب' : locale === 'de' ? 'Nächstgelegen' : 'Closest')}
        />
      </div>

      {filtered.map((order, idx) => {
        const minutesAgo = getMinutesAgo(order.created_at, locale);
        const address = deliveryAddr(order);
        const payout = Number(order.delivery_fee || 0) + Number(order.tip || 0);
        const isUrgent = minutesAgo.includes('Just now') || minutesAgo.includes('الآن') || minutesAgo.includes('Gerade');
        return (
          <Card
            key={order.id}
            hover
            className={cn(
              'overflow-hidden animate-slide-up',
              idx === 0 && 'ring-2 ring-emerald-500/30',
            )}
            style={{ animationDelay: `${Math.min(idx * 50, 500)}ms` }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-text-secondary font-mono" dir="ltr">
                  #{order.order_number}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                  isUrgent ? 'bg-brand-yellow-500 text-white animate-pulse' : 'bg-brand-yellow-500/15 text-brand-yellow-500',
                )}>
                  <Clock className="w-3 h-3" />
                  {minutesAgo}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {t?.ready || (locale === 'ar' ? 'جاهز' : locale === 'de' ? 'Bereit' : 'Ready')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-extrabold text-white text-base truncate">
                  {order.restaurants?.name ?? (locale === 'ar' ? 'مطعم' : locale === 'en' ? 'Restaurant' : 'Restaurant')}
                </h3>
                <p className="text-xs text-text-secondary flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{order.restaurants?.address}</span>
                </p>
              </div>
            </div>

            {address && (
              <div className="bg-surface-elevated rounded-xl p-3 mb-3 border border-edge-light">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-bold">
                  {t?.deliveryTo || (locale === 'ar' ? 'التوصيل إلى' : locale === 'de' ? 'Lieferung an' : 'Deliver to')}
                </p>
                <p className="text-sm text-white truncate">{address}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-edge-light">
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                  {t?.estimatedEarnings || (locale === 'ar' ? 'الأرباح المتوقعة' : locale === 'de' ? 'Geschätzter Verdienst' : 'Estimated earnings')}
                </p>
                <div className="flex items-baseline gap-1">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  <span className="font-extrabold text-lg tabular-nums text-emerald-500">
                    {formatEUR(payout)}
                  </span>
                </div>
              </div>
              <AcceptOrderButton orderId={order.id} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function FilterChip({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition-all duration-200 ease-silk',
        'border active:scale-95 touch-manipulation',
        active
          ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-speed-md border-brand-500/40'
          : 'bg-bg-elevated text-text-secondary hover:bg-bg-subtle hover:text-text border-edge',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
