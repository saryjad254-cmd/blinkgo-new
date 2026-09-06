'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, Bell, BookOpen, Check, CheckCircle2, ChefHat, ChevronRight, Clock, Euro,
  Flame, Headphones, Loader2, MapPin, Package, Pause, Phone, Power, Star, Timer, TrendingUp,
  Volume2, VolumeX, X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatAddress } from '@/lib/format-address';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { haptic } from '@/lib/utils/haptics';
import { playDriverSound } from '@/lib/utils/driver-sound';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, KpiTile, PortalCard, SectionTitle, StatusPill } from '@/components/portal/PortalPrimitives';
import { preparationState, remainingPreparationMinutes } from '@/lib/restaurant/preparation-policy';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

interface RestaurantRecord {
  id: string;
  name?: string | null;
  is_active?: boolean | null;
  is_paused?: boolean | null;
  busy_mode?: boolean | null;
  busy_mode_until?: string | null;
  rating?: number | null;
  review_count?: number | null;
  address?: unknown;
}

interface RestaurantOrderItem {
  product_name?: string | null;
  quantity?: number | null;
  subtotal?: number | null;
}

interface CustomerRelation { name?: string | null; phone?: string | null }

interface RestaurantOrder {
  id: string;
  order_number?: string | null;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready';
  total?: number | null;
  created_at: string;
  accepted_at?: string | null;
  prepared_at?: string | null;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
  delivery_address?: unknown;
  customer?: CustomerRelation | CustomerRelation[] | null;
  items?: RestaurantOrderItem[];
}

interface RestaurantData {
  restaurant: RestaurantRecord | null;
  today: { orders: number; revenue: number; averagePrepMinutes: number | null };
  week: { orders: number; revenue: number };
  activeOrders: RestaurantOrder[];
  pendingCount: number;
  menuCount: number;
  recentOrders: unknown[];
}

const COPY = {
  de: {
    portal: 'Restaurant-Zentrale', open: 'Geöffnet', closed: 'Geschlossen', openHint: 'Neue Bestellungen werden angenommen.', closedHint: 'Neue Bestellungen sind pausiert.', openAction: 'Restaurant öffnen', closeAction: 'Bestellannahme pausieren', inactive: 'Vom Betreiber deaktiviert – Support kontaktieren',
    busy: 'Auslastungsmodus', busyOff: 'Normalbetrieb', busyUntil: 'Erhöhte Zubereitungszeit bis', busyFor: 'Auslastung aktivieren für', minutes: 'Minuten', stopBusy: 'Auslastungsmodus beenden',
    today: 'Heute', todayRevenue: 'Heutiger Umsatz', weekRevenue: 'Wochenumsatz', pending: 'Neue Aufträge', avgPrep: 'Ø Zubereitung', orders: 'Bestellungen', menu: 'Speisekarte', kitchen: 'Küche', support: 'Support', notifications: 'Benachrichtigungen',
    operations: 'Live-Bestellungen', capacity: 'Kapazität', noOrders: 'Keine aktiven Bestellungen', noOrdersBody: 'Neue Bestellungen erscheinen automatisch. Küche und Speisekarte bleiben direkt erreichbar.',
    customer: 'Kunde', items: 'Positionen', accept: 'Annehmen', decline: 'Ablehnen', start: 'Zubereitung starten', readyAction: 'Abholbereit melden', waitingDriver: 'Wartet auf Fahrer', detail: 'Details', call: 'Anrufen',
    confirmDecline: 'Diese Bestellung wirklich ablehnen?', declineReason: 'Vom Restaurant abgelehnt', networkOffline: 'Keine Internetverbindung – der letzte Stand bleibt sichtbar und Änderungen sind gesperrt.', syncProblem: 'Live-Aktualisierung unterbrochen.', actionFailed: 'Aktion konnte nicht ausgeführt werden.', saved: 'Status aktualisiert.', soundOn: 'Bestellton eingeschaltet', soundOff: 'Bestellton ausgeschaltet',
    total: 'Gesamt', reviews: 'Bewertungen', products: 'Produkte', waiting: 'wartend', surge: 'Hohe Auslastung', normal: 'Normal', elapsed: 'seit Eingang',
    states: { pending: 'Neu', confirmed: 'Bestätigt', preparing: 'In Zubereitung', ready: 'Abholbereit' },
  },
  ar: {
    portal: 'مركز المطعم', open: 'مفتوح', closed: 'مغلق', openHint: 'يتم استقبال الطلبات الجديدة.', closedHint: 'استقبال الطلبات الجديدة متوقف.', openAction: 'فتح المطعم', closeAction: 'إيقاف استقبال الطلبات', inactive: 'معطّل من إدارة المنصة — تواصل مع الدعم',
    busy: 'وضع الضغط', busyOff: 'تشغيل طبيعي', busyUntil: 'زمن تحضير إضافي حتى', busyFor: 'تفعيل وضع الضغط لمدة', minutes: 'دقيقة', stopBusy: 'إنهاء وضع الضغط',
    today: 'اليوم', todayRevenue: 'إيراد اليوم', weekRevenue: 'إيراد الأسبوع', pending: 'طلبات جديدة', avgPrep: 'متوسط التحضير', orders: 'الطلبات', menu: 'قائمة الطعام', kitchen: 'المطبخ', support: 'الدعم', notifications: 'الإشعارات',
    operations: 'الطلبات المباشرة', capacity: 'الاستيعاب', noOrders: 'لا توجد طلبات نشطة', noOrdersBody: 'ستظهر الطلبات الجديدة تلقائيًا، ويمكنك الوصول مباشرة إلى المطبخ وقائمة الطعام.',
    customer: 'الزبون', items: 'العناصر', accept: 'قبول', decline: 'رفض', start: 'بدء التحضير', readyAction: 'جاهز للاستلام', waitingDriver: 'بانتظار السائق', detail: 'التفاصيل', call: 'اتصال',
    confirmDecline: 'هل تريد رفض هذا الطلب؟', declineReason: 'مرفوض من المطعم', networkOffline: 'لا يوجد اتصال بالإنترنت — آخر حالة ظاهرة والتغييرات متوقفة.', syncProblem: 'توقف التحديث المباشر مؤقتًا.', actionFailed: 'تعذر تنفيذ الإجراء.', saved: 'تم تحديث الحالة.', soundOn: 'صوت الطلبات مفعّل', soundOff: 'صوت الطلبات متوقف',
    total: 'الإجمالي', reviews: 'تقييمات', products: 'منتجات', waiting: 'بانتظارك', surge: 'ضغط مرتفع', normal: 'طبيعي', elapsed: 'منذ الوصول',
    states: { pending: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التحضير', ready: 'جاهز للاستلام' },
  },
  en: {
    portal: 'Restaurant control center', open: 'Open', closed: 'Closed', openHint: 'New orders are being accepted.', closedHint: 'New order intake is paused.', openAction: 'Open restaurant', closeAction: 'Pause order intake', inactive: 'Disabled by platform operations — contact support',
    busy: 'Busy mode', busyOff: 'Normal operation', busyUntil: 'Extended prep time until', busyFor: 'Enable busy mode for', minutes: 'minutes', stopBusy: 'End busy mode',
    today: 'Today', todayRevenue: 'Today revenue', weekRevenue: 'Week revenue', pending: 'New orders', avgPrep: 'Avg. preparation', orders: 'Orders', menu: 'Menu', kitchen: 'Kitchen', support: 'Support', notifications: 'Notifications',
    operations: 'Live orders', capacity: 'Capacity', noOrders: 'No active orders', noOrdersBody: 'New orders appear automatically. Kitchen and menu remain directly accessible.',
    customer: 'Customer', items: 'items', accept: 'Accept', decline: 'Decline', start: 'Start preparation', readyAction: 'Mark ready', waitingDriver: 'Waiting for driver', detail: 'Details', call: 'Call',
    confirmDecline: 'Decline this order?', declineReason: 'Declined by restaurant', networkOffline: 'No internet connection — showing the last known state and blocking changes.', syncProblem: 'Live updates are temporarily interrupted.', actionFailed: 'The action could not be completed.', saved: 'Status updated.', soundOn: 'Order sound enabled', soundOff: 'Order sound disabled',
    total: 'Total', reviews: 'reviews', products: 'products', waiting: 'waiting', surge: 'High demand', normal: 'Normal', elapsed: 'since arrival',
    states: { pending: 'New', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready for pickup' },
  },
} satisfies Record<Locale, Record<string, unknown>>;

const PREP_COPY = {
  de: { promise: 'Abholbereit in', remaining: 'Noch', overdue: 'Überfällig', unit: 'Min.' },
  ar: { promise: 'جاهز للاستلام خلال', remaining: 'متبقي', overdue: 'متأخر', unit: 'دقيقة' },
  en: { promise: 'Ready for pickup in', remaining: 'Remaining', overdue: 'Overdue', unit: 'min' },
} satisfies Record<Locale, { promise: string; remaining: string; overdue: string; unit: string }>;

function formatEUR(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function customerOf(order: RestaurantOrder): CustomerRelation {
  return Array.isArray(order.customer) ? order.customer[0] ?? {} : order.customer ?? {};
}

function minutesSince(value: string, now: number) {
  if (!now) return 0;
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
}

export function RestaurantDashboardClient({ initialData }: { initialData: RestaurantData }) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale] as typeof COPY.de;
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast();
  const network = useOnlineStatus();
  const [data, setData] = useState(initialData);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [busyMinutes, setBusyMinutes] = useState(30);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [now, setNow] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const [syncFailed, setSyncFailed] = useState(false);
  const realtimeRefreshRef = useRef<number | null>(null);
  const restaurantId = data.restaurant?.id ?? '';
  const canControlIntake = data.restaurant?.is_active !== false;
  const isOpen = Boolean(data.restaurant?.is_active && !data.restaurant?.is_paused);
  const isBusy = Boolean(data.restaurant?.busy_mode);

  useEffect(() => {
    const start = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { window.clearTimeout(start); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const key = `blinkgo:restaurant-seen:${restaurantId}`;
    const currentIds = initialData.activeOrders.filter((order) => order.status === 'pending').map((order) => order.id);
    try {
      const stored = sessionStorage.getItem(key);
      const previous = JSON.parse(stored || '[]') as string[];
      if (stored !== null && currentIds.some((id) => !previous.includes(id)) && soundEnabled) {
        playDriverSound('offer');
        haptic('order-arrived');
      }
      sessionStorage.setItem(key, JSON.stringify(currentIds));
    } catch { /* Storage is best-effort. */ }
  }, [initialData.activeOrders, restaurantId, soundEnabled]);

  const requestRefresh = useCallback(() => {
    if (!network.isOnline) return;
    if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current);
    realtimeRefreshRef.current = window.setTimeout(() => {
      startRefresh(() => router.refresh());
      setSyncFailed(false);
    }, 180);
  }, [network.isOnline, router]);

  useEffect(() => () => {
    if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current);
  }, []);

  useRealtime({
    enabled: Boolean(restaurantId && network.isOnline),
    channels: [{
      name: `restaurant-dashboard-${restaurantId}`,
      table: 'orders',
      event: '*',
      filter: `restaurant_id=eq.${restaurantId}`,
      onChange: requestRefresh,
    }],
  });

  useEffect(() => {
    if (!network.isOnline) return;
    const timer = window.setInterval(() => {
      try { startRefresh(() => router.refresh()); setSyncFailed(false); }
      catch { setSyncFailed(true); }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [network.isOnline, router]);

  const toggleOpen = async () => {
    if (!network.isOnline) return;
    setBusyAction('open');
    try {
      const response = await fetch('/api/restaurant/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: isOpen }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setData((current) => ({ ...current, restaurant: current.restaurant ? { ...current.restaurant, is_paused: isOpen } : null }));
      haptic('success');
      toastSuccess(copy.saved);
      startRefresh(() => router.refresh());
    } catch (cause) { toastError(cause instanceof Error ? cause.message : copy.actionFailed); }
    finally { setBusyAction(null); }
  };

  const updateBusy = async (busy: boolean) => {
    if (!network.isOnline) return;
    setBusyAction('busy');
    try {
      const response = await fetch('/api/restaurant/busy-mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ busy, minutes: busyMinutes }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setData((current) => ({ ...current, restaurant: current.restaurant ? { ...current.restaurant, busy_mode: busy, busy_mode_until: payload.busyModeUntil ?? null } : null }));
      haptic(busy ? 'warning' : 'success');
      toastSuccess(copy.saved);
      startRefresh(() => router.refresh());
    } catch (cause) { toastError(cause instanceof Error ? cause.message : copy.actionFailed); }
    finally { setBusyAction(null); }
  };

  const updateOrderStatus = async (order: RestaurantOrder, status: 'confirmed' | 'preparing' | 'ready' | 'cancelled', estimatedPrepMinutes?: number) => {
    if (!network.isOnline || busyAction) return;
    const actionKey = `${status}-${order.id}`;
    setBusyAction(actionKey);
    try {
      const response = await fetch('/api/orders/status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale },
        body: JSON.stringify({
          order_id: order.id,
          status,
          metadata: status === 'cancelled'
            ? { reason: copy.declineReason }
            : status === 'confirmed'
              ? { estimated_prep_minutes: estimatedPrepMinutes }
              : {},
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setData((current) => ({
        ...current,
        pendingCount: order.status === 'pending' ? Math.max(0, current.pendingCount - 1) : current.pendingCount,
        activeOrders: status === 'cancelled'
          ? current.activeOrders.filter((candidate) => candidate.id !== order.id)
          : current.activeOrders.map((candidate) => candidate.id === order.id ? { ...candidate, status } : candidate),
      }));
      if (status === 'ready') playDriverSound('arrived');
      else playDriverSound('success');
      haptic(status === 'cancelled' ? 'warning' : 'success');
      toastSuccess(copy.saved);
      startRefresh(() => router.refresh());
    } catch (cause) { toastError(cause instanceof Error ? cause.message : copy.actionFailed); }
    finally { setBusyAction(null); }
  };

  const activeCount = data.activeOrders.length;
  const prepLoadCount = data.activeOrders.filter((order) => order.status !== 'ready').length;
  const capacity = Math.min(100, Math.round((prepLoadCount / 8) * 100));
  const sortedOrders = useMemo(() => [...data.activeOrders].sort((a, b) => {
    const rank = { pending: 0, confirmed: 1, preparing: 2, ready: 3 };
    return rank[a.status] - rank[b.status] || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }), [data.activeOrders]);

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-testid="restaurant-operations-dashboard">
      {(!network.isOnline || syncFailed) && <div role="status" data-testid="restaurant-network-status" className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm font-bold text-amber-700 dark:text-amber-300"><AlertCircle className="me-2 inline size-4" />{!network.isOnline ? copy.networkOffline : copy.syncProblem}</div>}

      <section className="overflow-hidden rounded-[28px] border border-border bg-gradient-to-br from-[#171719] via-[#101012] to-[#09090b] p-4 text-white shadow-2xl sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#e10600]">BlinkGo · {copy.portal}</p>
            <h1 className="mt-2 truncate text-2xl font-black sm:text-3xl">{data.restaurant?.name || copy.portal}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/55"><span className={cn('size-2.5 rounded-full', isOpen ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-white/30')} />{!canControlIntake ? copy.inactive : isOpen ? copy.openHint : copy.closedHint}</p>
            {Boolean(data.restaurant?.address) && <p className="mt-2 flex items-center gap-2 text-xs text-white/45"><MapPin className="size-4" />{formatAddress(data.restaurant?.address)}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setSoundEnabled((value) => !value); haptic('light'); toastInfo(soundEnabled ? copy.soundOff : copy.soundOn); }} aria-pressed={soundEnabled} aria-label={soundEnabled ? copy.soundOn : copy.soundOff} data-testid="restaurant-sound-toggle" className="grid size-12 place-items-center rounded-2xl border border-white/12 bg-white/5 hover:bg-white/10">{soundEnabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}</button>
            <Link href="/restaurant/notifications" aria-label={copy.notifications} className="grid size-12 place-items-center rounded-2xl border border-white/12 bg-white/5 hover:bg-white/10"><Bell className="size-5" /></Link>
            <button type="button" onClick={() => void toggleOpen()} disabled={busyAction === 'open' || !network.isOnline || !canControlIntake} aria-pressed={isOpen} data-testid="restaurant-open-toggle" className={cn('flex min-h-12 items-center gap-2 rounded-2xl px-4 text-sm font-black disabled:opacity-50', isOpen ? 'bg-emerald-500 text-white' : 'bg-[#e10600] text-white')}>
              {busyAction === 'open' ? <Loader2 className="size-5 animate-spin" /> : <Power className="size-5" />}{isOpen ? copy.closeAction : copy.openAction}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-white/50">{copy.busy}</p><p className="mt-1 font-black">{isBusy ? copy.surge : copy.busyOff}</p></div><Flame className={cn('size-6', isBusy ? 'text-[#ffc107]' : 'text-white/30')} /></div>
            {isBusy ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-white/50">{copy.busyUntil} {data.restaurant?.busy_mode_until ? new Date(data.restaurant.busy_mode_until).toLocaleTimeString(locale === 'ar' ? 'ar' : locale, { hour: '2-digit', minute: '2-digit' }) : '—'}</p><button type="button" onClick={() => void updateBusy(false)} disabled={busyAction === 'busy' || !network.isOnline} data-testid="restaurant-busy-stop" className="min-h-11 rounded-xl border border-white/15 px-3 text-xs font-black disabled:opacity-50">{copy.stopBusy}</button></div> : <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-white/50">{copy.busyFor}</span>{[15, 30, 60].map((minutes) => <button key={minutes} type="button" onClick={() => setBusyMinutes(minutes)} aria-pressed={busyMinutes === minutes} data-testid={`restaurant-busy-${minutes}`} className={cn('min-h-11 rounded-xl px-3 text-xs font-black', busyMinutes === minutes ? 'bg-[#ffc107] text-black' : 'bg-white/7 text-white')}>{minutes} {copy.minutes}</button>)}<button type="button" onClick={() => void updateBusy(true)} disabled={busyAction === 'busy' || !isOpen || !network.isOnline} data-testid="restaurant-busy-start" className="min-h-11 rounded-xl bg-[#e10600] px-4 text-xs font-black text-white disabled:opacity-50">{busyAction === 'busy' ? <Loader2 className="size-4 animate-spin" /> : copy.busy}</button></div>}
          </div>
          <div className="min-w-56 rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="flex items-center justify-between text-xs font-bold text-white/50"><span>{copy.capacity}</span><span dir="ltr">{prepLoadCount}/8</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div role="progressbar" aria-valuemin={0} aria-valuemax={8} aria-valuenow={Math.min(prepLoadCount, 8)} className={cn('h-full rounded-full transition-all', capacity >= 88 ? 'bg-[#e10600]' : capacity >= 60 ? 'bg-[#ffc107]' : 'bg-emerald-400')} style={{ width: `${capacity}%` }} /></div><p className="mt-2 text-xs font-black">{capacity >= 60 ? copy.surge : copy.normal}</p></div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div data-testid="restaurant-kpi-today-revenue"><KpiTile label={copy.todayRevenue} value={formatEUR(data.today.revenue, locale)} hint={`${data.today.orders} ${copy.orders}`} tone="success" icon={<Euro className="size-5" />} /></div>
        <KpiTile label={copy.weekRevenue} value={formatEUR(data.week.revenue, locale)} hint={`${data.week.orders} ${copy.orders}`} tone="info" icon={<TrendingUp className="size-5" />} />
        <KpiTile label={copy.pending} value={data.pendingCount} hint={`${data.pendingCount} ${copy.waiting}`} tone={data.pendingCount > 0 ? 'warning' : 'default'} icon={<Clock className="size-5" />} />
        <KpiTile label={copy.avgPrep} value={data.today.averagePrepMinutes == null ? '—' : `${Math.round(data.today.averagePrepMinutes)} min`} hint={copy.today} tone="default" icon={<Timer className="size-5" />} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink href="/restaurant/kitchen" label={copy.kitchen} icon={ChefHat} />
        <QuickLink href="/restaurant/orders" label={copy.orders} icon={Package} />
        <QuickLink href="/restaurant/menu" label={`${copy.menu} · ${data.menuCount}`} icon={BookOpen} />
        <QuickLink href="/restaurant/support" label={copy.support} icon={Headphones} />
      </div>

      <section>
        <SectionTitle hint={`${activeCount} ${copy.orders}`} action={<Link href="/restaurant/orders" className="text-sm font-black text-brand-red hover:underline">{copy.total}<ChevronRight className="ms-1 inline size-4 rtl:rotate-180" /></Link>}>{copy.operations}</SectionTitle>
        {sortedOrders.length === 0 ? <PortalCard padding="lg"><EmptyState icon={<ChefHat className="size-8" />} title={copy.noOrders} description={copy.noOrdersBody} action={<Link href="/restaurant/menu" className="inline-flex min-h-11 items-center rounded-xl bg-brand-red px-4 font-black text-white">{copy.menu}</Link>} /></PortalCard> : <div className="grid gap-3 xl:grid-cols-2">{sortedOrders.map((order) => <OrderCard key={order.id} order={order} copy={copy} locale={locale} now={now} busyAction={busyAction} networkOnline={network.isOnline} suggestedPrepMinutes={Math.min(90, Math.max(5, Math.round((data.today.averagePrepMinutes ?? 20) + (isBusy ? 10 : 0))))} onStatus={updateOrderStatus} />)}</div>}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallStat icon={Star} label={copy.reviews} value={`${Number(data.restaurant?.rating || 0).toFixed(1)} · ${data.restaurant?.review_count || 0}`} />
        <SmallStat icon={BookOpen} label={copy.products} value={String(data.menuCount)} />
        <SmallStat icon={CheckCircle2} label={copy.orders} value={String(data.week.orders)} />
        <SmallStat icon={Pause} label={copy.portal} value={isOpen ? copy.open : copy.closed} />
      </div>
      {refreshing && <span className="sr-only" role="status">{copy.syncProblem}</span>}
    </main>
  );
}

function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof ChefHat }) {
  return <Link href={href} className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-3 font-black shadow-sm transition hover:-translate-y-0.5 hover:border-brand-red/40"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-red/10 text-brand-red"><Icon className="size-5" /></span><span className="truncate text-sm">{label}</span></Link>;
}

function SmallStat({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: string }) {
  return <PortalCard padding="md"><Icon className="size-5 text-brand-yellow-500" /><p className="mt-3 text-xs text-text-muted">{label}</p><p className="mt-1 truncate font-black">{value}</p></PortalCard>;
}

function OrderCard({ order, copy, locale, now, busyAction, networkOnline, suggestedPrepMinutes, onStatus }: {
  order: RestaurantOrder; copy: typeof COPY.de; locale: Locale; now: number; busyAction: string | null; networkOnline: boolean; suggestedPrepMinutes: number;
  onStatus: (order: RestaurantOrder, status: 'confirmed' | 'preparing' | 'ready' | 'cancelled', estimatedPrepMinutes?: number) => Promise<void>;
}) {
  const [prepMinutes, setPrepMinutes] = useState(suggestedPrepMinutes);
  const customer = customerOf(order);
  const elapsed = minutesSince(order.created_at, now);
  const prepState = preparationState(order.status, order.estimated_ready_at, now);
  const prepRemaining = remainingPreparationMinutes(order.estimated_ready_at, now);
  const urgent = ['late', 'critical'].includes(prepState) || (!order.estimated_ready_at && order.status !== 'ready' && elapsed >= 20);
  const phone = String(customer.phone || '').replace(/[^\d+]/g, '');
  const next = order.status === 'pending' ? 'confirmed' : order.status === 'confirmed' ? 'preparing' : order.status === 'preparing' ? 'ready' : null;
  const nextLabel = next === 'confirmed' ? copy.accept : next === 'preparing' ? copy.start : copy.readyAction;
  const actionBusy = next ? busyAction === `${next}-${order.id}` : false;
  return <article data-testid="restaurant-live-order" data-order-id={order.id} className={cn('overflow-hidden rounded-[24px] border bg-surface shadow-sm', urgent ? 'border-status-error/50 ring-2 ring-status-error/10' : 'border-border')}>
    <div className="flex items-start justify-between gap-3 border-b border-border p-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-mono font-black" dir="ltr">#{order.order_number || order.id.slice(0, 8)}</p><StatusPill status={order.status} label={copy.states[order.status]} /></div><p className="mt-2 text-sm font-bold">{customer.name || copy.customer}</p><p className="mt-1 flex items-center gap-1 text-xs text-text-muted"><Clock className="size-3.5" />{elapsed} min {copy.elapsed}</p></div><div className="text-end"><p className="text-lg font-black">{formatEUR(Number(order.total || 0), locale)}</p><p className="text-[10px] text-text-muted">{copy.total}</p></div></div>
    <div className="space-y-3 p-4">
      <div className="rounded-2xl bg-bg p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wide text-text-muted">{order.items?.length || 0} {copy.items}</p>{order.items && order.items.length > 0 ? <ul className="space-y-1.5">{order.items.map((item, index) => <li key={`${item.product_name}-${index}`} className="flex items-center justify-between gap-3 text-sm"><span className="truncate"><strong className="me-2 text-brand-red">{item.quantity || 1}×</strong>{item.product_name || '—'}</span>{item.subtotal != null && <span className="shrink-0 text-xs text-text-muted">{formatEUR(Number(item.subtotal), locale)}</span>}</li>)}</ul> : <p className="text-sm text-text-muted">—</p>}</div>
      <p className="flex items-center gap-2 truncate text-xs text-text-muted"><MapPin className="size-4 shrink-0" />{formatAddress(order.delivery_address)}</p>
      <div className="flex flex-wrap gap-2"><Link href={`/restaurant/orders/${order.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-xs font-black">{copy.detail}</Link>{phone && <a href={`tel:${phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-black"><Phone className="size-4" />{copy.call}</a>}</div>
      {order.status === 'pending' && <div className="rounded-xl border border-brand-yellow-500/20 bg-brand-yellow-500/8 p-3" data-testid="restaurant-prep-estimate"><p className="text-xs font-black text-brand-yellow-600">{PREP_COPY[locale].promise}</p><div className="mt-2 grid grid-cols-4 gap-1.5">{[10, 15, 20, 30].map((minutes) => <button key={minutes} type="button" onClick={() => setPrepMinutes(minutes)} aria-pressed={prepMinutes === minutes} className={cn('min-h-10 rounded-lg text-xs font-black', prepMinutes === minutes ? 'bg-brand-yellow-500 text-black' : 'bg-bg text-text-muted')}>{minutes}</button>)}</div><p className="mt-2 text-center text-xs font-bold">{prepMinutes} {PREP_COPY[locale].unit}</p></div>}
      {order.estimated_ready_at && order.status !== 'ready' && <div data-testid="restaurant-prep-sla" className={cn('rounded-xl border px-3 py-2 text-center text-xs font-black', urgent ? 'border-status-error/30 bg-status-error/10 text-status-error' : prepState === 'warning' ? 'border-brand-yellow-500/30 bg-brand-yellow-500/10 text-brand-yellow-700' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600')}>{prepRemaining && prepRemaining > 0 ? `${PREP_COPY[locale].remaining} ${prepRemaining} ${PREP_COPY[locale].unit}` : `${PREP_COPY[locale].overdue} ${Math.max(1, Math.floor((now - new Date(order.estimated_ready_at).getTime()) / 60_000))} ${PREP_COPY[locale].unit}`}</div>}
      {order.status === 'ready' ? <div data-testid="restaurant-order-waiting-driver" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-sm font-black text-emerald-600"><Check className="size-5" />{copy.waitingDriver}</div> : <div className="grid grid-cols-[.75fr_1.25fr] gap-2">{order.status === 'pending' && <button type="button" onClick={() => { if (window.confirm(copy.confirmDecline)) void onStatus(order, 'cancelled'); }} disabled={Boolean(busyAction) || !networkOnline} data-testid="restaurant-order-decline" className="min-h-12 rounded-xl border border-status-error/40 font-black text-status-error disabled:opacity-50"><X className="me-1 inline size-4" />{copy.decline}</button>}<button type="button" onClick={() => next && void onStatus(order, next, next === 'confirmed' ? prepMinutes : undefined)} disabled={!next || Boolean(busyAction) || !networkOnline} data-testid={`restaurant-order-${next}`} className={cn('min-h-12 rounded-xl px-3 font-black text-white disabled:opacity-50', order.status === 'pending' ? 'bg-emerald-600' : order.status === 'confirmed' ? 'bg-brand-yellow-600' : 'bg-brand-red', order.status !== 'pending' && 'col-span-2')}>{actionBusy ? <Loader2 className="mx-auto size-5 animate-spin" /> : nextLabel}</button></div>}
    </div>
  </article>;
}
