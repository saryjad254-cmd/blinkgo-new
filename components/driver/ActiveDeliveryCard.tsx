'use client';

import {
  Truck,
  MapPin,
  Phone,
  Navigation,
  Store,
  Clock,
  CheckCircle2,
  Package,
  ChefHat,
  ChevronRight,
  CreditCard,
  Banknote,
  Smartphone,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { formatEUR } from '@/lib/format';

export interface ActiveDeliveryCardProps {
  order: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    delivery_fee?: number;
    tip?: number;
    payment_method?: string;
    payment_status?: string;
    delivery_instructions?: string | null;
    delivery_address?: any;
    customer_latitude?: number | null;
    customer_longitude?: number | null;
    restaurant_latitude?: number | null;
    restaurant_longitude?: number | null;
    customer?: { name?: string; phone?: string };
    restaurants?: { name?: string; phone?: string; address?: string };
    distance_km?: number;
    duration_min?: number;
  };
  locale: 'de' | 'ar' | 'en';
  onNavigateRestaurant?: () => void;
  onNavigateCustomer?: () => void;
  onCallRestaurant?: () => void;
  onCallCustomer?: () => void;
}

const STATUS_LABELS = {
  pending: { de: 'Bestellung wartet', ar: 'الطلب ينتظر', en: 'Order pending' },
  confirmed: { de: 'Bestätigt', ar: 'مؤكد', en: 'Confirmed' },
  preparing: { de: 'Wird zubereitet', ar: 'قيد التحضير', en: 'Preparing' },
  ready: { de: 'Bereit zur Abholung', ar: 'جاهز للاستلام', en: 'Ready for pickup' },
  picked_up: { de: 'Unterwegs', ar: 'في الطريق', en: 'On the way' },
  delivered: { de: 'Geliefert', ar: 'تم التوصيل', en: 'Delivered' },
} as const;

const STEP_LABELS = {
  de: { pickup: 'Abholung', delivery: 'Lieferung', eta: 'ETA', call: 'Anrufen', navigate: 'Navigieren', open: 'Öffnen', details: 'Details anzeigen' },
  ar: { pickup: 'الاستلام', delivery: 'التوصيل', eta: 'الوقت المتوقع', call: 'اتصال', navigate: 'التوجيه', open: 'فتح', details: 'عرض التفاصيل' },
  en: { pickup: 'Pickup', delivery: 'Delivery', eta: 'ETA', call: 'Call', navigate: 'Navigate', open: 'Open', details: 'View details' },
} as const;

export function ActiveDeliveryCard({
  order,
  locale,
  onNavigateRestaurant,
  onNavigateCustomer,
  onCallRestaurant,
  onCallCustomer,
}: ActiveDeliveryCardProps) {
  const isRtl = locale === 'ar';
  const labels = STEP_LABELS[locale] ?? STEP_LABELS.de;
  const statusLabel =
    STATUS_LABELS[order.status as keyof typeof STATUS_LABELS]?.[locale] ?? order.status;

  // Parse customer address
  const da: any = order.delivery_address;
  const customerAddress =
    typeof da === 'object' && da
      ? da.formatted_address || da.address || `${da.street ?? ''}, ${da.postal ?? ''} ${da.city ?? ''}`.trim().replace(/^,\s*/, '')
      : typeof da === 'string'
      ? da
      : '';
  const customerLat = order.customer_latitude ?? (typeof da === 'object' && da ? da.lat : null);
  const customerLng = order.customer_longitude ?? (typeof da === 'object' && da ? da.lng : null);
  const customerFloor = typeof da === 'object' && da ? da.floor : null;
  const customerDoor = typeof da === 'object' && da ? da.door : null;
  const customerNotes = typeof da === 'object' && da ? da.instructions : null;
  const customerName = order.customer?.name ?? (typeof da === 'object' && da ? da.name : null);
  const customerPhone = order.customer?.phone;

  const restaurantName = order.restaurants?.name ?? 'Restaurant';
  const restaurantAddress = order.restaurants?.address ?? '';
  const restaurantPhone = order.restaurants?.phone;
  const restaurantLat = order.restaurant_latitude;
  const restaurantLng = order.restaurant_longitude;

  const isPickedUp = order.status === 'picked_up';
  const isReady = order.status === 'ready';
  const isDelivered = order.status === 'delivered';
  const isAtPickupPhase = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);
  const isAtDeliveryPhase = isPickedUp;

  // Build Google Maps URLs
  const restaurantMapsUrl =
    restaurantLat && restaurantLng
      ? `https://www.google.com/maps/dir/?api=1&destination=${restaurantLat},${restaurantLng}&travelmode=driving`
      : restaurantAddress
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(restaurantAddress)}&travelmode=driving`
      : null;

  const customerMapsUrl =
    customerLat && customerLng
      ? `https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}&travelmode=driving`
      : customerAddress
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customerAddress)}&travelmode=driving`
      : null;

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
        'relative overflow-hidden rounded-3xl border-2 transition-all',
        isDelivered
          ? 'bg-emerald-500/5 border-emerald-500/30'
          : isAtDeliveryPhase
          ? 'bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-blue-500/5 border-cyan-500/40'
          : 'bg-gradient-to-br from-brand-yellow-500/10 via-brand-yellow-500/5 to-brand-red-500/5 border-brand-yellow-500/40',
      )}
    >
      {/* Top: status + order number */}
      <header className="p-5 sm:p-6 pb-3 sm:pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
              isDelivered
                ? 'bg-emerald-500/20 text-emerald-400'
                : isAtDeliveryPhase
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'bg-brand-yellow-500/20 text-brand-yellow-400',
            )}
          >
            {isDelivered ? <CheckCircle2 className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
              {locale === 'ar' ? 'الطلب الحالي' : locale === 'en' ? 'Active delivery' : 'Aktive Lieferung'}
            </p>
            <p className="text-sm font-extrabold text-white truncate">
              #{order.order_number}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex-shrink-0',
            isDelivered
              ? 'bg-emerald-500/20 text-emerald-400'
              : isAtDeliveryPhase
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'bg-brand-yellow-500/20 text-brand-yellow-400',
          )}
        >
          {statusLabel}
        </span>
      </header>

      {/* Two-phase delivery: pickup (restaurant) → delivery (customer) */}
      <div className="px-5 sm:px-6 space-y-3">
        {/* PHASE 1: Restaurant pickup */}
        <div
          className={cn(
            'relative rounded-2xl border p-4 transition-all',
            isAtPickupPhase
              ? 'bg-brand-yellow-500/10 border-brand-yellow-500/40 shadow-glow-accent'
              : 'bg-surface-elevated/40 border-edge opacity-70',
          )}
        >
          <div className="absolute -top-2 start-3 px-2 py-0.5 rounded-full bg-brand-yellow-500 text-ink-900 text-[9px] font-extrabold uppercase tracking-wider">
            1 · {labels.pickup}
          </div>
          <div className="flex items-start gap-3 pt-1">
            <div className="w-10 h-10 rounded-xl bg-orange-gradient flex items-center justify-center text-white flex-shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-extrabold text-white truncate">{restaurantName}</p>
              {restaurantAddress && (
                <p className="text-xs text-text-secondary truncate mt-0.5">
                  {restaurantAddress}
                </p>
              )}
            </div>
          </div>
          {isAtPickupPhase && (
            <div className="flex gap-2 mt-3">
              {restaurantMapsUrl && (
                <a
                  href={restaurantMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-brand-yellow-500 text-ink-900 font-extrabold text-xs hover:bg-brand-yellow-400 active:scale-[0.97] transition-all"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  {labels.navigate}
                </a>
              )}
              {restaurantPhone && (
                <a
                  href={`tel:${restaurantPhone}`}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-ink-700 border border-edge text-text font-extrabold text-xs hover:bg-ink-600 active:scale-[0.97] transition-all"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {labels.call}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Connector line */}
        <div className="flex justify-center -my-1">
          <div className="w-0.5 h-3 bg-gradient-to-b from-brand-yellow-500/50 to-cyan-500/50" />
        </div>

        {/* PHASE 2: Customer delivery */}
        <div
          className={cn(
            'relative rounded-2xl border p-4 transition-all',
            isAtDeliveryPhase
              ? 'bg-cyan-500/10 border-cyan-500/40 shadow-glow-info'
              : isDelivered
              ? 'bg-emerald-500/10 border-emerald-500/40'
              : 'bg-surface-elevated/40 border-edge opacity-70',
          )}
        >
          <div
            className={cn(
              'absolute -top-2 start-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider',
              isAtDeliveryPhase
                ? 'bg-cyan-500 text-ink-900'
                : isDelivered
                ? 'bg-emerald-500 text-ink-900'
                : 'bg-ink-600 text-text-muted',
            )}
          >
            2 · {labels.delivery}
          </div>
          <div className="flex items-start gap-3 pt-1">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0',
                isDelivered ? 'bg-tip-gradient' : 'bg-live-gradient',
              )}
            >
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-extrabold text-white truncate">
                {customerName ?? (locale === 'ar' ? 'العميل' : locale === 'en' ? 'Customer' : 'Kunde')}
              </p>
              <p className="text-sm text-text-secondary mt-0.5 line-clamp-2">
                {customerAddress || (locale === 'ar' ? 'لا يوجد عنوان' : locale === 'en' ? 'No address' : 'Keine Adresse')}
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {customerFloor && (
                  <span className="px-2 py-0.5 rounded-md bg-ink-700 text-text-secondary text-[10px] font-bold">
                    {locale === 'ar' ? 'الطابق' : locale === 'en' ? 'Floor' : 'Etage'} {customerFloor}
                  </span>
                )}
                {customerDoor && (
                  <span className="px-2 py-0.5 rounded-md bg-ink-700 text-text-secondary text-[10px] font-bold">
                    {locale === 'ar' ? 'الباب' : locale === 'en' ? 'Door' : 'Tür'} {customerDoor}
                  </span>
                )}
              </div>
              {customerNotes && (
                <p className="text-[11px] text-brand-yellow-400 mt-1.5 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{customerNotes}</span>
                </p>
              )}
            </div>
          </div>
          {(isAtDeliveryPhase || isDelivered) && (
            <div className="flex gap-2 mt-3">
              {customerMapsUrl && (
                <a
                  href={customerMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl font-extrabold text-xs active:scale-[0.97] transition-all',
                    isDelivered
                      ? 'bg-emerald-500 text-ink-900 hover:bg-emerald-400'
                      : 'bg-cyan-500 text-ink-900 hover:bg-cyan-400',
                  )}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  {labels.navigate}
                </a>
              )}
              {customerPhone && (
                <a
                  href={`tel:${customerPhone}`}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-ink-700 border border-edge text-text font-extrabold text-xs hover:bg-ink-600 active:scale-[0.97] transition-all"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {labels.call}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer: amount + payment + details link */}
      <footer className="p-5 sm:p-6 pt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-end min-w-0">
            <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
              {locale === 'ar' ? 'المبلغ' : locale === 'en' ? 'Total' : 'Gesamt'}
            </p>
            <p className="text-xl sm:text-2xl font-black text-emerald-400 tabular-nums leading-tight">
              {formatEUR(Number(order.total ?? 0))}
            </p>
          </div>
          <div className="h-10 w-px bg-edge" />
          <div className="text-start min-w-0">
            <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
              {locale === 'ar' ? 'الدفع' : locale === 'en' ? 'Payment' : 'Zahlung'}
            </p>
            <p className="text-sm font-extrabold text-white flex items-center gap-1 mt-0.5">
              <PaymentIcon className="w-3.5 h-3.5" />
              {paymentLabel}
            </p>
          </div>
          {order.tip && order.tip > 0 && (
            <>
              <div className="h-10 w-px bg-edge" />
              <div className="text-start">
                <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
                  {locale === 'ar' ? 'البقشيش' : locale === 'en' ? 'Tip' : 'Trinkgeld'}
                </p>
                <p className="text-sm font-extrabold text-brand-yellow-400 mt-0.5">
                  {formatEUR(Number(order.tip))}
                </p>
              </div>
            </>
          )}
        </div>
        <Link
          href={`/driver/orders/${order.id}`}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-xl bg-surface-elevated border border-edge text-white text-xs font-extrabold hover:bg-surface transition-colors"
        >
          {labels.details}
          <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </Link>
      </footer>
    </article>
  );
}
