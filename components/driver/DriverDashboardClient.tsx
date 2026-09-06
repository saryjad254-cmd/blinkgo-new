'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Banknote, BarChart3, Bell, Bike, CalendarClock, Check, ChevronRight, CircleDollarSign, Clock3, Crosshair,
  FileBadge, Headphones, Flame, Loader2, MapPin, Menu, Navigation, Package, Phone, Power, RotateCcw,
  Settings, Star, Store, Timer, WalletCards, X, Zap,
} from 'lucide-react';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { useDriverGPS } from '@/lib/hooks/useDriverGPS';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';
import { computeEarnings } from '@/lib/services/driver-earnings';
import { haversineDistance } from '@/lib/realtime/location-service';
import { haptic } from '@/lib/utils/haptics';
import { playDriverSound } from '@/lib/utils/driver-sound';
import { DriverLiveMap, type DriverMapPoint } from './DriverLiveMap';
import { DriverReleaseDialog } from './DriverReleaseDialog';
import { DriverDeliveryPinDialog } from './DriverDeliveryPinDialog';
import { DriverIssueDialog } from './DriverIssueDialog';
import { DriverFailedDeliveryDialog } from './DriverFailedDeliveryDialog';
import { cn } from '@/lib/cn';
import { createBrowserClient } from '@/lib/supabase/client';
import type { DriverReleaseReason } from '@/lib/driver/rejection-reasons';
import type { DriverIssueCode } from '@/lib/driver/issue-policy';
import type { FailedDeliveryReason } from '@/lib/driver/delivery-outcome-policy';
import type { DriverOfferQuote, OfferMatchSignal } from '@/lib/driver/offer-policy';
import { formatDeliveryPreferences, hasDeliveryPreferences, type DeliveryPreferences } from '@/lib/delivery-preferences';
import { BlinkLogo } from '@/components/brand/BlinkLogo';

interface RestaurantRelation {
  name?: string | null;
  address?: unknown;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface CustomerRelation { name?: string | null; phone?: string | null }

interface DriverOrder {
  id: string;
  order_number?: string | null;
  status?: string | null;
  total?: number | null;
  delivery_fee?: number | null;
  tip?: number | null;
  delivery_address?: unknown;
  delivery_instructions?: string | null;
  delivery_preferences?: DeliveryPreferences | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  restaurant_latitude?: number | null;
  restaurant_longitude?: number | null;
  restaurant_name?: string | null;
  restaurant_address?: unknown;
  restaurant_phone?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  payment_method?: string | null;
  arrived_pickup_at?: string | null;
  arrived_dropoff_at?: string | null;
  restaurants?: RestaurantRelation | RestaurantRelation[] | null;
  customer?: CustomerRelation | CustomerRelation[] | null;
  driver_offer?: DriverOfferQuote | null;
}

interface DriverData {
  driver: {
    id: string;
    is_online: boolean;
    is_available: boolean;
    vehicle_type: string;
    rating: number;
    total_deliveries: number;
    working_hours_today: number;
    current_lat: number | null;
    current_lng: number | null;
  } | null;
  activeOrder: DriverOrder | null;
  stats: {
    today: { earnings: number; deliveries: number };
    week: { earnings: number; deliveries: number };
    month: { earnings: number; deliveries: number };
  };
  availableOrders: DriverOrder[];
  pingsCount: number;
  verificationRequired: boolean;
}

const COPY = {
  de: {
    live: 'Live-Fahrerkarte', online: 'Online', offline: 'Offline', goOnline: 'Online gehen', goOffline: 'Offline gehen',
    locating: 'GPS wird gesucht', gpsReady: 'GPS aktiv', gpsDenied: 'Standort freigeben', today: 'Heute', deliveries: 'Touren',
    newOrder: 'Neuer Auftrag', guaranteed: 'Dein Verdienst', totalTime: 'Gesamtzeit', pickup: 'Abholung', dropoff: 'Zustellung',
    accept: 'Auftrag annehmen', skip: 'Überspringen', expires: 'Angebot läuft ab', waiting: 'Du bist bereit', waitingBody: 'Neue Aufträge erscheinen automatisch auf der Karte.',
    offlineTitle: 'Starte deine Schicht', offlineBody: 'Gehe online, um Live-Aufträge in deiner Nähe zu erhalten.', active: 'Aktive Lieferung',
    navigatePickup: 'Zum Restaurant navigieren', confirmPickup: 'Abholung bestätigen', navigateDropoff: 'Zum Kunden navigieren', complete: 'Zustellung bestätigen',
    preparing: 'Restaurant bereitet vor', ready: 'Bereit zur Abholung', onWay: 'Auf dem Weg zum Kunden', refresh: 'Aktualisieren',
    networkError: 'Verbindung fehlgeschlagen', acceptError: 'Auftrag konnte nicht angenommen werden', actionError: 'Aktion fehlgeschlagen', verificationTitle: 'Verifizierung erforderlich', verificationRequired: 'Bitte zuerst alle erforderlichen Fahrerdokumente prüfen und freigeben lassen.', reviewDocuments: 'Dokumente öffnen',
    menu: 'Fahrerbereiche', orders: 'Aufträge', earnings: 'Verdienst', settings: 'Einstellungen', support: 'Hilfe', order: 'Bestellung', customer: 'Kunde',
    demand: 'Nachfrage', nearby: 'in deiner Nähe', hot: 'Stark', calm: 'Normal', quiet: 'Ruhig', demandHintBusy: 'Gute Zeit, online zu bleiben', demandHintNormal: 'Regelmäßige Aufträge möglich', demandHintQuiet: 'Fahre zu einem markierten Hotspot', instructions: 'Hinweise', callRestaurant: 'Restaurant anrufen', callCustomer: 'Kunde anrufen',
    tools: 'Fahrerzentrale', close: 'Schließen', shift: 'Aktuelle Schicht', hours: 'Stunden', week: 'Woche', month: 'Monat', rating: 'Bewertung', vehicle: 'Fahrzeug', payouts: 'Auszahlungen', documents: 'Dokumente', safety: 'Sicherheitscenter', stats: 'Statistik', allTools: 'Alle Fahrerwerkzeuge', notifications: 'Benachrichtigungen', networkOffline: 'Keine Internetverbindung – der letzte Stand bleibt sichtbar', syncFailed: 'Live-Aktualisierung unterbrochen',
    pickupDistance: 'Bis zur Abholung', deliveryDistance: 'Zustellung', hourlyEstimate: 'Ca. / Stunde', readyNow: 'Jetzt abholbereit', preparingNow: 'Wird vorbereitet', noSkipPenalty: 'Ablehnen hat keine Nachteile', bestMatch: 'Beste passende Tour', arrivePickup: 'Im Restaurant angekommen', arriveDropoff: 'Beim Kunden angekommen', waitingAtRestaurant: 'Wartezeit im Restaurant', arrivedAtCustomer: 'Du bist an der Lieferadresse',
  },
  ar: {
    live: 'خريطة السائق المباشرة', online: 'متصل', offline: 'غير متصل', goOnline: 'ابدأ العمل', goOffline: 'إيقاف العمل',
    locating: 'جارٍ تحديد الموقع', gpsReady: 'الموقع نشط', gpsDenied: 'فعّل إذن الموقع', today: 'اليوم', deliveries: 'توصيلات',
    newOrder: 'طلب جديد', guaranteed: 'ربحك من الطلب', totalTime: 'الوقت الإجمالي', pickup: 'الاستلام', dropoff: 'التوصيل',
    accept: 'قبول الطلب', skip: 'تخطي', expires: 'ينتهي العرض خلال', waiting: 'أنت جاهز', waitingBody: 'سيظهر أي طلب جديد تلقائيًا فوق الخريطة.',
    offlineTitle: 'ابدأ ورديتك', offlineBody: 'اتصل لتستقبل الطلبات القريبة مباشرة على الخريطة.', active: 'توصيلة نشطة',
    navigatePickup: 'الملاحة إلى المطعم', confirmPickup: 'تأكيد الاستلام', navigateDropoff: 'الملاحة إلى الزبون', complete: 'تأكيد التوصيل',
    preparing: 'المطعم يحضّر الطلب', ready: 'جاهز للاستلام', onWay: 'في الطريق إلى الزبون', refresh: 'تحديث',
    networkError: 'تعذر الاتصال بالخادم', acceptError: 'تعذر قبول الطلب', actionError: 'تعذر تنفيذ الإجراء', verificationTitle: 'توثيق الحساب مطلوب', verificationRequired: 'يجب رفع واعتماد جميع مستندات السائق قبل قبول الطلبات.', reviewDocuments: 'فتح المستندات',
    menu: 'أقسام السائق', orders: 'الطلبات', earnings: 'الأرباح', settings: 'الإعدادات', support: 'الدعم', order: 'طلب', customer: 'الزبون',
    demand: 'الطلب الآن', nearby: 'قريبة منك', hot: 'مرتفع', calm: 'طبيعي', quiet: 'هادئ', demandHintBusy: 'وقت مناسب للبقاء متصلاً', demandHintNormal: 'يمكن أن تصل طلبات بشكل منتظم', demandHintQuiet: 'توجّه إلى منطقة النشاط المحددة', instructions: 'تعليمات التوصيل', callRestaurant: 'اتصال بالمطعم', callCustomer: 'اتصال بالزبون',
    tools: 'مركز السائق', close: 'إغلاق', shift: 'الوردية الحالية', hours: 'ساعات', week: 'الأسبوع', month: 'الشهر', rating: 'التقييم', vehicle: 'المركبة', payouts: 'التحويلات', documents: 'المستندات', safety: 'مركز الأمان', stats: 'الإحصاءات', allTools: 'كل أدوات السائق', notifications: 'الإشعارات', networkOffline: 'لا يوجد اتصال بالإنترنت — آخر حالة ما زالت ظاهرة', syncFailed: 'توقف التحديث المباشر مؤقتًا',
    pickupDistance: 'حتى الاستلام', deliveryDistance: 'مسافة التوصيل', hourlyEstimate: 'تقدير / ساعة', readyNow: 'جاهز للاستلام', preparingNow: 'قيد التحضير', noSkipPenalty: 'تخطي العرض بلا عقوبة', bestMatch: 'أنسب طلب قريب', arrivePickup: 'وصلت إلى المطعم', arriveDropoff: 'وصلت إلى الزبون', waitingAtRestaurant: 'وقت الانتظار في المطعم', arrivedAtCustomer: 'أنت الآن عند عنوان التوصيل',
  },
  en: {
    live: 'Live driver map', online: 'Online', offline: 'Offline', goOnline: 'Go online', goOffline: 'Go offline',
    locating: 'Finding GPS', gpsReady: 'GPS active', gpsDenied: 'Enable location', today: 'Today', deliveries: 'deliveries',
    newOrder: 'New delivery', guaranteed: 'Your earnings', totalTime: 'Total time', pickup: 'Pickup', dropoff: 'Drop-off',
    accept: 'Accept delivery', skip: 'Skip', expires: 'Offer expires in', waiting: 'You are ready', waitingBody: 'New deliveries will appear automatically on the map.',
    offlineTitle: 'Start your shift', offlineBody: 'Go online to receive nearby deliveries directly on the map.', active: 'Active delivery',
    navigatePickup: 'Navigate to restaurant', confirmPickup: 'Confirm pickup', navigateDropoff: 'Navigate to customer', complete: 'Confirm delivery',
    preparing: 'Restaurant is preparing', ready: 'Ready for pickup', onWay: 'On the way to customer', refresh: 'Refresh',
    networkError: 'Could not reach the server', acceptError: 'Could not accept delivery', actionError: 'Action failed', verificationTitle: 'Verification required', verificationRequired: 'Upload and obtain approval for all driver documents before accepting orders.', reviewDocuments: 'Open documents',
    menu: 'Driver areas', orders: 'Orders', earnings: 'Earnings', settings: 'Settings', support: 'Support', order: 'Order', customer: 'Customer',
    demand: 'Live demand', nearby: 'near you', hot: 'Busy', calm: 'Normal', quiet: 'Quiet', demandHintBusy: 'A good time to stay online', demandHintNormal: 'Regular offers are possible', demandHintQuiet: 'Move toward a highlighted hotspot', instructions: 'Delivery notes', callRestaurant: 'Call restaurant', callCustomer: 'Call customer',
    tools: 'Driver hub', close: 'Close', shift: 'Current shift', hours: 'hours', week: 'Week', month: 'Month', rating: 'Rating', vehicle: 'Vehicle', payouts: 'Payouts', documents: 'Documents', safety: 'Safety center', stats: 'Statistics', allTools: 'All driver tools', notifications: 'Notifications', networkOffline: 'No internet connection — showing the last known state', syncFailed: 'Live updates are temporarily interrupted',
    pickupDistance: 'To pickup', deliveryDistance: 'Delivery', hourlyEstimate: 'Est. / hour', readyNow: 'Ready now', preparingNow: 'Being prepared', noSkipPenalty: 'Skipping has no penalty', bestMatch: 'Best nearby match', arrivePickup: 'I arrived at the restaurant', arriveDropoff: 'I arrived at the customer', waitingAtRestaurant: 'Restaurant waiting time', arrivedAtCustomer: 'You are at the delivery address',
  },
} satisfies Record<Locale, Record<string, string>>;

const OFFER_COPY = {
  de: {
    why: 'Warum dieser Auftrag?', queue: 'verfügbare Aufträge', excellent: 'Sehr gute Übereinstimmung', good: 'Gute Übereinstimmung', standard: 'Passender Auftrag', unrated: 'Standortdaten fehlen', short_pickup: 'Kurzer Weg zur Abholung', ready_for_pickup: 'Bereit zur Abholung', efficient_route: 'Effiziente Route', strong_hourly_estimate: 'Gute Zeitvergütung', fairRanking: 'Sortiert nach Abholweg, Gesamtzeit und Verdienst. Überspringen beeinflusst dein Konto nicht.',
  },
  ar: {
    why: 'لماذا رُشّح هذا الطلب؟', queue: 'طلبات متاحة', excellent: 'تطابق ممتاز', good: 'تطابق جيد', standard: 'طلب مناسب', unrated: 'بيانات الموقع غير مكتملة', short_pickup: 'المطعم قريب', ready_for_pickup: 'جاهز للاستلام', efficient_route: 'مسار فعّال', strong_hourly_estimate: 'عائد زمني جيد', fairRanking: 'الترتيب يعتمد على مسافة الاستلام والوقت الكلي والعائد. تخطي العرض لا يؤثر على حسابك.',
  },
  en: {
    why: 'Why this delivery?', queue: 'offers available', excellent: 'Excellent match', good: 'Good match', standard: 'Suitable delivery', unrated: 'Location data incomplete', short_pickup: 'Short pickup trip', ready_for_pickup: 'Ready for pickup', efficient_route: 'Efficient route', strong_hourly_estimate: 'Strong time-based earnings', fairRanking: 'Ranked by pickup effort, total time, and earnings. Skipping never affects your account.',
  },
} satisfies Record<Locale, Record<'why' | 'queue' | 'excellent' | 'good' | 'standard' | 'unrated' | OfferMatchSignal | 'fairRanking', string>>;

function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function addressText(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{')) {
      try { return addressText(JSON.parse(trimmed)); } catch { /* keep the original address */ }
    }
    return value;
  }
  if (!value || typeof value !== 'object') return '—';
  const record = value as Record<string, unknown>;
  const direct = record.formatted_address ?? record.address;
  if (typeof direct === 'string') return direct;
  return [record.street, record.postal_code ?? record.postal, record.city].filter((part): part is string => typeof part === 'string').join(', ') || '—';
}

function numeric(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? number : null;
}

function restaurantOf(order: DriverOrder): RestaurantRelation {
  return one(order.restaurants) ?? {};
}

function orderPoints(order: DriverOrder | null, customerLabel: string): { pickup: DriverMapPoint | null; dropoff: DriverMapPoint | null } {
  if (!order) return { pickup: null, dropoff: null };
  const restaurant = restaurantOf(order);
  return {
    pickup: {
      lat: numeric(order.restaurant_latitude ?? restaurant.latitude),
      lng: numeric(order.restaurant_longitude ?? restaurant.longitude),
      label: order.restaurant_name || restaurant.name || 'Restaurant',
    },
    dropoff: {
      lat: numeric(order.customer_latitude),
      lng: numeric(order.customer_longitude),
      label: order.customer_name || one(order.customer)?.name || customerLabel,
    },
  };
}

function formatMoney(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function vehicleLabel(value: string | null | undefined, locale: Locale) {
  const normalized = String(value || '').toLowerCase();
  if (['bicycle', 'bike', 'fahrrad'].includes(normalized)) return locale === 'ar' ? 'دراجة هوائية' : locale === 'en' ? 'Bicycle' : 'Fahrrad';
  if (['scooter', 'motorroller'].includes(normalized)) return locale === 'ar' ? 'سكوتر' : locale === 'en' ? 'Scooter' : 'Motorroller';
  if (['motorcycle', 'motorrad'].includes(normalized)) return locale === 'ar' ? 'دراجة نارية' : locale === 'en' ? 'Motorcycle' : 'Motorrad';
  if (['car', 'auto'].includes(normalized)) return locale === 'ar' ? 'سيارة' : locale === 'en' ? 'Car' : 'Auto';
  return value || '—';
}

function routeDistanceKm(driver: DriverMapPoint, pickup: DriverMapPoint | null, dropoff: DriverMapPoint | null): number | null {
  if (!pickup?.lat || !pickup.lng || !dropoff?.lat || !dropoff.lng) return null;
  let meters = 0;
  if (numeric(driver.lat) && numeric(driver.lng) && pickup?.lat && pickup.lng) meters += haversineDistance({ lat: driver.lat as number, lng: driver.lng as number }, { lat: pickup.lat, lng: pickup.lng });
  if (pickup?.lat && pickup.lng && dropoff?.lat && dropoff.lng) meters += haversineDistance({ lat: pickup.lat, lng: pickup.lng }, { lat: dropoff.lat, lng: dropoff.lng });
  return meters / 1000;
}

function directDistanceKm(from: DriverMapPoint, to: DriverMapPoint | null): number | null {
  if (!from.lat || !from.lng || !to?.lat || !to.lng) return null;
  return haversineDistance({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) / 1000;
}

function OfferCountdown({ orderId, onExpire }: { orderId: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(30);
  const expireRef = useRef(onExpire);
  useEffect(() => { expireRef.current = onExpire; }, [onExpire]);
  useEffect(() => {
    const deadline = Date.now() + 30_000;
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) {
        window.clearInterval(timer);
        expireRef.current();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [orderId]);
  return <span className={cn('tabular-nums', remaining <= 10 && 'text-[#ffc107]')}>{remaining}s</span>;
}

export function DriverDashboardClient({ initialData, userName }: { initialData: DriverData; userName: string }) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { error: toastError, success: toastSuccess } = useToast();
  const [isOnline, setIsOnline] = useState(initialData.driver?.is_online ?? false);
  const [activeOrder, setActiveOrder] = useState<DriverOrder | null>(initialData.activeOrder);
  const [offers, setOffers] = useState<DriverOrder[]>(initialData.availableOrders);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [deliveryPinOpen, setDeliveryPinOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [failedDeliveryOpen, setFailedDeliveryOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [stats, setStats] = useState(initialData.stats);
  const [syncFailed, setSyncFailed] = useState(false);
  const offerAlertedRef = useRef<string | null>(null);
  const dismissTimersRef = useRef<Map<string, number>>(new Map());
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const network = useOnlineStatus();

  const gps = useDriverGPS({ enabled: isOnline, activeOrderId: activeOrder?.id ?? null, minDistanceMeters: 6, minTimeMs: 2500 });
  const driverPoint = useMemo<DriverMapPoint>(() => ({
    lat: gps.currentFix?.lat ?? numeric(initialData.driver?.current_lat),
    lng: gps.currentFix?.lng ?? numeric(initialData.driver?.current_lng),
    label: userName,
  }), [gps.currentFix?.lat, gps.currentFix?.lng, initialData.driver?.current_lat, initialData.driver?.current_lng, userName]);

  const rankedOffers = useMemo(() => [...offers].sort((left, right) => {
    const leftServerScore = left.driver_offer?.score;
    const rightServerScore = right.driver_offer?.score;
    if (Number.isFinite(leftServerScore) || Number.isFinite(rightServerScore)) {
      return (Number.isFinite(leftServerScore) ? Number(leftServerScore) : Number.POSITIVE_INFINITY)
        - (Number.isFinite(rightServerScore) ? Number(rightServerScore) : Number.POSITIVE_INFINITY);
    }
    const leftPoints = orderPoints(left, copy.customer);
    const rightPoints = orderPoints(right, copy.customer);
    const leftDistance = routeDistanceKm(driverPoint, leftPoints.pickup, leftPoints.dropoff) ?? Number.POSITIVE_INFINITY;
    const rightDistance = routeDistanceKm(driverPoint, rightPoints.pickup, rightPoints.dropoff) ?? Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance;
  }), [copy.customer, driverPoint, offers]);
  const visibleOffer = isOnline && !activeOrder ? rankedOffers.find((order) => !dismissed.has(order.id)) ?? null : null;
  const mapOrder = activeOrder ?? visibleOffer;
  const mapPoints = useMemo(() => orderPoints(mapOrder, copy.customer), [copy.customer, mapOrder]);
  const hotspots = useMemo(() => offers.map((order) => orderPoints(order, copy.customer).pickup).filter((point): point is DriverMapPoint => Boolean(point?.lat && point.lng)), [copy.customer, offers]);
  const mapFocus = activeOrder
    ? (['picked_up', 'delivering'].includes(activeOrder.status || '') ? 'dropoff' : 'pickup')
    : visibleOffer ? 'offer' : 'driver';
  const demandLevel = offers.length >= 3 ? 'busy' : offers.length > 0 ? 'normal' : 'quiet';

  const refreshLive = useCallback(async () => {
    if (!isOnline || !network.isOnline) return;
    setRefreshing(true);
    try {
      const [activeResponse, offersResponse] = await Promise.all([
        fetch('/api/driver/active-order', { cache: 'no-store' }),
        fetch('/api/driver/orders?status=available&limit=10', { cache: 'no-store' }),
      ]);
      const activePayload = await activeResponse.json().catch(() => ({}));
      const offersPayload = await offersResponse.json().catch(() => ({}));
      if (!activeResponse.ok || !offersResponse.ok) throw new Error('live-sync-failed');
      if (activeResponse.ok) setActiveOrder(activePayload.data?.order ?? null);
      if (offersResponse.ok) setOffers(offersPayload.data?.orders ?? []);
      setSyncFailed(false);
    } catch {
      // Keep the last safe snapshot during short network interruptions.
      setSyncFailed(true);
    } finally { setRefreshing(false); }
  }, [isOnline, network.isOnline]);

  useEffect(() => {
    if (!visibleOffer || offerAlertedRef.current === visibleOffer.id) return;
    offerAlertedRef.current = visibleOffer.id;
    playDriverSound('offer');
    haptic('order-arrived');
  }, [visibleOffer]);

  useEffect(() => () => {
    dismissTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    dismissTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!isOnline || !network.isOnline || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let released = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; }, { once: true });
        if (released) await lock.release();
      } catch { /* Wake Lock is best-effort on unsupported or battery-saving devices. */ }
    };
    void acquire();
    const onVisibility = () => { if (document.visibilityState === 'visible' && !lock) void acquire(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { released = true; document.removeEventListener('visibilitychange', onVisibility); void lock?.release(); };
  }, [isOnline, network.isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    const initialTimer = window.setTimeout(() => void refreshLive(), 0);
    const timer = window.setInterval(() => void refreshLive(), 7_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [isOnline, refreshLive]);

  useEffect(() => {
    if (!isOnline) return;
    const supabase = createBrowserClient();
    const channel = supabase
      .channel('driver-live-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => void refreshLive())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isOnline, refreshLive]);

  const toggleOnline = async () => {
    setBusy('online');
    try {
      const response = await fetch('/api/driver/online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_online: !isOnline }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || copy.networkError);
      setIsOnline((current) => !current);
      playDriverSound('success');
      haptic('success');
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.networkError);
    } finally { setBusy(null); }
  };

  const skipOffer = useCallback((orderId: string) => {
    setDismissed((current) => new Set(current).add(orderId));
    haptic('light');
    const previousTimer = dismissTimersRef.current.get(orderId);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => setDismissed((current) => {
      const next = new Set(current); next.delete(orderId); return next;
    }), 60_000);
    dismissTimersRef.current.set(orderId, timer);
  }, []);

  const acceptOffer = async (order: DriverOrder) => {
    setBusy(`accept-${order.id}`);
    try {
      const response = await fetch(`/api/driver/orders/${order.id}/accept`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.details?.reason === 'DRIVER_VERIFICATION_REQUIRED' ? copy.verificationRequired : payload.error?.message || copy.acceptError);
      const accepted = payload.data?.order as DriverOrder | undefined;
      // The atomic accept response may not include joined restaurant data.
      // Merge it into the offer snapshot so navigation coordinates, contact
      // details, and the guaranteed quote remain available immediately.
      setActiveOrder(accepted ? {
        ...order,
        ...accepted,
        restaurants: accepted.restaurants ?? order.restaurants,
        customer: accepted.customer ?? order.customer,
        driver_offer: accepted.driver_offer ?? order.driver_offer,
      } : order);
      setOffers((current) => current.filter((candidate) => candidate.id !== order.id));
      playDriverSound('success');
      haptic('success');
      toastSuccess(copy.active);
      await refreshLive();
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.acceptError);
      await refreshLive();
    } finally { setBusy(null); }
  };

  const mutateOrder = async (action: 'pickup' | 'complete', deliveryPin?: string, deliveryPhoto?: string) => {
    if (!activeOrder) return;
    setBusy(action);
    try {
      const response = await fetch(`/api/driver/orders/${activeOrder.id}/${action}`, {
        method: 'POST',
        headers: action === 'complete' ? { 'Content-Type': 'application/json' } : undefined,
        body: action === 'complete' ? JSON.stringify({ delivery_pin: deliveryPin, delivery_photo: deliveryPhoto }) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || copy.actionError);
      if (action === 'complete') {
        const earned = computeEarnings(activeOrder).total;
        setStats((current) => ({
          today: { earnings: current.today.earnings + earned, deliveries: current.today.deliveries + 1 },
          week: { earnings: current.week.earnings + earned, deliveries: current.week.deliveries + 1 },
          month: { earnings: current.month.earnings + earned, deliveries: current.month.deliveries + 1 },
        }));
        setActiveOrder(null);
        setDeliveryPinOpen(false);
        playDriverSound('delivered');
        haptic('order-complete');
      } else {
        setActiveOrder((current) => current ? { ...current, status: 'picked_up' } : null);
        playDriverSound('pickup');
        haptic('success');
      }
      await refreshLive();
    } catch (error) { toastError(error instanceof Error ? error.message : copy.actionError); }
    finally { setBusy(null); }
  };

  const markArrival = async (stage: 'pickup' | 'dropoff') => {
    if (!activeOrder) return;
    setBusy(`arrive-${stage}`);
    try {
      const response = await fetch(`/api/driver/orders/${activeOrder.id}/arrive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || copy.actionError);
      const arrivedAt = payload.data?.arrival?.created_at ?? new Date().toISOString();
      setActiveOrder((current) => current ? {
        ...current,
        [stage === 'pickup' ? 'arrived_pickup_at' : 'arrived_dropoff_at']: arrivedAt,
      } : null);
      playDriverSound('arrived');
      haptic('order-arrived');
      toastSuccess(stage === 'pickup' ? copy.waitingAtRestaurant : copy.arrivedAtCustomer);
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.actionError);
    } finally {
      setBusy(null);
    }
  };

  const releaseActiveOrder = async (reason: DriverReleaseReason, details: string) => {
    if (!activeOrder) return;
    setBusy('release');
    try {
      const response = await fetch(`/api/driver/orders/${activeOrder.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_code: reason, details }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || copy.actionError);
      setReleaseOpen(false);
      setActiveOrder(null);
      haptic('success');
      toastSuccess(locale === 'ar' ? 'تم تحرير الرحلة وإعادتها للسائقين' : locale === 'en' ? 'Delivery released to other drivers' : 'Tour wurde anderen Fahrern angeboten');
      await refreshLive();
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.actionError);
    } finally {
      setBusy(null);
    }
  };

  const reportActiveOrderIssue = async (code: DriverIssueCode, details: string) => {
    if (!activeOrder) return;
    setBusy('issue');
    try {
      const response = await fetch(`/api/driver/orders/${activeOrder.id}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, details }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || copy.actionError);
      setIssueOpen(false);
      haptic(payload.data?.escalated ? 'warning' : 'success');
      toastSuccess(locale === 'ar' ? 'تم تسجيل المشكلة وربطها بالطلب' : locale === 'en' ? 'Issue recorded and linked to the delivery' : 'Problem wurde bei der Tour gespeichert');
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.actionError);
    } finally {
      setBusy(null);
    }
  };

  const failActiveDelivery = async (reason: FailedDeliveryReason, details: string, contactAttempts: number) => {
    if (!activeOrder) return;
    setBusy('fail-delivery');
    try {
      const response = await fetch(`/api/driver/orders/${activeOrder.id}/fail-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_code: reason, details, contact_attempts: contactAttempts }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || copy.actionError);
      setFailedDeliveryOpen(false);
      setActiveOrder(null);
      haptic('warning');
      toastSuccess(locale === 'ar' ? 'تم توثيق تعذّر التسليم وتحويله للدعم' : locale === 'en' ? 'Failed delivery recorded and escalated to support' : 'Nichtzustellung dokumentiert und an Support übergeben');
      await refreshLive();
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.actionError);
    } finally {
      setBusy(null);
    }
  };

  const openNavigation = (destination: DriverMapPoint | null) => {
    if (!destination?.lat || !destination.lng) return;
    const provider = window.localStorage.getItem('blinkgo-driver-nav-provider');
    const target = `${destination.lat},${destination.lng}`;
    const url = provider === 'waze'
      ? `https://www.waze.com/ul?ll=${target}&navigate=yes`
      : provider === 'apple'
        ? `https://maps.apple.com/?daddr=${target}&dirflg=d`
        : `https://www.google.com/maps/dir/?api=1&destination=${target}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const closeTools = useCallback(() => {
    setToolsOpen(false);
    window.requestAnimationFrame(() => toolsButtonRef.current?.focus());
  }, []);

  const gpsText = gps.status === 'active' ? copy.gpsReady : gps.status === 'denied' ? copy.gpsDenied : copy.locating;
  const firstName = userName.trim().split(/\s+/)[0] || userName;

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden bg-[#09090b] text-white" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-testid="driver-map-dashboard">
      <DriverLiveMap driver={driverPoint} pickup={mapPoints.pickup} dropoff={mapPoints.dropoff} hotspots={hotspots} focus={mapFocus} />

      <header className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:p-5" style={{ zIndex: 1200 }}>
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
          <div className="pointer-events-auto flex min-w-0 items-center gap-3 rounded-[22px] border border-white/12 bg-[#0d0d0d]/92 p-2 pe-4 shadow-2xl backdrop-blur-xl">
            <BlinkLogo variant="horizontal" size="sm" priority />
            <div className="min-w-0"><p className="truncate text-sm font-black">{firstName}</p><p className="flex items-center gap-1.5 text-[11px] font-bold text-white/55"><span className={cn('size-2 rounded-full', isOnline ? 'bg-emerald-400 shadow-[0_0_9px_#34d399]' : 'bg-white/30')} />{isOnline ? copy.online : copy.offline} · {gpsText}</p></div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <div data-testid="driver-today-summary" className="hidden rounded-[20px] border border-white/12 bg-[#0d0d0d]/92 px-4 py-2 text-end shadow-xl backdrop-blur-xl sm:block"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/45">{copy.today}</p><p className="font-black text-[#ffc107]">{formatMoney(stats.today.earnings, locale)} <span className="text-xs text-white/45">· {stats.today.deliveries} {copy.deliveries}</span></p></div>
            <Link href="/driver/notifications" aria-label={copy.notifications} className="grid size-12 place-items-center rounded-2xl border border-white/12 bg-[#0d0d0d]/92 shadow-xl backdrop-blur-xl hover:bg-white/10"><Bell className="size-5" /></Link>
            <button ref={toolsButtonRef} type="button" onClick={() => setToolsOpen(true)} aria-label={copy.allTools} data-testid="driver-tools-open" className="grid size-12 place-items-center rounded-2xl border border-white/12 bg-[#0d0d0d]/92 shadow-xl backdrop-blur-xl hover:bg-white/10"><Menu className="size-5" /></button>
          </div>
        </div>
      </header>

      {(!network.isOnline || syncFailed) && (
        <div role="status" aria-live="polite" data-testid="driver-network-status" className="absolute inset-x-3 top-24 mx-auto max-w-[30rem] rounded-2xl border border-amber-400/25 bg-[#19130a]/95 px-4 py-3 text-center text-xs font-black text-amber-200 shadow-2xl backdrop-blur-xl" style={{ zIndex: 1300 }}>
          {!network.isOnline ? copy.networkOffline : copy.syncFailed}
        </div>
      )}

      <div className="absolute end-3 top-24 flex flex-col gap-2 sm:end-5 sm:top-28" style={{ zIndex: 1200 }}>
        <button type="button" onClick={gps.forceRefresh} aria-label={copy.refresh} className="grid size-12 place-items-center rounded-2xl border border-white/12 bg-[#0d0d0d]/92 shadow-xl backdrop-blur-xl hover:bg-white/10"><Crosshair className={cn('size-5', gps.status === 'requesting' && 'animate-pulse text-[#e10600]')} /></button>
        <button type="button" onClick={() => void refreshLive()} aria-label={copy.refresh} disabled={refreshing} className="grid size-12 place-items-center rounded-2xl border border-white/12 bg-[#0d0d0d]/92 shadow-xl backdrop-blur-xl hover:bg-white/10 disabled:opacity-60"><RotateCcw className={cn('size-5', refreshing && 'animate-spin text-emerald-400')} /></button>
      </div>

      {isOnline && !activeOrder && (
        <div role="status" aria-live="polite" data-testid="driver-demand-status" className="absolute start-3 top-24 max-w-[14rem] rounded-2xl border border-[#ffc107]/25 bg-[#0d0d0d]/92 px-3 py-2 shadow-xl backdrop-blur-xl sm:start-5 sm:top-28" style={{ zIndex: 1200 }}>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-white/45"><Flame className="size-4 text-[#ffc107]" />{copy.demand}</p>
          <p className="mt-1 text-sm font-black"><span className={demandLevel === 'busy' ? 'text-[#ffc107]' : demandLevel === 'normal' ? 'text-emerald-400' : 'text-white/65'}>{demandLevel === 'busy' ? copy.hot : demandLevel === 'normal' ? copy.calm : copy.quiet}</span> · {offers.length} {copy.nearby}</p>
          <p className="mt-0.5 text-[10px] font-bold leading-4 text-white/45">{demandLevel === 'busy' ? copy.demandHintBusy : demandLevel === 'normal' ? copy.demandHintNormal : copy.demandHintQuiet}</p>
        </div>
      )}

      <nav aria-label={copy.menu} className="absolute bottom-[calc(env(safe-area-inset-bottom)+12px)] start-3 hidden flex-col gap-2 md:flex" style={{ zIndex: 1200 }}>
        {[
          { href: '/driver/orders', label: copy.orders, icon: Package },
          { href: '/driver/earnings', label: copy.earnings, icon: WalletCards },
          { href: '/driver/support', label: copy.support, icon: Headphones },
        ].map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-label={label} className="group flex min-h-12 items-center gap-2 rounded-2xl border border-white/12 bg-[#0d0d0d]/92 px-3 text-sm font-black shadow-xl backdrop-blur-xl hover:bg-white/10"><Icon className="size-5 text-[#e10600]" /><span className="max-w-0 overflow-hidden opacity-0 transition-all group-hover:max-w-24 group-hover:opacity-100 group-focus-visible:max-w-24 group-focus-visible:opacity-100">{label}</span></Link>)}
      </nav>

      <section className="absolute inset-x-0 bottom-0 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4" style={{ zIndex: 1200 }}>
        <div className="mx-auto max-w-xl">
          {visibleOffer && !activeOrder ? (
            <IncomingOfferCard
              key={visibleOffer.id}
              order={visibleOffer}
              driver={driverPoint}
              pickup={mapPoints.pickup}
              dropoff={mapPoints.dropoff}
              locale={locale}
              copy={copy}
              offerCount={rankedOffers.filter((order) => !dismissed.has(order.id)).length}
              busy={busy === `accept-${visibleOffer.id}` || !network.isOnline}
              onAccept={() => void acceptOffer(visibleOffer)}
              onSkip={() => skipOffer(visibleOffer.id)}
            />
          ) : activeOrder ? (
            <ActiveDeliveryCard order={activeOrder} driver={driverPoint} pickup={mapPoints.pickup} dropoff={mapPoints.dropoff} locale={locale} copy={copy} busy={busy} networkOnline={network.isOnline} onNavigate={openNavigation} onPickup={() => void mutateOrder('pickup')} onRequestComplete={() => setDeliveryPinOpen(true)} onArrive={markArrival} onRelease={() => setReleaseOpen(true)} onReportIssue={() => setIssueOpen(true)} onFailDelivery={() => setFailedDeliveryOpen(true)} />
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-white/12 bg-[#0d0d0d]/94 p-4 shadow-[0_24px_80px_rgba(0,0,0,.65)] backdrop-blur-2xl sm:p-5">
              <div className="flex items-center gap-4">
                <div className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', initialData.verificationRequired ? 'bg-[#ffc107]/15 text-[#ffc107]' : isOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#e10600]/15 text-[#ff3b35]')}><Power className="size-7" /></div>
                <div className="min-w-0 flex-1"><h1 className="text-xl font-black">{initialData.verificationRequired ? copy.verificationTitle : isOnline ? copy.waiting : copy.offlineTitle}</h1><p className="mt-1 text-sm leading-5 text-white/55">{initialData.verificationRequired ? copy.verificationRequired : isOnline ? copy.waitingBody : copy.offlineBody}</p></div>
              </div>
              {initialData.verificationRequired ? <Link href="/driver/documents" className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#ffc107] text-base font-black text-black hover:bg-[#ffd044]"><FileBadge className="size-5" />{copy.reviewDocuments}</Link> : <button type="button" onClick={() => void toggleOnline()} disabled={busy === 'online' || !network.isOnline} data-testid="driver-online-toggle" className={cn('mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-black transition disabled:opacity-60', isOnline ? 'border border-white/12 bg-white/5 hover:bg-white/10' : 'bg-[#e10600] shadow-[0_10px_35px_rgba(225,6,0,.35)] hover:bg-[#ff1811]')}>
                {busy === 'online' ? <Loader2 className="size-5 animate-spin" /> : <Power className="size-5" />}{isOnline ? copy.goOffline : copy.goOnline}
              </button>}
              <div className="mt-3 grid grid-cols-3 gap-2 md:hidden">
                <Link href="/driver/orders" className="grid min-h-12 place-items-center rounded-xl bg-white/5 text-xs font-bold">{copy.orders}</Link><Link href="/driver/earnings" className="grid min-h-12 place-items-center rounded-xl bg-white/5 text-xs font-bold">{copy.earnings}</Link><Link href="/driver/support" className="grid min-h-12 place-items-center rounded-xl bg-white/5 text-xs font-bold">{copy.support}</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {toolsOpen && <DriverToolDrawer data={initialData} stats={stats} locale={locale} copy={copy} isOnline={isOnline} onClose={closeTools} />}
      <DriverReleaseDialog open={releaseOpen && Boolean(activeOrder)} locale={locale} busy={busy === 'release'} onClose={() => setReleaseOpen(false)} onConfirm={(reason, details) => void releaseActiveOrder(reason, details)} />
      <DriverDeliveryPinDialog open={deliveryPinOpen && Boolean(activeOrder)} locale={locale} handoff={activeOrder?.delivery_preferences?.handoff} busy={busy === 'complete'} onClose={() => setDeliveryPinOpen(false)} onConfirm={(pin, photo) => void mutateOrder('complete', pin, photo)} />
      <DriverIssueDialog key={`issue-${activeOrder?.id || 'none'}-${issueOpen}`} open={issueOpen && Boolean(activeOrder)} locale={locale} orderStatus={activeOrder?.status || ''} busy={busy === 'issue'} onClose={() => setIssueOpen(false)} onSubmit={reportActiveOrderIssue} />
      <DriverFailedDeliveryDialog open={failedDeliveryOpen && Boolean(activeOrder)} locale={locale} busy={busy === 'fail-delivery'} onClose={() => setFailedDeliveryOpen(false)} onConfirm={(reason, details, attempts) => void failActiveDelivery(reason, details, attempts)} />
    </div>
  );
}

function DriverToolDrawer({ data, stats, locale, copy, isOnline, onClose }: { data: DriverData; stats: DriverData['stats']; locale: Locale; copy: typeof COPY.de; isOnline: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKey); };
  }, [onClose]);
  const hours = Number(data.driver?.working_hours_today || 0);
  const tools = [
    { href: '/driver/orders', label: copy.orders, hint: `${stats.today.deliveries} ${copy.today}`, icon: Package, color: 'red' },
    { href: '/driver/earnings', label: copy.earnings, hint: formatMoney(stats.today.earnings, locale), icon: BarChart3, color: 'yellow' },
    { href: '/driver/payouts', label: copy.payouts, hint: copy.week, icon: Banknote, color: 'green' },
    { href: '/driver/documents', label: copy.documents, hint: copy.safety, icon: FileBadge, color: 'yellow' },
    { href: '/driver/settings', label: copy.settings, hint: copy.shift, icon: Settings, color: 'neutral' },
    { href: '/driver/support', label: copy.support, hint: copy.safety, icon: Headphones, color: 'green' },
  ] as const;
  return (
    <div className="absolute inset-0 flex justify-end bg-black/55 backdrop-blur-sm" style={{ zIndex: 1400 }} role="dialog" aria-modal="true" aria-labelledby="driver-tools-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="flex h-full w-full max-w-md flex-col overflow-y-auto border-s border-white/10 bg-[#0d0d0f]/98 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#e10600]">BlinkGo</p><h2 id="driver-tools-title" className="mt-1 text-2xl font-black">{copy.tools}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label={copy.close} data-testid="driver-tools-close" className="grid size-12 place-items-center rounded-2xl bg-white/5 hover:bg-white/10"><X className="size-5" /></button></div>

        <div className="mt-5 overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#1a1a1e] to-[#101012] p-4">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-white/45">{copy.shift}</p><p className="mt-1 flex items-center gap-2 font-black"><span className={cn('size-2.5 rounded-full', isOnline ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-white/25')} />{isOnline ? copy.online : copy.offline}</p></div><div className="grid size-12 place-items-center rounded-2xl bg-[#e10600]/15 text-[#ff3b35]"><Timer className="size-6" /></div></div>
          <div className="mt-4 grid grid-cols-3 gap-2"><DrawerMetric value={`${hours.toFixed(1)}h`} label={copy.hours} /><DrawerMetric value={String(stats.today.deliveries)} label={copy.deliveries} /><DrawerMetric value={formatMoney(stats.today.earnings, locale)} label={copy.earnings} /></div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <SummaryCard icon={CalendarClock} label={copy.week} value={formatMoney(stats.week.earnings, locale)} hint={`${stats.week.deliveries} ${copy.deliveries}`} />
          <SummaryCard icon={CircleDollarSign} label={copy.month} value={formatMoney(stats.month.earnings, locale)} hint={`${stats.month.deliveries} ${copy.deliveries}`} />
          <SummaryCard icon={Star} label={copy.rating} value={Number(data.driver?.rating || 0).toFixed(1)} hint={`${data.driver?.total_deliveries || 0} ${copy.deliveries}`} />
          <SummaryCard icon={Bike} label={copy.vehicle} value={vehicleLabel(data.driver?.vehicle_type, locale)} hint={copy.safety} />
        </div>

        <p className="mb-2 mt-6 text-xs font-black uppercase tracking-[.15em] text-white/40">{copy.allTools}</p>
        <div className="grid grid-cols-2 gap-3">{tools.map(({ href, label, hint, icon: Icon, color }) => <Link key={href} href={href} onClick={onClose} className="group rounded-2xl border border-white/10 bg-white/[.035] p-3 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[.07]"><div className={cn('grid size-10 place-items-center rounded-xl', color === 'red' && 'bg-[#e10600]/15 text-[#ff3b35]', color === 'yellow' && 'bg-[#ffc107]/12 text-[#ffc107]', color === 'green' && 'bg-emerald-500/12 text-emerald-400', color === 'neutral' && 'bg-white/8 text-white/70')}><Icon className="size-5" /></div><p className="mt-3 font-black">{label}</p><p className="mt-0.5 truncate text-xs text-white/40">{hint}</p></Link>)}</div>

        <Link href="/driver/support" onClick={onClose} data-testid="driver-tools-safety" className="mt-5 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 font-black text-emerald-300"><span className="flex items-center gap-2"><Headphones className="size-5" />{copy.safety}</span><ChevronRight className="size-5 rtl:rotate-180" /></Link>
      </aside>
    </div>
  );
}

function DrawerMetric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl bg-black/25 p-2 text-center"><p className="truncate text-sm font-black" dir="ltr">{value}</p><p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wide text-white/40">{label}</p></div>;
}

function SummaryCard({ icon: Icon, label, value, hint }: { icon: typeof Star; label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3"><Icon className="size-5 text-[#ffc107]" /><p className="mt-3 text-xs font-bold text-white/40">{label}</p><p className="mt-1 truncate text-lg font-black" dir="ltr">{value}</p><p className="mt-0.5 truncate text-[10px] text-white/35">{hint}</p></div>;
}

function IncomingOfferCard({ order, driver, pickup, dropoff, locale, copy, offerCount, busy, onAccept, onSkip }: {
  order: DriverOrder; driver: DriverMapPoint; pickup: DriverMapPoint | null; dropoff: DriverMapPoint | null; locale: Locale; copy: typeof COPY.de; offerCount: number; busy: boolean; onAccept: () => void; onSkip: () => void;
}) {
  const restaurant = restaurantOf(order);
  const payout = order.driver_offer?.earnings.total ?? computeEarnings(order).total;
  const pickupDistance = order.driver_offer?.pickupDistanceKm ?? directDistanceKm(driver, pickup);
  const deliveryDistance = order.driver_offer?.deliveryDistanceKm ?? (pickup && dropoff ? directDistanceKm(pickup, dropoff) : null);
  const distance = order.driver_offer?.routeDistanceKm ?? routeDistanceKm(driver, pickup, dropoff);
  const eta = order.driver_offer?.etaMinutes ?? (distance == null ? null : Math.max(8, Math.round(distance / 0.42)));
  const hourlyEstimate = order.driver_offer?.earningsPerHour ?? (eta == null ? null : payout / (eta / 60));
  const readiness = order.status === 'ready' ? copy.readyNow : copy.preparingNow;
  const smartCopy = OFFER_COPY[locale];
  const matchLevel = order.driver_offer?.matchLevel ?? 'unrated';
  const matchSignals = order.driver_offer?.matchSignals ?? [];
  return (
    <article className="overflow-hidden rounded-[30px] border border-white/15 bg-[#0d0d0d]/96 shadow-[0_28px_90px_rgba(0,0,0,.75)] backdrop-blur-2xl" aria-live="assertive" data-testid="incoming-driver-order" data-order-id={order.id} data-payout={payout.toFixed(2)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-[#e10600] via-[#c90400] to-[#650000] p-4 sm:p-5">
        <div className="absolute inset-y-0 end-0 w-1/2 opacity-25 [background:repeating-linear-gradient(-28deg,transparent_0_18px,#ffc107_19px_22px,transparent_23px_38px)]" />
        <div className="relative flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-white/80"><Zap className="size-4 text-[#ffc107]" />{copy.bestMatch}</p><p className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">{formatMoney(payout, locale)}</p><p className="text-sm font-bold text-white/70">{copy.guaranteed}</p></div><div className="rounded-2xl border border-white/20 bg-black/20 px-3 py-2 text-center"><p className="text-xs text-white/65">{copy.expires}</p><p className="mt-1 text-xl font-black"><Clock3 className="me-1 inline size-4" /><OfferCountdown orderId={order.id} onExpire={onSkip} /></p></div></div>
        <div className="relative mt-4 grid grid-cols-4 gap-2" data-testid="driver-offer-transparency"><Metric icon={Store} value={pickupDistance == null ? '—' : `${pickupDistance.toFixed(1)} km`} label={copy.pickupDistance} /><Metric icon={Navigation} value={deliveryDistance == null ? '—' : `${deliveryDistance.toFixed(1)} km`} label={copy.deliveryDistance} /><Metric icon={Clock3} value={eta == null ? '—' : `${eta} min`} label={copy.totalTime} /><Metric icon={CircleDollarSign} value={hourlyEstimate == null ? '—' : formatMoney(hourlyEstimate, locale)} label={copy.hourlyEstimate} /></div>
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3" data-testid="driver-offer-recommendation">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase tracking-[.13em] text-white/45">{smartCopy.why}</p><p className="mt-1 text-sm font-black text-[#ffc107]">{smartCopy[matchLevel]}</p></div>
            <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/55">{offerCount} {smartCopy.queue}</span>
          </div>
          {matchSignals.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{matchSignals.map((signal) => <span key={signal} className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">{smartCopy[signal]}</span>)}</div>}
          <p className="mt-2 text-[10px] leading-4 text-white/40">{smartCopy.fairRanking}</p>
        </div>
        <RouteRow icon={Store} color="yellow" label={pickup?.label || restaurant.name || 'Restaurant'} address={addressText(order.restaurant_address ?? restaurant.address)} tag={readiness} />
        <div className="ms-[21px] h-4 border-s-2 border-dashed border-white/20" />
        <RouteRow icon={MapPin} color="red" label={copy.customer} address={addressText(order.delivery_address)} tag={copy.dropoff} />
        <div className="grid grid-cols-[.8fr_1.2fr] gap-3 pt-1"><button type="button" onClick={onSkip} disabled={busy} data-testid="driver-offer-skip" className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-2 font-black hover:bg-white/10 disabled:opacity-50"><span className="flex items-center gap-2"><X className="size-5" />{copy.skip}</span><span className="mt-0.5 text-[9px] font-bold text-white/45">{copy.noSkipPenalty}</span></button><button type="button" onClick={onAccept} disabled={busy} data-testid="driver-offer-accept" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-[#e10600] text-lg font-black shadow-[0_10px_32px_rgba(225,6,0,.35)] hover:bg-[#ff1811] disabled:opacity-50">{busy ? <Loader2 className="size-6 animate-spin" /> : <Check className="size-6" />}{copy.accept}</button></div>
      </div>
    </article>
  );
}

function ActiveDeliveryCard({ order, driver, pickup, dropoff, locale, copy, busy, networkOnline, onNavigate, onPickup, onRequestComplete, onArrive, onRelease, onReportIssue, onFailDelivery }: {
  order: DriverOrder; driver: DriverMapPoint; pickup: DriverMapPoint | null; dropoff: DriverMapPoint | null; locale: Locale; copy: typeof COPY.de; busy: string | null; networkOnline: boolean; onNavigate: (point: DriverMapPoint | null) => void; onPickup: () => void; onRequestComplete: () => void; onArrive: (stage: 'pickup' | 'dropoff') => void; onRelease: () => void; onReportIssue: () => void; onFailDelivery: () => void;
}) {
  const status = order.status || 'confirmed';
  const customerPhase = ['picked_up', 'delivering'].includes(status);
  const heading = customerPhase ? copy.onWay : status === 'ready' ? copy.ready : copy.preparing;
  const action = customerPhase
    ? (order.arrived_dropoff_at ? 'complete' : 'arrive-dropoff')
    : (!order.arrived_pickup_at ? 'arrive-pickup' : ['ready', 'assigned'].includes(status) ? 'pickup' : 'waiting');
  const label = action === 'pickup' ? copy.confirmPickup : action === 'complete' ? copy.complete : action === 'arrive-pickup' ? copy.arrivePickup : action === 'arrive-dropoff' ? copy.arriveDropoff : copy.waitingAtRestaurant;
  const restaurant = restaurantOf(order);
  const restaurantPhone = String(order.restaurant_phone || restaurant.phone || '').replace(/[^\d+]/g, '');
  const customerPhone = String(order.customer_phone || one(order.customer)?.phone || '').replace(/[^\d+]/g, '');
  const routeKm = directDistanceKm(driver, customerPhase ? dropoff : pickup);
  const payout = computeEarnings(order).total;
  const privateDeliveryInstructions = order.delivery_preferences && hasDeliveryPreferences(order.delivery_preferences)
    ? formatDeliveryPreferences(order.delivery_preferences, locale)
    : order.delivery_instructions;
  return (
    <article className="overflow-hidden rounded-[30px] border border-white/15 bg-[#0d0d0d]/96 shadow-[0_28px_90px_rgba(0,0,0,.75)] backdrop-blur-2xl" data-testid="active-driver-order" data-order-id={order.id} data-payout={payout.toFixed(2)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#ff3b35]">{copy.active}</p><h1 className="mt-1 text-xl font-black">{heading}</h1></div><div className="rounded-2xl bg-white/5 px-3 py-2 text-end"><p className="text-[10px] text-white/45">{copy.order}</p><p className="font-black" dir="ltr">#{order.order_number || order.id.slice(0, 8)}</p></div></div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2"><Metric icon={Navigation} value={routeKm == null ? '—' : `${routeKm.toFixed(1)} km`} label="Route" /><Metric icon={Clock3} value={routeKm == null ? '—' : `${Math.max(3, Math.round(routeKm / .42))} min`} label={copy.totalTime} /><Metric icon={CircleDollarSign} value={formatMoney(payout, locale)} label={copy.guaranteed} /></div>
        <RouteRow icon={Store} color="yellow" label={pickup?.label || 'Restaurant'} address={addressText(order.restaurant_address ?? restaurant.address)} tag={copy.pickup} /><div className="ms-[21px] h-4 border-s-2 border-dashed border-white/20" /><RouteRow icon={MapPin} color="red" label={dropoff?.label || copy.customer} address={addressText(order.delivery_address)} tag={copy.dropoff} />
        {privateDeliveryInstructions && <div className="rounded-2xl border border-[#ffc107]/20 bg-[#ffc107]/8 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[#ffc107]">{copy.instructions}</p><p className="mt-1 text-sm text-white/75">{privateDeliveryInstructions}</p></div>}
        {order.arrived_pickup_at && !customerPhase && <div data-testid="driver-pickup-wait-timer" className="flex min-h-14 items-center justify-between rounded-2xl border border-[#ffc107]/25 bg-[#ffc107]/10 px-4"><span className="text-sm font-black text-[#ffc107]">{copy.waitingAtRestaurant}</span><ElapsedSince since={order.arrived_pickup_at} /></div>}
        {order.arrived_dropoff_at && customerPhase && <div data-testid="driver-dropoff-arrived" className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-center text-sm font-black text-emerald-300">{copy.arrivedAtCustomer}</div>}
        <div className="grid grid-cols-2 gap-2">{restaurantPhone && <a href={`tel:${restaurantPhone}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/5 text-xs font-black hover:bg-white/10"><Phone className="size-4 text-[#ffc107]" />{copy.callRestaurant}</a>}{customerPhone && <a href={`tel:${customerPhone}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/5 text-xs font-black hover:bg-white/10"><Phone className="size-4 text-[#e10600]" />{copy.callCustomer}</a>}<button type="button" onClick={onReportIssue} disabled={Boolean(busy) || !networkOnline} data-testid="driver-active-report-issue" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/5 text-xs font-black hover:bg-white/10 disabled:opacity-50"><AlertTriangle className="size-4 text-[#ffc107]" />{locale === 'ar' ? 'الإبلاغ عن مشكلة' : locale === 'en' ? 'Report a problem' : 'Problem melden'}</button><Link href={`/driver/support?new=1&order=${encodeURIComponent(order.id)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/5 text-xs font-black hover:bg-white/10"><Headphones className="size-4 text-emerald-400" />{copy.support}</Link></div>
        {customerPhase && order.arrived_dropoff_at && <button type="button" onClick={onFailDelivery} disabled={Boolean(busy) || !networkOnline} data-testid="driver-active-fail-delivery" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 text-sm font-black text-red-300 hover:bg-red-500/15 disabled:opacity-50"><AlertTriangle className="size-4" />{locale === 'ar' ? 'تعذّر التسليم' : locale === 'en' ? 'Unable to deliver' : 'Zustellung nicht möglich'}</button>}
        {action !== 'waiting' && <button type="button" onClick={() => action === 'arrive-pickup' ? onArrive('pickup') : action === 'arrive-dropoff' ? onArrive('dropoff') : action === 'complete' ? onRequestComplete() : onPickup()} disabled={Boolean(busy) || !networkOnline} data-testid={`driver-active-${action}`} className="mt-2 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#e10600] text-lg font-black shadow-[0_10px_32px_rgba(225,6,0,.35)] hover:bg-[#ff1811] disabled:opacity-50">{busy ? <Loader2 className="size-6 animate-spin" /> : action.startsWith('arrive') ? <MapPin className="size-6" /> : <Check className="size-6" />}{label}<ChevronRight className="size-5 rtl:rotate-180" /></button>}
        <button type="button" onClick={() => onNavigate(customerPhase ? dropoff : pickup)} data-testid="driver-active-navigate" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/5 text-sm font-black hover:bg-white/10"><Navigation className="size-4" />{customerPhase ? copy.navigateDropoff : copy.navigatePickup}</button>
        {!customerPhase && <button type="button" onClick={onRelease} disabled={Boolean(busy) || !networkOnline} data-testid="driver-active-release" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 text-sm font-black text-red-300 hover:bg-red-500/15 disabled:opacity-50"><X className="size-4" />{locale === 'ar' ? 'تحرير الرحلة' : locale === 'en' ? 'Release delivery' : 'Tour freigeben'}</button>}
      </div>
    </article>
  );
}

function ElapsedSince({ since }: { since: string }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000)));
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000))), 1_000);
    return () => window.clearInterval(timer);
  }, [since]);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return <span className="font-mono text-lg font-black tabular-nums text-white" dir="ltr">{String(minutes).padStart(2, '0')}:{String(remainder).padStart(2, '0')}</span>;
}

function Metric({ icon: Icon, value, label }: { icon: typeof Navigation; value: string; label: string }) {
  return <div className="rounded-xl border border-white/12 bg-black/20 p-2"><Icon className="size-4 text-[#ffc107]" /><p className="mt-1 text-sm font-black" dir="ltr">{value}</p><p className="truncate text-[9px] font-bold uppercase tracking-wide text-white/55">{label}</p></div>;
}

function RouteRow({ icon: Icon, color, label, address, tag }: { icon: typeof Store; color: 'yellow' | 'red'; label: string; address: string; tag: string }) {
  return <div className="flex items-center gap-3"><div className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', color === 'yellow' ? 'bg-[#ffc107]/15 text-[#ffc107]' : 'bg-[#e10600]/15 text-[#ff3b35]')}><Icon className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-black">{label}</p><span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white/45">{tag}</span></div><p className="mt-0.5 truncate text-xs text-white/50">{address}</p></div></div>;
}
