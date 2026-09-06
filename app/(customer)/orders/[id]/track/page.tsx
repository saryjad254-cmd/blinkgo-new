'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Headphones from 'lucide-react/dist/esm/icons/headphones';
import Check from 'lucide-react/dist/esm/icons/check';
import Phone from 'lucide-react/dist/esm/icons/phone';
import MessageSquare from 'lucide-react/dist/esm/icons/message-square';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Bike from 'lucide-react/dist/esm/icons/bike';
import Store from 'lucide-react/dist/esm/icons/store';
import PackageCheck from 'lucide-react/dist/esm/icons/package-check';
import Wifi from 'lucide-react/dist/esm/icons/wifi';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import KeyRound from 'lucide-react/dist/esm/icons/key-round';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { BlinkLogo } from '@/components/brand/BlinkLogo';
import { LiveTrackingMap } from '@/components/tracking/LiveTrackingMap';

interface Position {
  lat: number;
  lng: number;
  name?: string;
  phone?: string | null;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  updated_at?: string;
}

interface TrackingPayload {
  order: {
    id: string;
    order_number: string;
    restaurant_name: string | null;
    restaurant_phone: string | null;
    restaurant_eta_minutes: number | null;
    status: string;
    fulfillment_type: 'delivery' | 'pickup';
    pickup_code: string | null;
    restaurant_address: string | null;
  };
  positions: {
    restaurant: Position | null;
    customer: Position | null;
    driver: Position | null;
  };
  distances: {
    driver_to_customer: number | null;
    driver_to_pickup: number | null;
    restaurant_to_customer?: number | null;
    eta_minutes: number | null;
  };
  journey: {
    arrived_pickup_at: string | null;
    arrived_dropoff_at: string | null;
    driver_stage: 'unassigned' | 'to_pickup' | 'at_pickup' | 'to_dropoff' | 'at_dropoff';
    delivery_pin: string | null;
    eta: { minutes: number | null; source: 'live_route' | 'restaurant_estimate' | 'unavailable'; delayed: boolean; updated_at: string | null };
    latest_issue: { code: string; reported_at: string | null } | null;
  };
}

const COPY = {
  de: {
    back: 'Zurück', support: 'Support', title: 'Live-Bestellverfolgung', live: 'Live',
    received: 'Bestätigt', preparing: 'Zubereitung', way: 'Unterwegs', delivered: 'Geliefert',
    refreshing: 'Aktualisierung…', updated: 'Zuletzt aktualisiert', refresh: 'Jetzt aktualisieren',
    loadError: 'Die Live-Daten konnten nicht geladen werden.', retry: 'Erneut versuchen',
    routeUnavailable: 'Die Route erscheint, sobald Restaurant- und Lieferposition verfügbar sind.',
    waitingDriver: 'Fahrer wird gesucht', waitingDriverBody: 'Sobald ein Fahrer zugewiesen ist, erscheinen Standort und Ankunftszeit hier.',
    eta: 'voraussichtliche Ankunft', restaurantEta: 'Geschätzte Lieferzeit', assigned: 'Fahrer zugewiesen', away: 'vom Lieferort',
    call: 'Anrufen', message: 'Nachricht', order: 'Bestellung', details: 'Bestelldetails', contactRestaurant: 'Restaurant anrufen',
    cancelled: 'Diese Bestellung wurde storniert.', preparingBody: 'Das Restaurant bearbeitet deine Bestellung.',
    deliveredSuccess: 'Erfolgreich zugestellt', deliveredByDriver: 'Die Lieferung wurde abgeschlossen',
    mapRestaurant: 'Restaurant', mapCustomer: 'Lieferadresse', mapDriver: 'Fahrer',
    offline: 'Offline – zuletzt geladene Daten werden angezeigt', arrivedPickup: 'Fahrer wartet im Restaurant', arrivedPickupBody: 'Die Wartezeit wird live erfasst. Dein Fahrer übernimmt die Bestellung, sobald sie bereit ist.', arrivedDropoff: 'Dein Fahrer ist angekommen', arrivedDropoffBody: 'Bitte halte dich an der Lieferadresse bereit und achte auf Anruf oder Nachricht.', waitingFor: 'Wartezeit', deliveryPin: 'Dein Liefercode', deliveryPinBody: 'Nenne diesen Code dem Fahrer erst bei der Übergabe.', delayTitle: 'Deine Lieferung braucht etwas mehr Zeit', revisedEta: 'Aktualisierte Live-Ankunft', delayHelp: 'Hilfe erhalten', delayPolicy: 'BlinkGo verspricht keine automatische Entschädigung. Der Support kann die Lieferung bei Bedarf fair prüfen.',
  },
  ar: {
    back: 'رجوع', support: 'الدعم', title: 'تتبّع الطلب مباشرة', live: 'مباشر',
    received: 'تم التأكيد', preparing: 'قيد التحضير', way: 'في الطريق', delivered: 'تم التسليم',
    refreshing: 'جارٍ التحديث…', updated: 'آخر تحديث', refresh: 'تحديث الآن',
    loadError: 'تعذّر تحميل بيانات التتبّع المباشر.', retry: 'إعادة المحاولة',
    routeUnavailable: 'سيظهر المسار فور توفر موقع المطعم وعنوان التسليم.',
    waitingDriver: 'جارٍ البحث عن سائق', waitingDriverBody: 'عند تعيين السائق سيظهر موقعه ووقت الوصول هنا مباشرة.',
    eta: 'وقت الوصول المتوقع', restaurantEta: 'مدة التوصيل التقديرية', assigned: 'تم تعيين السائق', away: 'عن عنوان التوصيل',
    call: 'اتصال', message: 'مراسلة', order: 'الطلب', details: 'تفاصيل الطلب', contactRestaurant: 'اتصال بالمطعم',
    cancelled: 'تم إلغاء هذا الطلب.', preparingBody: 'المطعم يعمل الآن على تجهيز طلبك.',
    deliveredSuccess: 'تم التسليم بنجاح', deliveredByDriver: 'اكتملت عملية التوصيل',
    mapRestaurant: 'المطعم', mapCustomer: 'عنوان التوصيل', mapDriver: 'السائق',
    offline: 'أنت غير متصل – يتم عرض آخر بيانات محفوظة', arrivedPickup: 'السائق ينتظر في المطعم', arrivedPickupBody: 'يتم تسجيل وقت الانتظار مباشرة، وسيستلم السائق الطلب فور جهوزه.', arrivedDropoff: 'وصل السائق إلى عنوانك', arrivedDropoffBody: 'يرجى الاستعداد عند عنوان التوصيل والانتباه للاتصال أو الرسالة.', waitingFor: 'مدة الانتظار', deliveryPin: 'رمز التسليم الخاص بك', deliveryPinBody: 'أعطِ هذا الرمز للسائق فقط عند استلام الطلب.', delayTitle: 'طلبك يحتاج إلى وقت إضافي قليل', revisedEta: 'وقت الوصول المحدّث مباشرة', delayHelp: 'الحصول على مساعدة', delayPolicy: 'لا تعد BlinkGo بتعويض تلقائي. يستطيع الدعم مراجعة التوصيل بشكل عادل عند الحاجة.',
  },
  en: {
    back: 'Back', support: 'Support', title: 'Live order tracking', live: 'Live',
    received: 'Confirmed', preparing: 'Preparing', way: 'On the way', delivered: 'Delivered',
    refreshing: 'Updating…', updated: 'Last updated', refresh: 'Refresh now',
    loadError: 'Live tracking data could not be loaded.', retry: 'Try again',
    routeUnavailable: 'The route will appear as soon as the restaurant and delivery locations are available.',
    waitingDriver: 'Finding your driver', waitingDriverBody: 'The driver location and arrival time will appear here once assigned.',
    eta: 'estimated arrival', restaurantEta: 'Estimated delivery time', assigned: 'Driver assigned', away: 'from delivery address',
    call: 'Call', message: 'Message', order: 'Order', details: 'Order details', contactRestaurant: 'Call restaurant',
    cancelled: 'This order was cancelled.', preparingBody: 'The restaurant is preparing your order.',
    deliveredSuccess: 'Delivered successfully', deliveredByDriver: 'The delivery has been completed',
    mapRestaurant: 'Restaurant', mapCustomer: 'Delivery address', mapDriver: 'Driver',
    offline: 'Offline – showing the latest saved data', arrivedPickup: 'Driver is waiting at the restaurant', arrivedPickupBody: 'Waiting time is tracked live. Your driver will collect the order as soon as it is ready.', arrivedDropoff: 'Your driver has arrived', arrivedDropoffBody: 'Please be ready at the delivery address and watch for a call or message.', waitingFor: 'Waiting time', deliveryPin: 'Your delivery code', deliveryPinBody: 'Share this code with the driver only when the order is handed to you.', delayTitle: 'Your delivery needs a little more time', revisedEta: 'Updated live ETA', delayHelp: 'Get help', delayPolicy: 'BlinkGo does not promise automatic compensation. Support can review the delivery fairly when needed.',
  },
} satisfies Record<Locale, Record<string, string>>;

const PICKUP_COPY = {
  de: {
    ready: 'Abholbereit', pickedUp: 'Abgeholt', preparing: 'Deine Bestellung wird zubereitet',
    code: 'Abholcode', codeBody: 'Zeige diesen Code dem Restaurantpersonal, sobald deine Bestellung bereit ist.',
    address: 'Abholort', navigate: 'Navigation öffnen', eta: 'Voraussichtlich abholbereit',
  },
  ar: {
    ready: 'جاهز للاستلام', pickedUp: 'تم الاستلام', preparing: 'طلبك قيد التحضير',
    code: 'رمز الاستلام', codeBody: 'أظهر هذا الرمز لموظف المطعم عندما يصبح طلبك جاهزًا.',
    address: 'موقع الاستلام', navigate: 'فتح الملاحة', eta: 'الوقت المتوقع للجاهزية',
  },
  en: {
    ready: 'Ready for pickup', pickedUp: 'Picked up', preparing: 'Your order is being prepared',
    code: 'Pickup code', codeBody: 'Show this code to the restaurant staff when your order is ready.',
    address: 'Pickup location', navigate: 'Open navigation', eta: 'Estimated ready time',
  },
} satisfies Record<Locale, Record<string, string>>;

const STATUS_STEP: Record<string, number> = {
  pending: 0, confirmed: 0, preparing: 1, ready: 1, assigned: 1,
  picked_up: 2, delivering: 2, on_the_way: 2, delivered: 3,
};

const PICKUP_STATUS_STEP: Record<string, number> = {
  pending: 0, confirmed: 0, preparing: 1, ready: 2, assigned: 2, picked_up: 3, delivered: 3,
};

export default function TrackOrderPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = String(params?.id ?? '');
  const { locale } = useI18n();
  const copy = COPY[locale];
  const pickupCopy = PICKUP_COPY[locale];
  const [data, setData] = useState<TrackingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mapRevision, setMapRevision] = useState(0);
  const status = data?.order.status ?? 'pending';
  const isDelivered = status === 'delivered';
  const isPickup = data?.order.fulfillment_type === 'pickup';

  const loadTracking = useCallback(async (silent = false) => {
    if (!orderId) return;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch(`/api/orders/track?order_id=${encodeURIComponent(orderId)}`, {
        credentials: 'include', cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? copy.loadError);
      setData(payload.data);
      setLastUpdated(new Date());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [copy.loadError, orderId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadTracking(), 0);
    const timer = isDelivered ? null : window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadTracking(true);
    }, 15_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadTracking(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(initialLoad);
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isDelivered, loadTracking]);

  const currentStep = (isPickup ? PICKUP_STATUS_STEP : STATUS_STEP)[status] ?? 0;
  const isCancelled = ['cancelled', 'could_not_deliver', 'refunded'].includes(status);
  const route = useMemo<'to_restaurant' | 'to_customer' | 'idle'>(() => (
    ['picked_up', 'delivering', 'on_the_way'].includes(status) ? 'to_customer' : 'to_restaurant'
  ), [status]);
  const distance = data?.distances.driver_to_customer;
  const eta = data?.journey?.eta?.minutes ?? data?.distances.eta_minutes;
  const restaurantEta = data?.order.restaurant_eta_minutes;
  const steps = isPickup ? [
    { label: copy.received, icon: Check },
    { label: copy.preparing, icon: Store },
    { label: pickupCopy.ready, icon: PackageCheck },
    { label: pickupCopy.pickedUp, icon: Check },
  ] : [
    { label: copy.received, icon: Check },
    { label: copy.preparing, icon: Store },
    { label: copy.way, icon: Bike },
    { label: copy.delivered, icon: PackageCheck },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas pb-24 text-ink-primary" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-3">
          <button type="button" onClick={() => router.push(`/orders/${orderId}`)} aria-label={copy.back} className="grid size-11 place-items-center rounded-full bg-surface-1 transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <ArrowLeft className={cn('size-5', locale === 'ar' && 'rotate-180')} />
          </button>
          <div className="flex flex-col items-center">
            <BlinkLogo variant="horizontal" size="sm" priority />
            <span className="mt-0.5 text-2xs font-bold text-text-muted">{copy.title}</span>
          </div>
          <Link href={`/help?order=${encodeURIComponent(orderId)}`} aria-label={copy.support} className="grid size-11 place-items-center rounded-full bg-surface-1 transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Headphones className="size-5" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-3 py-4 sm:px-6">
        <section aria-label={copy.title} className="rounded-2xl border border-[var(--border)] bg-surface-1 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{copy.order}</p>
              <h1 className="mt-1 text-lg font-black">#{data?.order.order_number ?? orderId.slice(0, 8)}</h1>
              <p className="mt-0.5 text-sm text-text-secondary">{data?.order.restaurant_name ?? '—'}</p>
            </div>
            <div className="flex items-center justify-between gap-2 sm:shrink-0 sm:justify-start">
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-success/10 px-3 text-xs font-bold text-success">{isDelivered ? <PackageCheck className="size-3.5" /> : <Wifi className="size-3.5" />}{isDelivered ? copy.delivered : copy.live}</span>
              <button type="button" onClick={() => void loadTracking(true)} disabled={refreshing} aria-label={copy.refresh} className="grid size-11 place-items-center rounded-xl bg-surface-2 text-text-secondary hover:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              </button>
            </div>
          </div>
          <p className="mt-3 text-2xs text-text-muted" aria-live="polite">{refreshing ? copy.refreshing : lastUpdated ? `${copy.updated}: ${lastUpdated.toLocaleTimeString(locale === 'ar' ? 'ar' : locale)}` : ''}</p>
        </section>

        {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"><span className="flex items-center gap-2"><AlertTriangle className="size-5 shrink-0" />{copy.loadError}</span><button type="button" onClick={() => void loadTracking()} className="min-h-11 rounded-xl bg-danger px-4 font-bold text-white">{copy.retry}</button></div>}

        <section className="rounded-2xl border border-[var(--border)] bg-surface-1 px-3 py-5">
          <ol className="flex items-start" aria-label={copy.title}>
            {steps.map((step, index) => {
              const done = index < currentStep;
              const active = index === currentStep;
              const Icon = step.icon;
              return <li key={step.label} className={cn('flex items-start', index < steps.length - 1 ? 'flex-1' : 'shrink-0')}>
                <div className="flex w-16 flex-col items-center gap-2 text-center sm:w-20">
                  <div aria-current={active ? 'step' : undefined} className={cn('grid size-10 place-items-center rounded-full border-2 transition', (done || active) ? 'border-brand bg-brand text-white' : 'border-[var(--border)] bg-surface-2 text-text-muted', active && 'ring-4 ring-brand/20')}><Icon className="size-5" /></div>
                  <span className={cn('text-[10px] font-bold leading-tight sm:text-xs', (done || active) ? 'text-ink-primary' : 'text-text-muted')}>{step.label}</span>
                </div>
                {index < steps.length - 1 && <div aria-hidden className={cn('mt-5 h-0.5 min-w-3 flex-1', index < currentStep ? 'bg-brand' : 'bg-surface-3')} />}
              </li>;
            })}
          </ol>
          {isCancelled && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-center text-sm font-bold text-danger">{copy.cancelled}</p>}
        </section>

        {isPickup && data ? (
          <section data-testid="customer-pickup-tracking" className="rounded-3xl border border-brand-yellow-500/30 bg-gradient-to-br from-brand-yellow-500/10 to-surface-1 p-5">
            <div className="flex items-start gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-yellow-500/15 text-brand-yellow-500"><Store className="size-6" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black text-brand-yellow-500">{['ready', 'assigned', 'picked_up', 'delivered'].includes(status) ? pickupCopy.ready : pickupCopy.preparing}</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">{pickupCopy.codeBody}</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-brand-yellow-500/20 bg-black/20 p-4 text-center">
              <p className="text-xs font-black uppercase tracking-wider text-brand-yellow-500">{pickupCopy.code}</p>
              <strong className="mt-2 block font-mono text-4xl font-black tracking-[0.22em] text-white" dir="ltr" aria-label={`${pickupCopy.code}: ${(data.order.pickup_code ?? '').split('').join(' ')}`}>{data.order.pickup_code || '••••••'}</strong>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-black/15 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-xs font-bold text-text-muted">{pickupCopy.address}</p><p className="mt-1 text-sm font-bold leading-6">{data.order.restaurant_address || data.order.restaurant_name}</p></div>
              {data.positions.restaurant ? <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${data.positions.restaurant.lat},${data.positions.restaurant.lng}`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-yellow-500 px-4 text-sm font-black text-black"><MapPin className="size-4" />{pickupCopy.navigate}</a> : null}
            </div>
            {eta != null && eta > 0 ? <p className="mt-3 text-center text-xs font-bold text-text-muted"><Clock3 className="me-1 inline size-4" />{pickupCopy.eta}: <bdi>{eta} min</bdi></p> : null}
          </section>
        ) : null}

        {!isPickup && (data?.journey?.arrived_dropoff_at ? (
          <section data-testid="customer-driver-arrived" role="status" aria-live="polite" className="rounded-2xl border border-success/30 bg-success/10 p-4">
            <div className="flex items-center gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success/15 text-success"><Bike className="size-6" /></div><div><h2 className="font-black text-success">{copy.arrivedDropoff}</h2><p className="mt-1 text-sm leading-5 text-text-secondary">{copy.arrivedDropoffBody}</p></div></div>
          </section>
        ) : data?.journey?.arrived_pickup_at && !['picked_up', 'delivering', 'delivered'].includes(status) ? (
          <section data-testid="customer-driver-waiting" role="status" aria-live="polite" className="rounded-2xl border border-brand-yellow-500/30 bg-brand-yellow-500/10 p-4">
            <div className="flex items-center gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-yellow-500/15 text-brand-yellow-500"><Store className="size-6" /></div><div className="min-w-0 flex-1"><h2 className="font-black text-brand-yellow-500">{copy.arrivedPickup}</h2><p className="mt-1 text-sm leading-5 text-text-secondary">{copy.arrivedPickupBody}</p></div><div className="shrink-0 text-center"><p className="text-[10px] font-bold uppercase text-text-muted">{copy.waitingFor}</p><ElapsedSince since={data.journey.arrived_pickup_at} /></div></div>
          </section>
        ) : null)}

        {!isPickup && data?.journey?.delivery_pin && <section data-testid="customer-delivery-pin" className="rounded-2xl border border-brand/30 bg-brand/10 p-4"><div className="flex items-center gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand/15 text-brand"><KeyRound className="size-6" /></div><div className="min-w-0 flex-1"><h2 className="font-black text-brand">{copy.deliveryPin}</h2><p className="mt-1 text-xs leading-5 text-text-secondary">{copy.deliveryPinBody}</p></div><p className="shrink-0 font-mono text-3xl font-black tracking-[.25em] text-white" dir="ltr" aria-label={`${copy.deliveryPin}: ${data.journey.delivery_pin.split('').join(' ')}`}>{data.journey.delivery_pin}</p></div></section>}

        {!isPickup && data?.journey?.latest_issue && !isDelivered && !isCancelled && <CustomerDeliveryIssue orderId={orderId} locale={locale} code={data.journey.latest_issue.code} eta={eta} copy={copy} />}

        {!isPickup && <section className="relative h-[340px] overflow-hidden rounded-3xl border border-[var(--border)] bg-surface-2 sm:h-[430px]">
          {loading && !data ? <div className="grid h-full place-items-center"><div className="flex items-center gap-2 text-sm text-text-muted"><RefreshCw className="size-5 animate-spin" />{copy.refreshing}</div></div> : data?.positions.restaurant && data.positions.customer ? (
            <LiveTrackingMap
              key={mapRevision}
              restaurant={data.positions.restaurant}
              customer={data.positions.customer}
              driver={data.positions.driver}
              route={route}
              height="100%"
              labels={{ restaurant: copy.mapRestaurant, customer: copy.mapCustomer, driver: copy.mapDriver }}
            />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,rgba(225,6,0,.12),transparent_60%)] p-8 text-center">
              <div><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand/10 text-brand"><MapPin className="size-8" /></div><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-text-secondary">{copy.routeUnavailable}</p></div>
            </div>
          )}
          {data?.positions.restaurant && data.positions.customer && <button type="button" onClick={() => setMapRevision((value) => value + 1)} aria-label={copy.refresh} className="absolute bottom-4 start-4 z-10 grid size-11 place-items-center rounded-xl border border-white/10 bg-canvas/90 text-white shadow-xl backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><MapPin className="size-5" /></button>}
          <div className="absolute bottom-4 end-4 z-10 rounded-2xl border border-white/10 bg-canvas/90 px-4 py-3 text-center shadow-xl backdrop-blur">
            <p className="text-xl font-black text-brand">{isDelivered ? <PackageCheck className="mx-auto size-6" /> : eta != null ? `${eta} min` : restaurantEta != null ? `${restaurantEta} min` : '—'}</p>
            <p className="mt-0.5 text-[10px] font-bold text-text-muted">{isDelivered ? copy.deliveredSuccess : eta != null ? copy.eta : copy.restaurantEta}</p>
          </div>
        </section>}

        {!isPickup && (data?.positions.driver ? <section className="rounded-2xl border border-[var(--border)] bg-surface-1 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-yellow-500 text-xl font-black text-white">{(data.positions.driver.name ?? 'D').slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-black">{data.positions.driver.name ?? copy.assigned}</h2><p className="text-xs text-text-muted">{isDelivered ? copy.deliveredByDriver : distance != null ? `${distance.toFixed(1)} km ${copy.away}` : copy.assigned}</p></div>
            <div className="flex gap-2">
              {data.positions.driver.phone && <a href={`tel:${data.positions.driver.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white"><Phone className="size-4" />{copy.call}</a>}
              <Link href={`/help/chat?order=${encodeURIComponent(orderId)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-surface-2 px-4 text-sm font-bold"><MessageSquare className="size-4" />{copy.message}</Link>
            </div>
          </div>
        </section> : <section className="rounded-2xl border border-brand/20 bg-brand/5 p-4"><div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-xl bg-brand/10 text-brand"><Bike className="size-6" /></div><div><h2 className="font-black">{copy.waitingDriver}</h2><p className="mt-1 text-xs leading-5 text-text-muted">{status === 'preparing' ? copy.preparingBody : copy.waitingDriverBody}</p></div></div></section>)}

        <section className="grid gap-3 sm:grid-cols-2">
          <Link href={`/orders/${encodeURIComponent(orderId)}`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand px-5 font-black text-white shadow-lg shadow-brand/20 transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><PackageCheck className="size-5" />{copy.details}</Link>
          <div className="grid grid-cols-2 gap-3">
            <Link href={`/help/chat?order=${encodeURIComponent(orderId)}`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-surface-1 px-3 text-sm font-bold transition hover:bg-surface-2"><MessageSquare className="size-4" />{copy.message}</Link>
            {data?.order.restaurant_phone ? <a href={`tel:${data.order.restaurant_phone}`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-surface-1 px-3 text-sm font-bold transition hover:bg-surface-2"><Phone className="size-4" />{copy.call}</a> : <button type="button" disabled className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-surface-1 px-3 text-sm font-bold text-text-muted opacity-60"><Phone className="size-4" />{copy.call}</button>}
          </div>
        </section>
      </main>
    </div>
  );
}

function CustomerDeliveryIssue({ orderId, locale, code, eta, copy }: { orderId: string; locale: Locale; code: string; eta: number | null | undefined; copy: Record<string, string> }) {
  const issueCopy: Record<string, Record<Locale, string>> = {
    restaurant_delay: { de: 'Das Restaurant benötigt etwas mehr Zeit. Dein Fahrer wartet bereits und die Zeit wird live erfasst.', ar: 'يحتاج المطعم إلى وقت إضافي قليل. السائق ينتظر ويتم تحديث الوقت مباشرة.', en: 'The restaurant needs a little more time. Your driver is waiting and the timing is tracked live.' },
    order_not_ready: { de: 'Die Bestellung war bei Ankunft des Fahrers noch nicht abholbereit.', ar: 'لم يكن الطلب جاهزًا عند وصول السائق إلى المطعم.', en: 'The order was not ready when your driver arrived at the restaurant.' },
    cannot_find_restaurant: { de: 'Der Fahrer sucht den Abholort. BlinkGo verfolgt die Situation.', ar: 'السائق يبحث عن موقع الاستلام وBlinkGo يتابع الحالة.', en: 'The driver is locating the pickup point. BlinkGo is monitoring the situation.' },
    cannot_find_customer: { de: 'Der Fahrer sucht die Lieferadresse. Bitte prüfe deine Adressangaben und dein Telefon.', ar: 'السائق يبحث عن عنوان التوصيل. تحقق من العنوان وهاتفك.', en: 'The driver is locating your delivery address. Please check your address and phone.' },
    customer_unreachable: { de: 'Der Fahrer versucht dich zu erreichen. Bitte prüfe Anrufe und Nachrichten.', ar: 'يحاول السائق التواصل معك. تحقق من المكالمات والرسائل.', en: 'The driver is trying to reach you. Please check your calls and messages.' },
    damaged_order: { de: 'Bei der Lieferung wurde ein Problem gemeldet. BlinkGo Support wurde informiert.', ar: 'تم الإبلاغ عن مشكلة في الطلب وتم إبلاغ دعم BlinkGo.', en: 'A delivery issue was reported and BlinkGo support has been informed.' },
    unsafe_situation: { de: 'Es gibt eine wichtige Sicherheitsmeldung. BlinkGo Support wurde informiert.', ar: 'يوجد تنبيه سلامة مهم وتم إبلاغ دعم BlinkGo.', en: 'There is an important safety update and BlinkGo support has been informed.' },
  };
  const body = issueCopy[code]?.[locale] ?? (locale === 'ar' ? 'وصل تحديث جديد من السائق حول عملية التوصيل.' : locale === 'en' ? 'Your driver shared a new delivery update.' : 'Dein Fahrer hat eine neue Liefermeldung gesendet.');
  const urgent = ['damaged_order', 'unsafe_situation'].includes(code);
  return <section data-testid="customer-delivery-delay" role="status" aria-live="polite" className={cn('rounded-2xl border p-4', urgent ? 'border-danger/30 bg-danger/10' : 'border-brand-yellow-500/30 bg-brand-yellow-500/10')}>
    <div className="flex items-start gap-3"><div className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', urgent ? 'bg-danger/15 text-danger' : 'bg-brand-yellow-500/15 text-brand-yellow-500')}><AlertTriangle className="size-6" /></div><div className="min-w-0 flex-1"><h2 className={cn('font-black', urgent ? 'text-danger' : 'text-brand-yellow-500')}>{copy.delayTitle}</h2><p className="mt-1 text-sm leading-6 text-text-secondary">{body}</p>{eta != null && <div className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-black/15 px-3 text-sm font-black"><Clock3 className="size-4" /><span>{copy.revisedEta}: <bdi>{eta} min</bdi></span></div>}</div></div>
    <div className="mt-3 flex flex-col gap-2 border-t border-current/10 pt-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-text-muted">{copy.delayPolicy}</p><Link href={`/customer/support?new=1&order=${encodeURIComponent(orderId)}`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-surface-1 px-4 text-sm font-black hover:bg-surface-2"><Headphones className="size-4" />{copy.delayHelp}</Link></div>
  </section>;
}

function ElapsedSince({ since }: { since: string }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000)));
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000))), 1_000);
    return () => window.clearInterval(timer);
  }, [since]);
  return <p className="mt-1 font-mono text-lg font-black tabular-nums text-brand-yellow-500" dir="ltr">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</p>;
}
