'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Check from 'lucide-react/dist/esm/icons/check';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import Eye from 'lucide-react/dist/esm/icons/eye';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Store from 'lucide-react/dist/esm/icons/store';
import PackageCheck from 'lucide-react/dist/esm/icons/package-check';
import Phone from 'lucide-react/dist/esm/icons/phone';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Search from 'lucide-react/dist/esm/icons/search';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import UserRound from 'lucide-react/dist/esm/icons/user-round';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import X from 'lucide-react/dist/esm/icons/x';
import { cn } from '@/lib/cn';
import { formatAddress } from '@/lib/format-address';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { haptic } from '@/lib/utils/haptics';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

type PersonRelation = { name?: string | null; phone?: string | null };

export type RestaurantOrderListItem = {
  id: string;
  order_number?: string | null;
  status: string;
  fulfillment_type?: 'delivery' | 'pickup';
  pickup_code?: string | null;
  total?: number | null;
  tip?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  created_at: string;
  accepted_at?: string | null;
  prepared_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  delivery_address?: unknown;
  delivery_instructions?: string | null;
  customer?: PersonRelation | PersonRelation[] | null;
  driver?: PersonRelation | PersonRelation[] | null;
  item_count?: number;
};

type Props = {
  restaurantId: string;
  restaurantName: string;
  initialOrders: RestaurantOrderListItem[];
};

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivering']);
const NEXT_STATUS: Record<string, string | undefined> = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready' };

const COPY = {
  de: {
    eyebrow: 'BLINKGO · RESTAURANT', title: 'Bestellzentrale', subtitle: 'Alle Bestellungen, Status und Kundenkontakte an einem Ort.', kitchen: 'Küchenansicht', refresh: 'Aktualisieren', online: 'Live verbunden', offline: 'Offline – der letzte Stand bleibt sichtbar und Aktionen sind gesperrt.',
    total: 'Bestellungen', active: 'Aktiv', new: 'Neu', ready: 'Abholbereit', todayRevenue: 'Heutiger Umsatz', search: 'Bestellnummer, Kunde oder Adresse suchen', filters: 'Bestellstatus', all: 'Alle', preparing: 'Zubereitung', delivered: 'Zugestellt', cancelled: 'Storniert',
    results: (shown: number, all: number) => `${shown} von ${all} Bestellungen`, noOrders: 'Keine passenden Bestellungen', noOrdersBody: 'Passe Suche oder Filter an. Neue Bestellungen erscheinen automatisch.', clear: 'Filter zurücksetzen', customer: 'Kunde', driver: 'Fahrer', unassigned: 'Noch kein Fahrer', items: 'Artikel', payment: 'Zahlung', address: 'Lieferadresse', details: 'Details', call: 'Anrufen',
    accept: 'Annehmen', decline: 'Ablehnen', start: 'Zubereitung starten', markReady: 'Abholbereit', waitingDriver: 'Wartet auf Fahrer', onWay: 'Unterwegs zum Kunden', completed: 'Abgeschlossen', confirmDecline: 'Diese Bestellung wirklich ablehnen?', updated: 'Bestellstatus aktualisiert.', failed: 'Status konnte nicht aktualisiert werden.', minutes: 'Min',
    tabs: { active: 'Aktiv', pending: 'Neu', confirmed: 'Bestätigt', preparing: 'Zubereitung', ready: 'Bereit', picked_up: 'Abgeholt', delivering: 'Unterwegs', delivered: 'Zugestellt', cancelled: 'Storniert' },
  },
  ar: {
    eyebrow: 'BLINKGO · المطعم', title: 'مركز الطلبات', subtitle: 'كل الطلبات والحالات وبيانات التواصل في مكان واحد.', kitchen: 'شاشة المطبخ', refresh: 'تحديث', online: 'متصل مباشرة', offline: 'لا يوجد اتصال — آخر حالة ظاهرة والإجراءات متوقفة.',
    total: 'الطلبات', active: 'نشط', new: 'جديد', ready: 'جاهز للاستلام', todayRevenue: 'إيراد اليوم', search: 'ابحث برقم الطلب أو الزبون أو العنوان', filters: 'حالة الطلب', all: 'الكل', preparing: 'قيد التحضير', delivered: 'تم التوصيل', cancelled: 'ملغي',
    results: (shown: number, all: number) => `${shown} من أصل ${all} طلب`, noOrders: 'لا توجد طلبات مطابقة', noOrdersBody: 'غيّر البحث أو الفلتر. ستظهر الطلبات الجديدة تلقائيًا.', clear: 'إعادة ضبط الفلاتر', customer: 'الزبون', driver: 'السائق', unassigned: 'لم يُعيّن سائق بعد', items: 'عناصر', payment: 'الدفع', address: 'عنوان التوصيل', details: 'التفاصيل', call: 'اتصال',
    accept: 'قبول', decline: 'رفض', start: 'بدء التحضير', markReady: 'جاهز للاستلام', waitingDriver: 'بانتظار السائق', onWay: 'في الطريق إلى الزبون', completed: 'مكتمل', confirmDecline: 'هل تريد رفض هذا الطلب؟', updated: 'تم تحديث حالة الطلب.', failed: 'تعذر تحديث حالة الطلب.', minutes: 'د',
    tabs: { active: 'نشط', pending: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التحضير', ready: 'جاهز', picked_up: 'تم الاستلام', delivering: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي' },
  },
  en: {
    eyebrow: 'BLINKGO · RESTAURANT', title: 'Order center', subtitle: 'Orders, live status and customer contacts in one place.', kitchen: 'Kitchen display', refresh: 'Refresh', online: 'Live connected', offline: 'Offline – showing the last known state and locking actions.',
    total: 'Orders', active: 'Active', new: 'New', ready: 'Ready for pickup', todayRevenue: 'Today revenue', search: 'Search order number, customer or address', filters: 'Order status', all: 'All', preparing: 'Preparing', delivered: 'Delivered', cancelled: 'Cancelled',
    results: (shown: number, all: number) => `${shown} of ${all} orders`, noOrders: 'No matching orders', noOrdersBody: 'Adjust the search or filters. New orders appear automatically.', clear: 'Reset filters', customer: 'Customer', driver: 'Driver', unassigned: 'No driver assigned', items: 'items', payment: 'Payment', address: 'Delivery address', details: 'Details', call: 'Call',
    accept: 'Accept', decline: 'Decline', start: 'Start preparation', markReady: 'Mark ready', waitingDriver: 'Waiting for driver', onWay: 'On the way to customer', completed: 'Completed', confirmDecline: 'Decline this order?', updated: 'Order status updated.', failed: 'Order status could not be updated.', minutes: 'min',
    tabs: { active: 'Active', pending: 'New', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready', picked_up: 'Picked up', delivering: 'Delivering', delivered: 'Delivered', cancelled: 'Cancelled' },
  },
} satisfies Record<Locale, Record<string, unknown>>;

const FILTERS = ['all', 'active', 'pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'delivered', 'cancelled'] as const;

const STATUS_TONE: Record<string, string> = {
  pending: 'border-sky-400/30 bg-sky-400/10 text-sky-300', confirmed: 'border-violet-400/30 bg-violet-400/10 text-violet-300', preparing: 'border-amber-400/30 bg-amber-400/10 text-amber-200', ready: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300', picked_up: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300', delivering: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300', delivered: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300', cancelled: 'border-red-400/30 bg-red-400/10 text-red-300',
};

function relationOne(value: PersonRelation | PersonRelation[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function minutesSince(value: string, now: number) {
  if (!now) return 0;
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
}

function orderNumber(order: RestaurantOrderListItem) {
  return order.order_number || order.id.slice(0, 8).toUpperCase();
}

export function RestaurantOrdersClient({ restaurantId, restaurantName, initialOrders }: Props) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale] as typeof COPY.de;
  const network = useOnlineStatus();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);

  const refresh = useCallback(() => {
    if (!network.isOnline) return;
    startRefresh(() => router.refresh());
  }, [network.isOnline, router]);

  const queueRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(refresh, 160);
  }, [refresh]);

  useEffect(() => () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
  }, []);

  useRealtime({ enabled: Boolean(network.isOnline && restaurantId), channels: [{ name: `restaurant-order-center-${restaurantId}`, table: 'orders', event: '*', filter: `restaurant_id=eq.${restaurantId}`, onChange: queueRefresh }] });

  useEffect(() => {
    if (!network.isOnline) return;
    const interval = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(interval);
  }, [network.isOnline, refresh]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: orders.length, active: 0 };
    for (const order of orders) {
      result[order.status] = (result[order.status] ?? 0) + 1;
      if (ACTIVE_STATUSES.has(order.status)) result.active += 1;
    }
    return result;
  }, [orders]);

  const todayRevenue = useMemo(() => {
    const today = new Date();
    return orders.filter((order) => order.status === 'delivered' && new Date(order.delivered_at || order.created_at).toDateString() === today.toDateString()).reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  }, [orders]);

  const filtered = useMemo(() => orders.filter((order) => {
    if (filter === 'active' && !ACTIVE_STATUSES.has(order.status)) return false;
    if (filter !== 'all' && filter !== 'active' && order.status !== filter) return false;
    if (!deferredSearch) return true;
    const customer = relationOne(order.customer);
    const driver = relationOne(order.driver);
    return [order.id, order.order_number, customer?.name, customer?.phone, driver?.name, formatAddress(order.delivery_address, '')].some((value) => String(value ?? '').toLowerCase().includes(deferredSearch));
  }), [deferredSearch, filter, orders]);

  const updateStatus = async (order: RestaurantOrderListItem, status: string) => {
    if (!network.isOnline || busyOrderId) return;
    if (status === 'cancelled' && !window.confirm(copy.confirmDecline)) return;
    setBusyOrderId(order.id);
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
    try {
      const response = await fetch('/api/orders/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify({ order_id: order.id, status, metadata: status === 'cancelled' ? { reason: 'restaurant_declined' } : {} }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(extractErrorMessage(payload, copy.failed));
      haptic('success');
      success(copy.updated);
      startRefresh(() => router.refresh());
    } catch (cause) {
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: order.status } : item));
      toastError(cause instanceof Error ? cause.message : copy.failed);
    } finally { setBusyOrderId(null); }
  };

  return (
    <section data-testid="restaurant-order-center" className="min-h-[calc(100vh-7rem)] bg-[#09090b] px-3 py-4 text-white sm:px-6 lg:px-8 lg:py-7" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.18),transparent_36%),linear-gradient(145deg,#17171b,#0d0d10)] p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-[11px] font-black tracking-[0.2em] text-[#ff3029]">{copy.eyebrow}</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{copy.title}</h1><p className="mt-1 text-sm text-zinc-400">{restaurantName} · {copy.subtitle}</p></div>
            <div className="flex flex-wrap gap-2">
              <span data-testid="restaurant-orders-network" className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold', network.isOnline ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-red-400/30 bg-red-400/10 text-red-200')}>
                {network.isOnline ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /> : <WifiOff className="h-4 w-4" />}{network.isOnline ? copy.online : copy.offline}
              </span>
              <button type="button" onClick={refresh} disabled={!network.isOnline || refreshing} data-testid="restaurant-orders-refresh" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-bold hover:bg-white/[0.08] disabled:opacity-45"><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />{copy.refresh}</button>
              <Link href="/restaurant/kitchen" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e10600] px-4 text-sm font-black hover:bg-[#ff1e17]"><ChefHat className="h-4 w-4" />{copy.kitchen}</Link>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
              { label: copy.total, value: orders.length, tone: 'text-white' }, { label: copy.active, value: counts.active, tone: 'text-amber-300' }, { label: copy.new, value: counts.pending ?? 0, tone: 'text-sky-300' }, { label: copy.ready, value: counts.ready ?? 0, tone: 'text-emerald-300' }, { label: copy.todayRevenue, value: formatCurrency(todayRevenue, locale), tone: 'text-[#ffca0a]' },
            ].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-bold text-zinc-500">{item.label}</p><strong className={cn('mt-1 block text-xl font-black tabular-nums sm:text-2xl', item.tone)}>{item.value}</strong></div>)}
          </div>
        </header>

        {!network.isOnline ? <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100"><WifiOff className="h-5 w-5 shrink-0" />{copy.offline}</div> : null}

        <div className="rounded-[24px] border border-white/10 bg-[#121216] p-3 sm:p-4">
          <label className="relative block">
            <span className="sr-only">{copy.search}</span><Search className={cn('absolute top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500', locale === 'ar' ? 'right-4' : 'left-4')} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} data-testid="restaurant-orders-search" className={cn('min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#e10600]', locale === 'ar' ? 'pr-12 pl-4' : 'pl-12 pr-4')} />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={copy.filters}>
            {FILTERS.map((value) => {
              const label = value === 'all' ? copy.all : copy.tabs[value];
              return <button key={value} type="button" role="tab" data-testid={`restaurant-orders-filter-${value}`} aria-selected={filter === value} onClick={() => setFilter(value)} className={cn('min-h-11 shrink-0 rounded-xl border px-3 text-xs font-black', filter === value ? 'border-[#e10600] bg-[#e10600] text-white' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white')}>{label}<span className="ms-1.5 tabular-nums opacity-70">{counts[value] ?? 0}</span></button>;
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-1"><p className="text-sm font-bold text-zinc-400">{copy.results(filtered.length, orders.length)}</p>{search || filter !== 'all' ? <button type="button" onClick={() => { setSearch(''); setFilter('all'); }} className="min-h-11 rounded-xl px-3 text-xs font-black text-[#ff3029] hover:bg-red-500/10">{copy.clear}</button> : null}</div>

        {filtered.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-[28px] border border-dashed border-white/10 bg-[#111115] p-6 text-center"><div><ShoppingBag className="mx-auto h-10 w-10 text-zinc-700" /><h2 className="mt-3 text-lg font-black">{copy.noOrders}</h2><p className="mt-1 max-w-md text-sm text-zinc-500">{copy.noOrdersBody}</p><button type="button" onClick={() => { setSearch(''); setFilter('all'); }} className="mt-4 min-h-11 rounded-xl bg-[#e10600] px-4 text-sm font-black">{copy.clear}</button></div></div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((order) => {
              const customer = relationOne(order.customer);
              const driver = relationOne(order.driver);
              const age = minutesSince(order.created_at, now);
              const late = age >= 25 && ACTIVE_STATUSES.has(order.status) && order.status !== 'ready';
              const next = NEXT_STATUS[order.status];
              const isBusy = busyOrderId === order.id;
              return (
                <article key={order.id} data-testid="restaurant-order-row" data-order-id={order.id} className={cn('rounded-[24px] border bg-[#121216] p-4 shadow-xl shadow-black/15 sm:p-5', late ? 'border-red-500/60 ring-2 ring-red-500/10' : 'border-white/10')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-mono text-base font-black text-[#ff3029]" dir="ltr">#{orderNumber(order)}</h2><span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-black', STATUS_TONE[order.status] ?? 'border-white/10 bg-white/5 text-zinc-300')}>{copy.tabs[order.status as keyof typeof copy.tabs] ?? order.status}</span></div><p className="mt-2 flex items-center gap-2 truncate text-sm font-bold"><UserRound className="h-4 w-4 text-zinc-500" />{customer?.name || '—'}</p></div>
                    <div className="shrink-0 text-end"><strong className="block text-lg font-black">{formatCurrency(Number(order.total ?? 0), locale)}</strong><span className="text-[11px] text-zinc-500">{order.payment_method || 'online'}</span></div>
                  </div>

                  {late ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-black text-red-300"><AlertTriangle className="h-4 w-4" />{age} {copy.minutes}</div> : null}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-xl bg-white/[0.035] p-2.5"><span className="text-zinc-600">{copy.items}</span><strong data-testid="restaurant-order-item-count" className="mt-1 block text-zinc-200">{order.item_count ?? 0}</strong></div>
                    <div className="rounded-xl bg-white/[0.035] p-2.5"><span className="text-zinc-600">{copy.payment}</span><strong className="mt-1 block truncate text-zinc-200">{order.payment_status || order.payment_method || '—'}</strong></div>
                    <div className="col-span-2 rounded-xl bg-white/[0.035] p-2.5"><span className="text-zinc-600">{order.fulfillment_type === 'pickup' ? (locale === 'ar' ? 'رمز الاستلام' : locale === 'en' ? 'Pickup code' : 'Abholcode') : copy.driver}</span><strong className="mt-1 block truncate text-zinc-200">{order.fulfillment_type === 'pickup' ? order.pickup_code : (driver?.name || copy.unassigned)}</strong></div>
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-xs text-zinc-500">{order.fulfillment_type === 'pickup' ? <Store className="mt-0.5 h-4 w-4 shrink-0 text-[#ffca0a]" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />}<span className="line-clamp-2">{order.fulfillment_type === 'pickup' ? (locale === 'ar' ? 'سيستلم الزبون الطلب من المطعم' : locale === 'en' ? 'Customer pickup at restaurant' : 'Selbstabholung durch den Kunden') : formatAddress(order.delivery_address)}</span></p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-zinc-600"><Clock3 className="h-4 w-4" />{new Date(order.created_at).toLocaleString(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {age} {copy.minutes}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/restaurant/orders/${order.id}`} data-testid="restaurant-order-details" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-black text-zinc-300 hover:bg-white/[0.08]"><Eye className="h-4 w-4" />{copy.details}<ChevronRight className={cn('h-4 w-4', locale === 'ar' && 'rotate-180')} /></Link>
                    {customer?.phone ? <a href={`tel:${customer.phone}`} aria-label={`${copy.call} ${customer.name || copy.customer}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/[0.08]"><Phone className="h-4 w-4" /></a> : null}
                    {next ? <button type="button" onClick={() => updateStatus(order, next)} disabled={!network.isOnline || Boolean(busyOrderId)} data-testid={`restaurant-list-order-${next}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#e10600] to-[#ff2c22] px-3 text-xs font-black text-white disabled:opacity-45">{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : next === 'confirmed' ? <Check className="h-4 w-4" /> : next === 'preparing' ? <ChefHat className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}{next === 'confirmed' ? copy.accept : next === 'preparing' ? copy.start : copy.markReady}</button> : order.status === 'ready' ? <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-black text-emerald-300"><PackageCheck className="h-4 w-4" />{copy.waitingDriver}</span> : order.status === 'picked_up' || order.status === 'delivering' ? <span className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 text-xs font-black text-cyan-300">{copy.onWay}</span> : order.status === 'delivered' ? <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-black text-emerald-300"><CircleCheck className="h-4 w-4" />{copy.completed}</span> : null}
                    {order.status === 'pending' || order.status === 'confirmed' ? <button type="button" onClick={() => updateStatus(order, 'cancelled')} disabled={!network.isOnline || Boolean(busyOrderId)} data-testid="restaurant-list-order-cancel" aria-label={`${copy.decline} #${orderNumber(order)}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-red-400/25 text-red-300 hover:bg-red-500/10 disabled:opacity-45"><X className="h-4 w-4" /></button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
