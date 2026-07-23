'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Truck,
  Store,
  Phone,
  CheckCircle2,
  Package,
  ChefHat,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Navigation2,
  Share2,
  MessageSquare,
  ChevronUp,
} from 'lucide-react';
import { ShareTrackingButton } from '@/components/orders/ShareTrackingButton';
import { LiveTrackingMap } from '@/components/tracking/LiveTrackingMap';
import { subscribeToOrder } from '@/lib/realtime/location-service';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

interface TrackingData {
  order: {
    id: string;
    order_number: string;
    status: string;
    delivery_address: any;
    delivered_at?: string | null;
    driver_id?: string | null;
    total?: number;
    restaurants?: { name?: string; phone?: string; address?: string };
  };
  positions: {
    restaurant: { lat: number; lng: number; name: string } | null;
    customer: { lat: number; lng: number } | null;
    driver: {
      lat: number;
      lng: number;
      name: string;
      phone: string;
      updated_at: string;
      speed?: number;
      heading?: number;
    } | null;
  };
  distances: any;
  events: any[];
}

const ACTIVE_STATUSES = ['confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'on_the_way'];

const STATUS_FLOW = [
  { key: 'confirmed', icon: CheckCircle2, de: 'Bestellung angenommen', ar: 'تم قبول الطلب', en: 'Order accepted' },
  { key: 'preparing', icon: ChefHat, de: 'Wird vorbereitet', ar: 'قيد التحضير', en: 'Preparing' },
  { key: 'ready', icon: Package, de: 'Bereit zur Abholung', ar: 'جاهز للاستلام', en: 'Ready' },
  { key: 'picked_up', icon: Truck, de: 'Unterwegs zu Ihnen', ar: 'في الطريق إليك', en: 'On the way' },
  { key: 'delivered', icon: CheckCircle2, de: 'Zugestellt', ar: 'تم التوصيل', en: 'Delivered' },
];

export default function TrackOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'polling'>('connecting');
  const [eta, setEta] = useState<{ distanceKm: number; minutes: number } | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [bottomExpanded, setBottomExpanded] = useState(true);

  const loadTracking = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/orders/track?order_id=${orderId}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setLoadError(
          locale === 'ar' ? `خطأ في الخادم (${res.status})` : locale === 'en' ? `Server error (${res.status})` : `Serverfehler (${res.status})`
        );
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setTracking(data);
        setLoadError(null);
      } else {
        setLoadError(
          locale === 'ar' ? 'فشل تحميل بيانات التتبع' : locale === 'en' ? 'Failed to load tracking' : 'Tracking-Daten konnten nicht geladen werden'
        );
      }
    } catch {
      setLoadError(locale === 'ar' ? 'خطأ في الشبكة' : locale === 'en' ? 'Network error' : 'Netzwerkfehler');
    } finally {
      setLoading(false);
    }
  }, [orderId, locale]);

  useEffect(() => {
    if (!orderId) return;
    loadTracking();
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribeToOrder(orderId, () => loadTracking());
      setRealtimeStatus('connected');
    } catch {
      setRealtimeStatus('polling');
    }
    const interval = setInterval(loadTracking, 12000);
    return () => {
      clearInterval(interval);
      unsubscribe?.();
    };
  }, [orderId, loadTracking]);

  // Compute ETA via the server endpoint (Directions API) when driver + customer are known
  useEffect(() => {
    const driver = tracking?.positions?.driver;
    const customer = tracking?.positions?.customer;
    if (!driver || !customer) {
      setEta(null);
      return;
    }
    let cancelled = false;
    const compute = async () => {
      setEtaLoading(true);
      try {
        const res = await fetch('/api/maps/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'directions',
            origin: { lat: driver.lat, lng: driver.lng },
            destination: { lat: customer.lat, lng: customer.lng },
            mode: 'driving',
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && data?.data) {
          setEta({
            distanceKm: data.data.distanceMeters / 1000,
            minutes: Math.ceil(data.data.durationSeconds / 60),
          });
        } else {
          // Haversine fallback
          const R = 6371;
          const dLat = ((customer.lat - driver.lat) * Math.PI) / 180;
          const dLng = ((customer.lng - driver.lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((driver.lat * Math.PI) / 180) *
              Math.cos((customer.lat * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          setEta({ distanceKm: km, minutes: Math.ceil((km / 25) * 60) });
        }
      } catch {
        // ignore ETA failure
      } finally {
        if (!cancelled) setEtaLoading(false);
      }
    };
    compute();
    // refresh ETA every 60s while driver is moving
    const interval = setInterval(compute, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tracking?.positions?.driver?.lat, tracking?.positions?.driver?.lng, tracking?.positions?.customer?.lat, tracking?.positions?.customer?.lng]);

  const isRtl = locale === 'ar';
  const orderStatus = tracking?.order.status;
  const isActive = orderStatus && ACTIVE_STATUSES.includes(orderStatus);
  const isDelivered = orderStatus === 'delivered';

  // Status timeline progress
  const currentStepIdx = useMemo(() => {
    if (!orderStatus) return -1;
    return STATUS_FLOW.findIndex((s) => s.key === orderStatus);
  }, [orderStatus]);

  return (
    <div className="min-h-screen bg-bg" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-xl border-b border-edge-light">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -m-2 text-text-secondary hover:text-white rounded-pill hover:bg-surface-elevated transition-all"
            aria-label={locale === 'ar' ? 'رجوع' : locale === 'en' ? 'Back' : 'Zurück'}
          >
            <ArrowLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-white truncate text-sm sm:text-base">
              {tracking?.order.order_number
                ? (locale === 'ar' ? `الطلب #${tracking.order.order_number}` : locale === 'en' ? `Order #${tracking.order.order_number}` : `Bestellung #${tracking.order.order_number}`)
                : (locale === 'ar' ? 'التتبع المباشر' : locale === 'en' ? 'Live tracking' : 'Live-Verfolgung')}
            </h1>
            <p className="text-xs text-text-muted">
              {isDelivered
                ? (locale === 'ar' ? 'تم التوصيل' : locale === 'en' ? 'Delivered' : 'Zugestellt')
                : isActive
                ? (locale === 'ar' ? 'في الطريق إليك' : locale === 'en' ? 'On the way' : 'Live unterwegs')
                : (locale === 'ar' ? 'جارٍ التحميل...' : locale === 'en' ? 'Loading...' : 'Wird geladen...')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                realtimeStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
                realtimeStatus === 'polling' ? 'bg-brand-yellow-400' : 'bg-text-muted'
              )}
              title={realtimeStatus}
            />
            {tracking && (
              <ShareTrackingButton
                orderId={orderId}
                restaurantName={tracking.order.restaurants?.name}
              />
            )}
          </div>
        </div>
      </div>

      {/* Full-screen map */}
      <div className="relative w-full h-[55vh] sm:h-[60vh] bg-ink-800">
        {loadError && !tracking ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
            <AlertTriangle className="w-12 h-12 text-brand-yellow-400 mb-3" />
            <p className="text-base font-semibold text-white mb-1">
              {locale === 'ar' ? 'حدث خطأ' : locale === 'en' ? 'Something went wrong' : 'Etwas ist schiefgelaufen'}
            </p>
            <p className="text-sm text-text-muted mb-4">{loadError}</p>
            <button
              onClick={() => loadTracking()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-brand-gradient text-white text-sm font-bold"
            >
              <RefreshCw className="w-4 h-4" />
              {locale === 'ar' ? 'إعادة المحاولة' : locale === 'en' ? 'Try again' : 'Erneut versuchen'}
            </button>
          </div>
        ) : !tracking ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-text-muted" />
          </div>
        ) : (
          <LiveTrackingMap
            restaurant={tracking.positions.restaurant ? { lat: tracking.positions.restaurant.lat, lng: tracking.positions.restaurant.lng } : null}
            customer={tracking.positions.customer ? { lat: tracking.positions.customer.lat, lng: tracking.positions.customer.lng } : null}
            driver={tracking.positions.driver ? { lat: tracking.positions.driver.lat, lng: tracking.positions.driver.lng, heading: tracking.positions.driver.heading, speed: tracking.positions.driver.speed } : null}
            route={isDelivered ? 'idle' : 'to_customer'}
          />
        )}

        {/* Floating ETA card on the map */}
        {tracking && eta && !isDelivered && (
          <div className="absolute top-4 inset-x-4 sm:inset-x-auto sm:end-4 sm:start-auto z-10 sm:max-w-xs">
            <div className="rounded-2xl bg-bg/95 backdrop-blur-xl border border-edge-light shadow-2xl shadow-black/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-pill bg-brand-gradient flex items-center justify-center">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                    {locale === 'ar' ? 'الوقت المتوقع للوصول' : locale === 'en' ? 'Estimated arrival' : 'Voraussichtliche Ankunft'}
                  </p>
                  <p className="text-xl font-black text-white tabular-nums leading-none">
                    {eta.minutes} {locale === 'ar' ? 'دقيقة' : locale === 'en' ? 'min' : 'Min'}
                  </p>
                </div>
                {etaLoading && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
              </div>
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Navigation2 className="w-3 h-3" />
                <span className="tabular-nums font-bold">
                  {eta.distanceKm < 1
                    ? `${Math.round(eta.distanceKm * 1000)} m`
                    : `${eta.distanceKm.toFixed(1)} km`}
                </span>
                {tracking.positions.driver?.speed != null && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">
                      {Math.round(Number(tracking.positions.driver.speed) * 3.6)} km/h
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      {tracking && (
        <div className="relative -mt-6 z-20 rounded-t-3xl bg-bg border-t border-edge-light shadow-2xl shadow-black/40">
          <div className="max-w-3xl mx-auto px-4 py-3 sm:py-5 space-y-4">
            {/* Drag handle */}
            <div className="flex justify-center -mt-1">
              <div className="w-12 h-1 rounded-full bg-edge" />
            </div>

            {/* Driver card */}
            {tracking.positions.driver && !isDelivered && (
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-700/5 border border-emerald-500/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
                    <Truck className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                      {locale === 'ar' ? 'سائقك' : locale === 'en' ? 'Your driver' : 'Ihr Fahrer'}
                    </p>
                    <p className="text-base sm:text-lg font-extrabold text-white truncate">
                      {tracking.positions.driver.name || (locale === 'ar' ? 'السائق' : locale === 'en' ? 'Driver' : 'Fahrer')}
                    </p>
                    {tracking.positions.driver.phone && (
                      <p className="text-xs text-text-muted tabular-nums" dir="ltr">
                        {tracking.positions.driver.phone}
                      </p>
                    )}
                  </div>
                  {tracking.positions.driver.phone && (
                    <a
                      href={`tel:${tracking.positions.driver.phone}`}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-success/20 text-success hover:bg-success/30 flex items-center justify-center flex-shrink-0 transition-all"
                      aria-label={locale === 'ar' ? 'اتصل' : locale === 'en' ? 'Call' : 'Anrufen'}
                    >
                      <Phone className="w-5 h-5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Status timeline */}
            <div className="rounded-2xl bg-surface-elevated border border-edge-light p-4">
              <h3 className="font-extrabold text-white text-sm mb-3">
                {locale === 'ar' ? 'حالة الطلب' : locale === 'en' ? 'Order status' : 'Bestellstatus'}
              </h3>
              <div className="relative">
                <div className="absolute top-4 start-4 bottom-4 w-0.5 bg-edge" aria-hidden />
                {STATUS_FLOW.map((step, i) => {
                  const isPast = currentStepIdx > i;
                  const isCurrent = currentStepIdx === i;
                  const isLast = i === STATUS_FLOW.length - 1;
                  const Icon = step.icon;
                  const label = (step as any)[locale] ?? step.de;
                  return (
                    <div key={step.key} className="flex items-center gap-3 relative py-2">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all',
                          isPast
                            ? 'bg-emerald-500 text-white'
                            : isCurrent
                            ? 'bg-brand-gradient text-white shadow-glow'
                            : 'bg-ink-700 text-text-muted border-2 border-edge',
                          isCurrent && 'animate-pulse'
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span
                        className={cn(
                          'text-sm flex-1 transition-colors',
                          isPast || isCurrent ? 'text-white font-extrabold' : 'text-text-muted'
                        )}
                      >
                        {label}
                      </span>
                      {isPast && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {isCurrent && (
                        <span className="text-[10px] text-brand-500 font-extrabold uppercase tracking-wider">
                          {locale === 'ar' ? 'الآن' : locale === 'en' ? 'Now' : 'Jetzt'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Locations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tracking.positions.restaurant && (
                <div className="rounded-2xl bg-surface-elevated border border-edge-light p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-pill bg-brand-500/15 text-brand-500 flex items-center justify-center flex-shrink-0">
                      <Store className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                        {locale === 'ar' ? 'استلام من' : locale === 'en' ? 'Pickup from' : 'Abholung bei'}
                      </p>
                      <p className="text-sm font-extrabold text-white truncate">
                        {tracking.positions.restaurant.name || (locale === 'ar' ? 'المطعم' : locale === 'en' ? 'Restaurant' : 'Restaurant')}
                      </p>
                      {tracking.order.restaurants?.address && (
                        <p className="text-xs text-text-muted truncate">{tracking.order.restaurants.address}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tracking.positions.customer && (
                <div className="rounded-2xl bg-surface-elevated border border-edge-light p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-pill bg-emerald-500/15 text-emerald-400 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                        {locale === 'ar' ? 'التوصيل إلى' : locale === 'en' ? 'Delivery to' : 'Lieferung an'}
                      </p>
                      <p className="text-sm font-extrabold text-white truncate">
                        {typeof tracking.order.delivery_address === 'string'
                          ? tracking.order.delivery_address
                          : (tracking.order.delivery_address as any)?.address || (locale === 'ar' ? 'عنوانك' : locale === 'en' ? 'Your address' : 'Ihre Adresse')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Order total / share */}
            {tracking.order.total != null && (
              <div className="rounded-2xl bg-surface-elevated border border-edge-light p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                    {locale === 'ar' ? 'المجموع' : locale === 'en' ? 'Total' : 'Gesamt'}
                  </p>
                  <p className="text-lg font-black text-white tabular-nums">{formatEUR(Number(tracking.order.total))}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/orders/${orderId}`)}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-pill bg-ink-700 border border-edge text-text-secondary hover:text-white text-xs font-bold transition-all"
                >
                  {locale === 'ar' ? 'تفاصيل الطلب' : locale === 'en' ? 'Order details' : 'Bestelldetails'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
