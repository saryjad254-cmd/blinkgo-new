'use client';

import {
  Store,
  MapPin,
  Clock,
  Banknote,
  CreditCard,
  Smartphone,
  Check,
  Package,
  Sparkles,
  AlertCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatEUR } from '@/lib/format';
import { computeEarnings } from '@/lib/services/driver-earnings';

export interface AvailableOrderCardProps {
  order: {
    id: string;
    order_number: string;
    total: number;
    delivery_fee?: number;
    tip?: number;
    distance_km?: number;
    duration_min?: number;
    payment_method?: string;
    created_at: string;
    restaurants?: { name?: string; address?: string };
    delivery_address?: any;
    customer_latitude?: number | null;
    customer_longitude?: number | null;
    restaurant_latitude?: number | null;
    restaurant_longitude?: number | null;
    item_count?: number;
  };
  locale: 'de' | 'ar' | 'en';
  onAccept: (orderId: string) => void;
  onReject?: (orderId: string) => void;
  accepting?: boolean;
  isFresh?: boolean; // < 2 min old
}

const T = {
  de: {
    accept: 'Annehmen',
    accepting: 'Wird angenommen...',
    rejecting: 'Wird abgelehnt...',
    reject: 'Ablehnen',
    pickup: 'Abholung',
    delivery: 'Lieferung',
    away: 'entfernt',
    min: 'Min',
    earn: 'Verdienst',
    new: 'NEU',
    kmAway: 'km entfernt',
    minAway: 'Min entfernt',
    fresh: 'Frisch',
    tip: 'Trinkgeld',
    items: (n: number) => `${n} ${n === 1 ? 'Artikel' : 'Artikel'}`,
  },
  ar: {
    accept: 'قبول',
    rejecting: '...جاري الرفض',
    reject: 'رفض',
    accepting: 'جاري القبول...',
    pickup: 'الاستلام',
    delivery: 'التوصيل',
    away: 'بعيد',
    min: 'دقيقة',
    earn: 'الأرباح',
    new: 'جديد',
    kmAway: 'كم بعيد',
    minAway: 'دقيقة بعيد',
    fresh: 'طازج',
    tip: 'البقشيش',
    items: (n: number) => `${n} ${n === 1 ? 'عنصر' : 'عناصر'}`,
  },
  en: {
    accept: 'Accept',
    rejecting: 'Rejecting...',
    reject: 'Reject',
    accepting: 'Accepting...',
    pickup: 'Pickup',
    delivery: 'Delivery',
    away: 'away',
    min: 'min',
    earn: 'Earnings',
    new: 'NEW',
    kmAway: 'km away',
    minAway: 'min away',
    fresh: 'Fresh',
    tip: 'Tip',
    items: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
  },
} as const;

function getAge(created_at: string): { ms: number; label: string } {
  const ms = Date.now() - new Date(created_at).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return { ms, label: 'jetzt' };
  if (minutes < 60) return { ms, label: `${minutes}m` };
  const hours = Math.floor(minutes / 60);
  return { ms, label: `${hours}h` };
}

export function AvailableOrderCard({
  order,
  locale,
  onAccept,
  onReject,
  accepting,
  isFresh = false,
}: AvailableOrderCardProps) {
  const isRtl = locale === 'ar';
  const t = T[locale] ?? T.de;
  const age = getAge(order.created_at);
  const isHot = age.ms < 90 * 1000; // < 90s

  // Parse customer address
  const da: any = order.delivery_address;
  const customerAddress =
    typeof da === 'object' && da
      ? da.formatted_address || da.address || `${da.street ?? ''}, ${da.postal ?? ''} ${da.city ?? ''}`.trim().replace(/^,\s*/, '')
      : typeof da === 'string'
      ? da
      : '';
  const customerFloor = typeof da === 'object' && da ? da.floor : null;
  const customerDoor = typeof da === 'object' && da ? da.door : null;
  const customerNotes = typeof da === 'object' && da ? da.instructions : null;

  const restaurantName = order.restaurants?.name ?? 'Restaurant';
  const restaurantAddress = order.restaurants?.address ?? '';
  const distance = order.distance_km ?? 0;
  const duration = order.duration_min ?? 0;

  // Driver earnings: 80% of delivery_fee + tip (canonical formula)
  const driverEarnings = computeEarnings({ delivery_fee: order.delivery_fee, tip: order.tip }).total;

  const PaymentIcon =
    order.payment_method === 'cash' ? Banknote : order.payment_method === 'card' ? CreditCard : Smartphone;
  const paymentLabel = (() => {
    if (order.payment_method === 'cash') return locale === 'ar' ? 'نقدي' : locale === 'en' ? 'Cash' : 'Bargeld';
    if (order.payment_method === 'card') return locale === 'ar' ? 'بطاقة' : locale === 'en' ? 'Card' : 'Karte';
    return order.payment_method ?? '';
  })();

  return (
    <article
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-surface-elevated transition-all hover:border-brand-500/40',
        isHot ? 'border-brand-500/50' : 'border-edge',
      )}
    >
      {/* Fresh/Hot pulsing border */}
      {isHot && (
        <span
          className="absolute inset-0 rounded-2xl ring-2 ring-brand-500/40 animate-pulse pointer-events-none"
          aria-hidden
        />
      )}

      {/* Top: order # + age badge + earn amount */}
      <header className="p-4 pb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-ink-700 flex items-center justify-center text-text-muted flex-shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
              #{order.order_number}
            </p>
            <p className="text-xs text-text-secondary font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {age.label}
              {(order.item_count ?? 0) > 0 && (
                <>
                  <span className="text-text-muted">·</span>
                  <span>{t.items(order.item_count ?? 0)}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="text-end flex-shrink-0">
          {isHot && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-gradient text-white text-[9px] font-extrabold uppercase tracking-wider mb-0.5">
              <Sparkles className="w-2.5 h-2.5" />
              {t.fresh}
            </span>
          )}
          <p className="text-lg font-black text-emerald-400 tabular-nums leading-tight">
            {formatEUR(driverEarnings)}
          </p>
          <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
            {t.earn}
          </p>
        </div>
      </header>

      {/* Route: restaurant → customer */}
      <div className="px-4 space-y-1.5">
        {/* Restaurant pickup */}
        <div className="flex items-start gap-2.5">
          <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
            <div className="w-6 h-6 rounded-full bg-orange-gradient flex items-center justify-center text-white">
              <Store className="w-3 h-3" />
            </div>
            <div className="w-0.5 h-4 bg-gradient-to-b from-brand-yellow-500/50 to-cyan-500/50" />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-sm font-extrabold text-white truncate">{restaurantName}</p>
            {restaurantAddress && (
              <p className="text-[11px] text-text-muted truncate">{restaurantAddress}</p>
            )}
          </div>
        </div>

        {/* Customer delivery */}
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-full bg-live-gradient flex items-center justify-center text-white flex-shrink-0 mt-0.5">
            <MapPin className="w-3 h-3" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-white truncate">
              {customerAddress || '—'}
            </p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {customerFloor && (
                <span className="px-1.5 py-0.5 rounded bg-ink-700 text-text-secondary text-[10px] font-bold">
                  {locale === 'ar' ? 'طابق' : locale === 'en' ? 'Fl' : 'Et'} {customerFloor}
                </span>
              )}
              {customerDoor && (
                <span className="px-1.5 py-0.5 rounded bg-ink-700 text-text-secondary text-[10px] font-bold">
                  {locale === 'ar' ? 'باب' : locale === 'en' ? 'Dr' : 'T'} {customerDoor}
                </span>
              )}
            </div>
            {customerNotes && (
              <p className="text-[10px] text-brand-yellow-400 mt-1 line-clamp-1 flex items-start gap-1">
                <AlertCircle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                <span className="truncate">{customerNotes}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats row + accept button */}
      <footer className="p-4 pt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-ink-700/50 border border-edge-light p-2 text-center">
          <p className="text-[9px] text-text-muted font-extrabold uppercase tracking-wider">
            {locale === 'ar' ? 'المسافة' : locale === 'en' ? 'Dist' : 'Distanz'}
          </p>
          <p className="text-sm font-extrabold text-white tabular-nums mt-0.5">
            {distance.toFixed(1)} km
          </p>
        </div>
        <div className="rounded-xl bg-ink-700/50 border border-edge-light p-2 text-center">
          <p className="text-[9px] text-text-muted font-extrabold uppercase tracking-wider">
            {locale === 'ar' ? 'الوقت' : locale === 'en' ? 'Time' : 'Zeit'}
          </p>
          <p className="text-sm font-extrabold text-white tabular-nums mt-0.5">
            {duration > 0 ? `${Math.round(duration)} min` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-ink-700/50 border border-edge-light p-2 text-center">
          <p className="text-[9px] text-text-muted font-extrabold uppercase tracking-wider flex items-center justify-center gap-0.5">
            <PaymentIcon className="w-2.5 h-2.5" />
            {paymentLabel}
          </p>
          <p className="text-sm font-extrabold text-white tabular-nums mt-0.5">
            {formatEUR(Number(order.total ?? 0))}
          </p>
        </div>
      </footer>

      <div className="px-4 pb-4 flex gap-2">
        {onReject && (
          <button
            type="button"
            onClick={() => onReject(order.id)}
            className="flex-shrink-0 h-12 px-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.97] border border-edge text-text-muted hover:text-red-400 hover:border-red-500/40 bg-ink-700/40 touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onAccept(order.id)}
          disabled={accepting}
          className={cn(
            'flex-1 h-12 rounded-2xl font-extrabold text-sm transition-all active:scale-[0.97] touch-manipulation',
            'bg-brand-gradient text-white shadow-glow hover:shadow-glow-strong',
            'flex items-center justify-center gap-2',
            accepting && 'opacity-70 cursor-wait',
          )}
        >
          {accepting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              {t.accepting}
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              {t.accept}
            </>
          )}
        </button>
      </div>
    </article>
  );
}
