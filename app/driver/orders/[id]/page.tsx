import { notFound } from 'next/navigation';
import {
  Phone,
  Navigation,
  Building,
  MessageSquare,
  CheckCircle2,
  Truck,
  ChefHat,
  Clock,
  Package,
  AlertCircle,
  MapPin,
  ExternalLink,
  Copy,
  Star,
  Receipt,
  ArrowUpRight,
  Home,
} from 'lucide-react';
import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PageHeader } from '@/components/shared/PageHeader';
import { OrderActions } from '@/components/driver/OrderActions';
import { formatEUR } from '@/lib/format';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import Link from 'next/link';
import { ActiveDeliveryMap } from '@/components/driver/ActiveDeliveryMap';
import { computeEarnings } from '@/lib/services/driver-earnings';

export const dynamic = 'force-dynamic';

interface DeliveryAddress {
  formatted_address?: string;
  address?: string;
  street?: string;
  city?: string;
  postal?: string;
  country?: string;
  lat?: number;
  lng?: number;
  floor?: string;
  door?: string;
  instructions?: string;
}

function parseDeliveryAddress(raw: any) {
  const empty = {
    text: '—', street: null as string | null, city: null as string | null, postal: null as string | null,
    country: null as string | null, lat: null as number | null, lng: null as number | null,
    floor: null as string | null, door: null as string | null, instructions: null as string | null,
  };
  if (!raw) return empty;
  if (typeof raw === 'string') {
    try { return parseDeliveryAddress(JSON.parse(raw)); } catch { return { ...empty, text: raw }; }
  }
  if (typeof raw === 'object') {
    const a = raw as DeliveryAddress;
    return {
      text: a.formatted_address || a.address || a.street || '—',
      street: a.street ?? null,
      city: a.city ?? null,
      postal: a.postal ?? null,
      country: a.country ?? null,
      lat: a.lat ?? null,
      lng: a.lng ?? null,
      floor: a.floor ?? null,
      door: a.door ?? null,
      instructions: a.instructions ?? null,
    };
  }
  return { ...empty, text: String(raw) };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getOrder(id: string, driverId: string) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const serviceClient = createServiceClient();

  const { data: order, error } = await serviceClient
    .from('orders')
    .select(`*, restaurants(name, address, phone, latitude, longitude)`)
    .eq('id', id)
    .or(`driver_id.eq.${driverId},driver_id.is.null`)
    .single();

  if (error || !order) return null;

  const { data: items } = await serviceClient
    .from('order_items')
    .select('*')
    .eq('order_id', id);

  let customerName = '';
  let customerPhone: string | null = null;
  if (order.customer_id) {
    const { data: cu } = await serviceClient.auth.admin.getUserById(order.customer_id);
    const meta = cu?.user?.user_metadata || {};
    customerName = meta.full_name || meta.name || cu?.user?.email?.split('@')[0] || '';
    customerPhone = meta.phone || cu?.user?.phone || null;
  }

  // Driver location (last known)
  let driverLat: number | null = null;
  let driverLng: number | null = null;
  try {
    const { data: ds } = await serviceClient
      .from('driver_status')
      .select('latitude, longitude')
      .eq('driver_id', driverId)
      .maybeSingle();
    if (ds?.latitude != null) {
      driverLat = Number(ds.latitude);
      driverLng = Number(ds.longitude);
    }
  } catch {}
  if (driverLat == null) {
    try {
      const { data: u } = await serviceClient.auth.admin.getUserById(driverId);
      const meta = u?.user?.user_metadata || {};
      if (meta.last_location_lat != null) {
        driverLat = Number(meta.last_location_lat);
        driverLng = Number(meta.last_location_lng);
      }
    } catch {}
  }

  return {
    order,
    items: items ?? [],
    customerName,
    customerPhone,
    deliveryAddress: parseDeliveryAddress(order.delivery_address),
    driverLat,
    driverLng,
  };
}

export default async function DriverOrderPage({ params }: { params: { id: string } }) {
  const { id: driverId } = await requireRole('driver');
  const { locale } = await getServerTranslations();
  const data = await getOrder(params.id, driverId);
  if (!data) notFound();

  const { order, items, customerName, customerPhone, deliveryAddress, driverLat, driverLng } = data;

  // Coordinates
  const restLat = order.restaurant_latitude ?? order.restaurants?.latitude;
  const restLng = order.restaurant_longitude ?? order.restaurants?.longitude;
  const customerLat = order.customer_latitude ?? deliveryAddress.lat;
  const customerLng = order.customer_longitude ?? deliveryAddress.lng;

  // Distances
  const distanceDriverToRestaurant = (driverLat != null && restLat != null && restLng != null)
    ? haversineKm(driverLat, driverLng!, restLat, restLng)
    : null;
  const distanceDriverToCustomer = (driverLat != null && customerLat != null && customerLng != null)
    ? haversineKm(driverLat, driverLng!, customerLat, customerLng)
    : null;
  const distanceRestaurantToCustomer = (restLat != null && customerLat != null)
    ? haversineKm(restLat, restLng!, customerLat, customerLng)
    : null;

  // Current phase
  const restaurantPhase = ['confirmed', 'preparing', 'ready'].includes(order.status);
  const customerPhase = ['picked_up', 'delivering'].includes(order.status);
  const isDelivered = order.status === 'delivered';

  // Earnings (server-side, single source of truth)
  const earnings = computeEarnings({ delivery_fee: order.delivery_fee, tip: order.tip });

  const isRtl = locale === 'ar';

  return (
    <div className="min-h-screen bg-bg pb-32" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top bar — minimal, big touch targets */}
      <div className="sticky top-0 z-sticky bg-bg-elevated/95 backdrop-blur-xl border-b border-edge">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/driver/dashboard"
            className="w-12 h-12 rounded-full bg-ink-700 text-text-secondary flex items-center justify-center touch-manipulation active:scale-95"
            aria-label="Back"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-extrabold">
              {restaurantPhase
                ? (locale === 'ar' ? 'اذهب إلى المطعم' : locale === 'en' ? 'Going to restaurant' : 'Auf dem Weg zum Restaurant')
                : customerPhase
                ? (locale === 'ar' ? 'اذهب إلى العميل' : locale === 'en' ? 'Going to customer' : 'Auf dem Weg zum Kunden')
                : (locale === 'ar' ? 'مكتمل' : locale === 'en' ? 'Completed' : 'Abgeschlossen')}
            </p>
            <h1 className="text-base font-extrabold text-white truncate">
              {order.restaurants?.name || (locale === 'ar' ? 'مطعم' : 'Restaurant')}
            </h1>
          </div>
          <div className="px-3 py-1.5 rounded-pill bg-emerald-500/15 text-emerald-400 text-xs font-extrabold">
            {formatEUR(earnings.total)}
          </div>
        </div>
      </div>

      {/* Status progress — big, glanceable */}
      <DeliveryStatusProgress
        status={order.status}
        locale={locale}
      />

      {/* Live map */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl overflow-hidden border border-edge">
          <ActiveDeliveryMap
            orderId={order.id}
            initialDriverLat={driverLat}
            initialDriverLng={driverLng}
            restaurantLat={restLat ?? null}
            restaurantLng={restLng ?? null}
            customerLat={customerLat}
            customerLng={customerLng}
            restaurantName={order.restaurants?.name}
            customerName={customerName}
            driverIsPrimary={restaurantPhase}
          />
        </div>
      </div>

      {/* Big distance / ETA pills */}
      <div className="px-4 pt-4 space-y-3">
        {restaurantPhase && distanceDriverToRestaurant != null && (
          <DistanceCard
            icon={Building}
            label={locale === 'ar' ? 'المطعم' : locale === 'en' ? 'Restaurant' : 'Restaurant'}
            destination={order.restaurants?.name || (locale === 'ar' ? 'مطعم' : 'Restaurant')}
            distance={distanceDriverToRestaurant}
            color="brand"
            locale={locale}
          />
        )}
        {customerPhase && distanceDriverToCustomer != null && (
          <DistanceCard
            icon={Home}
            label={locale === 'ar' ? 'العميل' : locale === 'en' ? 'Customer' : 'Kunde'}
            destination={customerName || (locale === 'ar' ? 'العميل' : locale === 'en' ? 'Customer' : 'Kunde')}
            distance={distanceDriverToCustomer}
            color="emerald"
            locale={locale}
          />
        )}
        {isDelivered && (
          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/40 p-5 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
            <p className="text-lg font-black text-emerald-400">
              {locale === 'ar' ? 'تم التوصيل' : locale === 'en' ? 'Delivered' : 'Zugestellt'}
            </p>
          </div>
        )}
        {!isDelivered && distanceRestaurantToCustomer != null && customerPhase && (
          <div className="rounded-2xl bg-ink-700/50 border border-edge p-3 flex items-center gap-3 text-xs">
            <Navigation className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span className="text-text-muted">
              {locale === 'ar'
                ? `المسافة من المطعم: ${distanceRestaurantToCustomer.toFixed(1)} كم`
                : locale === 'en'
                ? `Restaurant to customer: ${distanceRestaurantToCustomer.toFixed(1)} km`
                : `Restaurant → Kunde: ${distanceRestaurantToCustomer.toFixed(1)} km`}
            </span>
          </div>
        )}
      </div>

      {/* Customer / Restaurant info cards — context for the action */}
      <div className="px-4 pt-4 space-y-3">
        {/* Pickup (restaurant) info card */}
        {restaurantPhase && order.restaurants && (
          <PickupCard
            name={order.restaurants.name}
            address={order.restaurants.address}
            phone={order.restaurants.phone}
            locale={locale}
            lat={restLat}
            lng={restLng}
          />
        )}

        {/* Delivery (customer) info card */}
        {customerPhase && (
          <DeliveryCard
            name={customerName}
            address={deliveryAddress.text}
            phone={customerPhone}
            instructions={deliveryAddress.instructions}
            floor={deliveryAddress.floor}
            door={deliveryAddress.door}
            locale={locale}
            lat={customerLat}
            lng={customerLng}
          />
        )}

        {/* Items card — collapsible */}
        {items.length > 0 && (
          <ItemsCard
            orderNumber={order.order_number}
            items={items}
            subtotal={Number(order.subtotal ?? order.total ?? 0)}
            deliveryFee={Number(order.delivery_fee ?? 0)}
            total={Number(order.total ?? 0)}
            tip={Number(order.tip ?? 0)}
            locale={locale}
          />
        )}
      </div>

      {/* Fixed bottom action bar — LARGE touch targets for the next action */}
      {order.driver_id && (
        <div className="fixed bottom-0 inset-x-0 z-modal bg-bg-elevated/95 backdrop-blur-2xl border-t border-edge shadow-2xl pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-2xl mx-auto p-3 sm:p-4">
            <OrderActions orderId={order.id} currentStatus={order.status} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function DeliveryStatusProgress({ status, locale }: { status: string; locale: 'de' | 'ar' | 'en' }) {
  const steps = [
    { key: 'confirmed', icon: CheckCircle2, de: 'Bestätigt', ar: 'مؤكد', en: 'Confirmed' },
    { key: 'preparing', icon: ChefHat, de: 'Zubereitung', ar: 'تحضير', en: 'Preparing' },
    { key: 'ready', icon: Package, de: 'Bereit', ar: 'جاهز', en: 'Ready' },
    { key: 'picked_up', icon: Truck, de: 'Unterwegs', ar: 'في الطريق', en: 'On the way' },
    { key: 'delivered', icon: Home, de: 'Geliefert', ar: 'تم التوصيل', en: 'Delivered' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === status);
  return (
    <div className="px-4 pt-3">
      <div className="flex items-center justify-between gap-1">
        {steps.map((step, i) => {
          const isPast = currentIdx > i;
          const isCurrent = currentIdx === i;
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center">
              <div
                className={cn(
                  'w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all',
                  isPast
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                    ? 'bg-brand-gradient text-white shadow-glow animate-pulse'
                    : 'bg-ink-700 text-text-muted'
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <p
                className={cn(
                  'text-[10px] sm:text-[11px] font-extrabold mt-1.5 text-center leading-tight',
                  isPast || isCurrent ? 'text-white' : 'text-text-muted'
                )}
              >
                {step[locale as keyof typeof step] as string}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DistanceCard({
  icon: Icon,
  label,
  destination,
  distance,
  color,
  locale,
}: {
  icon: any;
  label: string;
  destination: string;
  distance: number;
  color: 'brand' | 'emerald';
  locale: 'de' | 'ar' | 'en';
}) {
  const minutes = Math.max(1, Math.round(distance / 0.5));
  const bgClass = color === 'brand' ? 'bg-brand-500/10 border-brand-500/40' : 'bg-emerald-500/10 border-emerald-500/40';
  const iconBg = color === 'brand' ? 'bg-brand-gradient' : 'bg-emerald-500';
  const labelColor = color === 'brand' ? 'text-brand-500' : 'text-emerald-400';
  return (
    <div className={cn('rounded-2xl border p-4 sm:p-5', bgClass)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0', iconBg)}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('text-[10px] font-extrabold uppercase tracking-wider', labelColor)}>
              {label}
            </p>
            <p className="text-lg font-extrabold text-white truncate">{destination}</p>
          </div>
        </div>
        <div className="text-end">
          <p className="text-3xl font-black text-white tabular-nums leading-none">
            {distance < 1 ? `${Math.round(distance * 1000)}` : distance.toFixed(1)}
          </p>
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-extrabold mt-1">
            {distance < 1
              ? (locale === 'ar' ? 'م' : locale === 'en' ? 'm' : 'm')
              : (locale === 'ar' ? 'كم' : locale === 'en' ? 'km' : 'km')}
            <span className="mx-1">·</span>
            {minutes} {locale === 'ar' ? 'د' : locale === 'en' ? 'min' : 'min'}
          </p>
        </div>
      </div>
    </div>
  );
}

function PickupCard({
  name,
  address,
  phone,
  locale,
  lat,
  lng,
}: {
  name: string;
  address: string | null | undefined;
  phone: string | null | undefined;
  locale: 'de' | 'ar' | 'en';
  lat: number | null;
  lng: number | null;
}) {
  const mapsUrl = lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}&travelmode=driving`;

  return (
    <div className="rounded-2xl bg-surface-elevated border-2 border-brand-500/40 p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-brand-gradient flex items-center justify-center text-white flex-shrink-0">
          <Building className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold text-brand-500 uppercase tracking-wider">
            {locale === 'ar' ? 'استلام من' : locale === 'en' ? 'Pickup from' : 'Abholung bei'}
          </p>
          <p className="text-lg font-extrabold text-white truncate">{name}</p>
        </div>
      </div>
      {address && <p className="text-sm text-text-secondary mb-3">{address}</p>}
      {/* LARGE navigate button */}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-14 rounded-2xl bg-brand-gradient text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-glow active:scale-[0.98] transition-transform touch-manipulation"
      >
        <Navigation className="w-5 h-5" />
        {locale === 'ar' ? 'ابدأ التنقل' : locale === 'en' ? 'Start navigation' : 'Navigation starten'}
        <ArrowUpRight className="w-4 h-4" />
      </a>
      {phone && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <a
            href={`tel:${phone}`}
            className="h-12 rounded-xl bg-ink-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 touch-manipulation active:scale-95"
          >
            <Phone className="w-4 h-4" />
            {locale === 'ar' ? 'اتصال' : locale === 'en' ? 'Call' : 'Anrufen'}
          </a>
          <a
            href={`sms:${phone}`}
            className="h-12 rounded-xl bg-ink-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 touch-manipulation active:scale-95"
          >
            <MessageSquare className="w-4 h-4" />
            {locale === 'ar' ? 'رسالة' : locale === 'en' ? 'SMS' : 'SMS'}
          </a>
        </div>
      )}
    </div>
  );
}

function DeliveryCard({
  name,
  address,
  phone,
  instructions,
  floor,
  door,
  locale,
  lat,
  lng,
}: {
  name: string;
  address: string;
  phone: string | null | undefined;
  instructions: string | null;
  floor: string | null;
  door: string | null;
  locale: 'de' | 'ar' | 'en';
  lat: number | null;
  lng: number | null;
}) {
  const mapsUrl = lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;

  return (
    <div className="rounded-2xl bg-surface-elevated border-2 border-emerald-500/40 p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white flex-shrink-0">
          <Home className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">
            {locale === 'ar' ? 'توصيل إلى' : locale === 'en' ? 'Deliver to' : 'Lieferung an'}
          </p>
          <p className="text-lg font-extrabold text-white truncate">{name || (locale === 'ar' ? 'العميل' : locale === 'de' ? 'Kunde' : 'Customer')}</p>
        </div>
      </div>
      <p className="text-sm text-text-secondary mb-3">{address}</p>

      {/* Floor / door chips */}
      {(floor || door) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {floor && (
            <span className="px-2.5 py-1 rounded-pill bg-ink-700 text-text-secondary text-xs font-bold">
              {locale === 'ar' ? 'طابق' : locale === 'de' ? 'Etage' : 'Floor'} {floor}
            </span>
          )}
          {door && (
            <span className="px-2.5 py-1 rounded-pill bg-ink-700 text-text-secondary text-xs font-bold">
              {locale === 'ar' ? 'باب' : locale === 'de' ? 'Tür' : 'Door'} {door}
            </span>
          )}
        </div>
      )}

      {instructions && (
        <div className="rounded-xl bg-brand-yellow-500/10 border border-brand-yellow-500/30 p-3 mb-3">
          <p className="text-[10px] font-extrabold text-brand-yellow-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {locale === 'ar' ? 'ملاحظة للعميل' : locale === 'en' ? 'Note for customer' : 'Hinweis:'}
          </p>
          <p className="text-sm text-brand-yellow-200">{instructions}</p>
        </div>
      )}

      {/* LARGE navigate button */}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-14 rounded-2xl bg-emerald-500 text-white font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
      >
        <Navigation className="w-5 h-5" />
        {locale === 'ar' ? 'ابدأ التنقل' : locale === 'en' ? 'Start navigation' : 'Navigation starten'}
        <ArrowUpRight className="w-4 h-4" />
      </a>

      {phone && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <a
            href={`tel:${phone}`}
            className="h-12 rounded-xl bg-ink-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 touch-manipulation active:scale-95"
          >
            <Phone className="w-4 h-4" />
            {locale === 'ar' ? 'اتصال' : locale === 'en' ? 'Call' : 'Anrufen'}
          </a>
          <a
            href={`sms:${phone}`}
            className="h-12 rounded-xl bg-ink-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 touch-manipulation active:scale-95"
          >
            <MessageSquare className="w-4 h-4" />
            {locale === 'ar' ? 'رسالة' : locale === 'en' ? 'SMS' : 'SMS'}
          </a>
        </div>
      )}
    </div>
  );
}

function ItemsCard({
  orderNumber,
  items,
  subtotal,
  deliveryFee,
  total,
  tip,
  locale,
}: {
  orderNumber: string;
  items: any[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  tip: number;
  locale: 'de' | 'ar' | 'en';
}) {
  return (
    <details className="rounded-2xl bg-surface-elevated border border-edge group">
      <summary className="p-4 flex items-center gap-3 cursor-pointer touch-manipulation list-none">
        <div className="w-10 h-10 rounded-xl bg-ink-700 text-text-secondary flex items-center justify-center flex-shrink-0">
          <Receipt className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-white">
            {locale === 'ar' ? 'تفاصيل الطلب' : locale === 'en' ? 'Order details' : 'Bestelldetails'}
          </p>
          <p className="text-xs text-text-muted truncate">
            #{orderNumber} · {items.length} {locale === 'ar' ? 'عناصر' : locale === 'en' ? 'items' : 'Artikel'}
          </p>
        </div>
        <p className="text-base font-black text-white tabular-nums">{formatEUR(total)}</p>
        <svg className="w-4 h-4 text-text-muted group-open:rotate-180 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="px-4 pb-4 divide-y divide-edge">
        {items.map((item: any) => (
          <div key={item.id} className="py-2 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{item.product_name || item.name || 'Item'}</p>
              <p className="text-[11px] text-text-muted">×{item.quantity}</p>
            </div>
            <p className="text-sm font-bold text-white tabular-nums">{formatEUR(Number(item.subtotal ?? item.total ?? 0))}</p>
          </div>
        ))}
        <div className="pt-2 space-y-1">
          <Row label={locale === 'ar' ? 'المجموع الفرعي' : locale === 'en' ? 'Subtotal' : 'Zwischensumme'} value={formatEUR(subtotal)} />
          <Row label={locale === 'ar' ? 'رسوم التوصيل' : locale === 'en' ? 'Delivery fee' : 'Liefergebühr'} value={formatEUR(deliveryFee)} />
          {tip > 0 && <Row label={locale === 'ar' ? 'البقشيش' : locale === 'en' ? 'Tip' : 'Trinkgeld'} value={formatEUR(tip)} />}
          <div className="pt-1.5 border-t border-edge flex items-center justify-between">
            <p className="text-sm font-extrabold text-white">{locale === 'ar' ? 'الإجمالي' : locale === 'en' ? 'Total' : 'Gesamt'}</p>
            <p className="text-base font-black text-white tabular-nums">{formatEUR(total)}</p>
          </div>
        </div>
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-xs font-bold text-text-secondary tabular-nums">{value}</p>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
