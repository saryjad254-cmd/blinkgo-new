'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Bell from 'lucide-react/dist/esm/icons/bell';
import BellOff from 'lucide-react/dist/esm/icons/bell-off';
import Check from 'lucide-react/dist/esm/icons/check';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import Expand from 'lucide-react/dist/esm/icons/expand';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import PackageCheck from 'lucide-react/dist/esm/icons/package-check';
import Phone from 'lucide-react/dist/esm/icons/phone';
import Printer from 'lucide-react/dist/esm/icons/printer';
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw';
import Timer from 'lucide-react/dist/esm/icons/timer';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import X from 'lucide-react/dist/esm/icons/x';
import { cn } from '@/lib/cn';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { haptic } from '@/lib/utils/haptics';
import { playDriverSound } from '@/lib/utils/driver-sound';
import { useToast } from '@/components/ui/Toast';
import { preparationState, remainingPreparationMinutes } from '@/lib/restaurant/preparation-policy';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

type KitchenStatus = 'pending' | 'confirmed' | 'preparing' | 'ready';

export type KitchenOrder = {
  id: string;
  order_number?: string | null;
  status: KitchenStatus;
  created_at: string;
  accepted_at?: string | null;
  prepared_at?: string | null;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
  total?: number | null;
  delivery_instructions?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  driver_name?: string | null;
  items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    subtotal?: number | null;
    configuration?: {
      substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
      fulfillment_status?: 'substituted' | 'unavailable_refund';
      original_product_name?: string;
    };
  }>;
};

type KitchenViewProps = {
  restaurantId: string;
  restaurantName: string;
  initialOrders: KitchenOrder[];
};

const STATUS_ORDER: KitchenStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];
const NEXT_STATUS: Partial<Record<KitchenStatus, KitchenStatus>> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
};

const COPY = {
  de: {
    eyebrow: 'BLINKGO · KITCHEN DISPLAY', title: 'Küchenzentrale', live: 'Live', offline: 'Offline – Aktionen gesperrt', sync: 'Aktualisieren', fullscreen: 'Vollbild', exitFullscreen: 'Vollbild verlassen', soundOn: 'Bestellton aktiv', soundOff: 'Bestellton aus', printQueue: 'Tickets drucken', close: 'Schließen',
    active: 'Aktiv', newOrders: 'Neu', cooking: 'In Arbeit', late: 'Verspätet', ready: 'Abholbereit', all: 'Alle', empty: 'Keine Bestellungen in diesem Bereich', emptyBody: 'Neue Bestellungen erscheinen automatisch auf diesem Bildschirm.',
    customer: 'Kunde', items: 'Positionen', notes: 'Hinweis', total: 'Gesamt', orderAge: 'Seit Eingang', acceptedAge: 'Seit Annahme', noItems: 'Keine Artikel hinterlegt', details: 'Details', call: 'Anrufen', print: 'Ticket drucken', substituteBest: 'Bestmöglichen Ersatz wählen', substituteContact: 'Kunden vor Ersatz kontaktieren', substituteRefund: 'Nicht ersetzen · Artikel erstatten', substituted: 'Vom Kunden bestätigter Ersatz', doNotPack: 'Nicht einpacken · Erstattung',
    accept: 'Bestellung annehmen', start: 'Zubereitung starten', markReady: 'Abholbereit melden', waitingDriver: 'Wartet auf Fahrer', driverAssigned: 'Fahrer: {name}',
    warning: 'Zeitfenster wird knapp', critical: 'Priorität – sofort bearbeiten', updated: 'Bestellstatus aktualisiert', failed: 'Status konnte nicht aktualisiert werden.', networkError: 'Netzwerkfehler. Bitte Verbindung prüfen.',
    stages: { pending: 'Neue Bestellungen', confirmed: 'Angenommen', preparing: 'In Zubereitung', ready: 'Abholbereit' },
  },
  ar: {
    eyebrow: 'BLINKGO · شاشة المطبخ', title: 'مركز عمليات المطبخ', live: 'مباشر', offline: 'لا يوجد اتصال — الإجراءات متوقفة', sync: 'تحديث', fullscreen: 'ملء الشاشة', exitFullscreen: 'إنهاء ملء الشاشة', soundOn: 'صوت الطلبات مفعّل', soundOff: 'صوت الطلبات متوقف', printQueue: 'طباعة التذاكر', close: 'إغلاق',
    active: 'نشط', newOrders: 'جديد', cooking: 'قيد العمل', late: 'متأخر', ready: 'جاهز', all: 'الكل', empty: 'لا توجد طلبات في هذه المرحلة', emptyBody: 'ستظهر الطلبات الجديدة تلقائيًا على هذه الشاشة.',
    customer: 'الزبون', items: 'العناصر', notes: 'ملاحظة', total: 'الإجمالي', orderAge: 'منذ الوصول', acceptedAge: 'منذ القبول', noItems: 'لا توجد عناصر مسجّلة', details: 'التفاصيل', call: 'اتصال', print: 'طباعة التذكرة', substituteBest: 'اختيار أفضل بديل مناسب', substituteContact: 'التواصل مع الزبون قبل الاستبدال', substituteRefund: 'عدم الاستبدال · رد قيمة المنتج', substituted: 'بديل وافق عليه الزبون', doNotPack: 'لا تجهزه · سيتم رد قيمته',
    accept: 'قبول الطلب', start: 'بدء التحضير', markReady: 'جاهز للاستلام', waitingDriver: 'بانتظار السائق', driverAssigned: 'السائق: {name}',
    warning: 'وقت التحضير يقترب من الحد', critical: 'أولوية — يجب العمل فورًا', updated: 'تم تحديث حالة الطلب', failed: 'تعذر تحديث حالة الطلب.', networkError: 'خطأ في الشبكة. تحقق من الاتصال.',
    stages: { pending: 'طلبات جديدة', confirmed: 'تم قبولها', preparing: 'قيد التحضير', ready: 'جاهزة للاستلام' },
  },
  en: {
    eyebrow: 'BLINKGO · KITCHEN DISPLAY', title: 'Kitchen operations', live: 'Live', offline: 'Offline – actions are locked', sync: 'Refresh', fullscreen: 'Full screen', exitFullscreen: 'Exit full screen', soundOn: 'Order sound on', soundOff: 'Order sound off', printQueue: 'Print tickets', close: 'Close',
    active: 'Active', newOrders: 'New', cooking: 'In progress', late: 'Late', ready: 'Ready', all: 'All', empty: 'No orders in this stage', emptyBody: 'New orders will appear here automatically.',
    customer: 'Customer', items: 'items', notes: 'Note', total: 'Total', orderAge: 'Since arrival', acceptedAge: 'Since accepted', noItems: 'No items recorded', details: 'Details', call: 'Call', print: 'Print ticket', substituteBest: 'Choose the best available substitute', substituteContact: 'Contact customer before replacing', substituteRefund: 'Do not replace · refund item', substituted: 'Customer-approved substitute', doNotPack: 'Do not pack · refund item',
    accept: 'Accept order', start: 'Start preparation', markReady: 'Mark ready', waitingDriver: 'Waiting for driver', driverAssigned: 'Driver: {name}',
    warning: 'Preparation window is getting tight', critical: 'Priority – act now', updated: 'Order status updated', failed: 'Order status could not be updated.', networkError: 'Network error. Check your connection.',
    stages: { pending: 'New orders', confirmed: 'Accepted', preparing: 'Preparing', ready: 'Ready for pickup' },
  },
} satisfies Record<Locale, Record<string, unknown>>;

const PREP_COPY = {
  de: { promise: 'Abholbereit in', remaining: 'Noch', overdue: 'Überfällig', unit: 'Min.' },
  ar: { promise: 'جاهز للاستلام خلال', remaining: 'متبقي', overdue: 'متأخر', unit: 'دقيقة' },
  en: { promise: 'Ready for pickup in', remaining: 'Remaining', overdue: 'Overdue', unit: 'min' },
} satisfies Record<Locale, { promise: string; remaining: string; overdue: string; unit: string }>;

const STAGE_STYLES: Record<KitchenStatus, { accent: string; dot: string; Icon: typeof Clock3 }> = {
  pending: { accent: 'border-sky-400/30 bg-sky-400/[0.06]', dot: 'bg-sky-400', Icon: Bell },
  confirmed: { accent: 'border-violet-400/30 bg-violet-400/[0.06]', dot: 'bg-violet-400', Icon: Check },
  preparing: { accent: 'border-amber-400/30 bg-amber-400/[0.06]', dot: 'bg-amber-400', Icon: ChefHat },
  ready: { accent: 'border-emerald-400/30 bg-emerald-400/[0.06]', dot: 'bg-emerald-400', Icon: PackageCheck },
};

function minutesSince(value: string | null | undefined, now: number) {
  if (!value || !now) return 0;
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
}

function displayOrderNumber(order: KitchenOrder) {
  return order.order_number || order.id.slice(0, 8).toUpperCase();
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

export function KitchenView({ restaurantId, restaurantName, initialOrders }: KitchenViewProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale] as typeof COPY.de;
  const network = useOnlineStatus();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [now, setNow] = useState(0);
  const [activeStage, setActiveStage] = useState<KitchenStatus | 'all'>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [prepEstimates, setPrepEstimates] = useState<Record<string, number>>(() => Object.fromEntries(initialOrders.map((order) => [order.id, order.estimated_prep_minutes ?? 20])));
  const [printScope, setPrintScope] = useState<'all' | string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const key = `blinkgo:kitchen-seen:${restaurantId}`;
    const pendingIds = initialOrders.filter((order) => order.status === 'pending').map((order) => order.id);
    try {
      const stored = sessionStorage.getItem(key);
      const seen = JSON.parse(stored || '[]') as string[];
      if (stored !== null && soundEnabled && pendingIds.some((id) => !seen.includes(id))) {
        playDriverSound('offer');
        haptic('order-arrived');
      }
      sessionStorage.setItem(key, JSON.stringify(pendingIds));
    } catch { /* Browser storage and sound are best-effort enhancements. */ }
  }, [initialOrders, restaurantId, soundEnabled]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const finishPrint = () => setPrintScope(null);
    window.addEventListener('afterprint', finishPrint);
    return () => window.removeEventListener('afterprint', finishPrint);
  }, []);

  const refresh = useCallback(() => {
    if (!network.isOnline) return;
    startRefresh(() => router.refresh());
  }, [network.isOnline, router]);

  const queueRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(refresh, 160);
  }, [refresh]);

  useEffect(() => () => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
  }, []);

  useRealtime({
    enabled: Boolean(network.isOnline && restaurantId),
    channels: [{
      name: `restaurant-kitchen-${restaurantId}`,
      table: 'orders',
      event: '*',
      filter: `restaurant_id=eq.${restaurantId}`,
      onChange: queueRefresh,
    }],
  });

  useEffect(() => {
    if (!network.isOnline) return;
    const interval = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(interval);
  }, [network.isOnline, refresh]);

  const counts = useMemo(() => {
    let pending = 0;
    let cooking = 0;
    let ready = 0;
    let late = 0;
    for (const order of orders) {
      const age = minutesSince(order.created_at, now);
      if (order.status === 'pending') pending += 1;
      if (order.status === 'confirmed' || order.status === 'preparing') cooking += 1;
      if (order.status === 'ready') ready += 1;
      const state = preparationState(order.status, order.estimated_ready_at, now);
      if (state === 'late' || state === 'critical' || (!order.estimated_ready_at && age >= 25 && order.status !== 'ready')) late += 1;
    }
    return { pending, cooking, ready, late };
  }, [now, orders]);

  const moveOrder = async (order: KitchenOrder) => {
    const next = NEXT_STATUS[order.status];
    if (!next || !network.isOnline || busyOrderId) return;
    setBusyOrderId(order.id);
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: next } : item));
    try {
      const response = await fetch('/api/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': locale },
        body: JSON.stringify({
          order_id: order.id,
          status: next,
          metadata: next === 'confirmed' ? { estimated_prep_minutes: prepEstimates[order.id] ?? 20 } : {},
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(extractErrorMessage(payload, copy.failed));
      haptic('success');
      success(copy.updated);
      startRefresh(() => router.refresh());
    } catch (cause) {
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: order.status } : item));
      toastError(cause instanceof Error ? cause.message : copy.networkError);
    } finally {
      setBusyOrderId(null);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { toastError(copy.failed); }
  };

  const printTickets = (scope: 'all' | string) => {
    setPrintScope(scope);
    window.setTimeout(() => window.print(), 60);
  };

  return (
    <section
      data-testid="restaurant-kitchen-display"
      className="min-h-[calc(100vh-7rem)] bg-[#09090b] px-3 py-4 text-white sm:px-5 lg:px-8 lg:py-6"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          [data-kitchen-ticket][data-print-visible="true"], [data-kitchen-ticket][data-print-visible="true"] * { visibility: visible !important; }
          [data-kitchen-ticket][data-print-visible="true"] { position: relative !important; inset: auto !important; break-inside: avoid; border: 1px solid #111 !important; background: white !important; color: black !important; box-shadow: none !important; margin: 0 0 12px !important; }
          [data-kitchen-ticket][data-print-visible="true"] button, [data-kitchen-ticket][data-print-visible="true"] a { display: none !important; }
        }
      `}</style>

      <div className="mx-auto max-w-[1720px] space-y-4">
        <header className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.18),transparent_38%),linear-gradient(145deg,#17171b,#0d0d10)] p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#ff2a20] to-[#b80000] shadow-lg shadow-red-950/50">
                <ChefHat className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-black tracking-[0.19em] text-[#ff3029]">{copy.eyebrow}</p>
                <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{copy.title}</h1>
                <p className="truncate text-sm text-zinc-400">{restaurantName}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <span data-testid="kitchen-network-status" className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold', network.isOnline ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-red-400/30 bg-red-400/10 text-red-200')}>
                {network.isOnline ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /> : <WifiOff className="h-4 w-4" />}
                {network.isOnline ? copy.live : copy.offline}
              </span>
              <button type="button" onClick={refresh} disabled={!network.isOnline || refreshing} data-testid="kitchen-refresh" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-bold hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45">
                <RotateCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" /> {copy.sync}
              </button>
              <button type="button" onClick={() => setSoundEnabled((enabled) => !enabled)} data-testid="kitchen-sound-toggle" aria-pressed={soundEnabled} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-bold hover:bg-white/[0.08]">
                {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} {soundEnabled ? copy.soundOn : copy.soundOff}
              </button>
              <button type="button" onClick={() => printTickets('all')} disabled={orders.length === 0} data-testid="kitchen-print-all" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-bold hover:bg-white/[0.08] disabled:opacity-40">
                <Printer className="h-4 w-4" /> {copy.printQueue}
              </button>
              <button type="button" onClick={toggleFullscreen} data-testid="kitchen-fullscreen" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e10600] px-4 text-sm font-black shadow-lg shadow-red-950/30 hover:bg-[#ff1e17]">
                {fullscreen ? <X className="h-4 w-4" /> : <Expand className="h-4 w-4" />} {fullscreen ? copy.exitFullscreen : copy.fullscreen}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:max-w-3xl">
            {[
              { label: copy.newOrders, value: counts.pending, Icon: Bell, tone: 'text-sky-300' },
              { label: copy.cooking, value: counts.cooking, Icon: ChefHat, tone: 'text-amber-300' },
              { label: copy.late, value: counts.late, Icon: AlertTriangle, tone: 'text-red-300' },
              { label: copy.ready, value: counts.ready, Icon: CircleCheck, tone: 'text-emerald-300' },
            ].map(({ label, value, Icon, tone }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-zinc-400">{label}</span><Icon className={cn('h-4 w-4', tone)} /></div>
                <strong className="mt-1 block text-2xl font-black tabular-nums">{value}</strong>
              </div>
            ))}
          </div>
        </header>

        {!network.isOnline ? (
          <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
            <WifiOff className="h-5 w-5 shrink-0" /> {copy.offline}
          </div>
        ) : null}

        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden print:hidden" role="tablist" aria-label={copy.title}>
          {(['all', ...STATUS_ORDER] as const).map((stage) => {
            const label = stage === 'all' ? copy.all : copy.stages[stage];
            const count = stage === 'all' ? orders.length : orders.filter((order) => order.status === stage).length;
            return (
              <button key={stage} type="button" role="tab" data-testid={`kitchen-tab-${stage}`} aria-selected={activeStage === stage} onClick={() => setActiveStage(stage)} className={cn('min-h-11 shrink-0 rounded-xl border px-4 text-sm font-bold', activeStage === stage ? 'border-[#e10600] bg-[#e10600] text-white' : 'border-white/10 bg-white/[0.04] text-zinc-300')}>
                {label} <span className="ms-1 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-4" data-testid="kitchen-board">
          {STATUS_ORDER.map((stage) => {
            const stageOrders = orders.filter((order) => order.status === stage);
            const style = STAGE_STYLES[stage];
            const StageIcon = style.Icon;
            return (
              <section key={stage} data-testid={`kitchen-column-${stage}`} className={cn('min-w-0 rounded-[24px] border p-3 sm:p-4', style.accent, activeStage !== 'all' && activeStage !== stage && 'hidden lg:block')}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', style.dot)} />
                    <StageIcon className="h-4 w-4 shrink-0 text-zinc-300" />
                    <h2 className="truncate text-sm font-black">{copy.stages[stage]}</h2>
                  </div>
                  <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white/10 px-2 text-xs font-black tabular-nums">{stageOrders.length}</span>
                </div>

                <div className="space-y-3">
                  {stageOrders.length === 0 ? (
                    <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-center">
                      <div><CircleCheck className="mx-auto h-7 w-7 text-zinc-600" /><p className="mt-2 text-sm font-bold text-zinc-400">{copy.empty}</p><p className="mt-1 text-xs text-zinc-600">{copy.emptyBody}</p></div>
                    </div>
                  ) : stageOrders.map((order) => {
                    const age = minutesSince(order.created_at, now);
                    const acceptedAge = minutesSince(order.accepted_at, now);
                    const slaState = preparationState(order.status, order.estimated_ready_at, now);
                    const critical = slaState === 'critical' || (!order.estimated_ready_at && age >= 25 && order.status !== 'ready');
                    const warning = ['warning', 'late'].includes(slaState) || (!order.estimated_ready_at && age >= 15 && age < 25 && order.status !== 'ready');
                    const remaining = remainingPreparationMinutes(order.estimated_ready_at, now);
                    const isBusy = busyOrderId === order.id;
                    const printVisible = printScope === 'all' || printScope === order.id;
                    return (
                      <article
                        key={order.id}
                        data-testid="kitchen-order-card"
                        data-order-id={order.id}
                        data-kitchen-ticket
                        data-print-visible={printVisible ? 'true' : 'false'}
                        className={cn('rounded-[20px] border bg-[#121216] p-4 shadow-xl shadow-black/20 transition', critical ? 'border-red-500/70 ring-2 ring-red-500/15' : warning ? 'border-amber-400/50' : 'border-white/10')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{copy.customer}</p>
                            <h3 className="truncate font-black text-white">{order.customer_name || '—'}</h3>
                            <p className="mt-1 font-mono text-sm font-black text-[#ff3029]" dir="ltr">#{displayOrderNumber(order)}</p>
                          </div>
                          <div className={cn('shrink-0 rounded-xl px-2.5 py-2 text-center', critical ? 'bg-red-500 text-white' : warning ? 'bg-amber-400 text-black' : 'bg-white/[0.06] text-zinc-200')}>
                            <Timer className="mx-auto h-4 w-4" />
                            <strong className="mt-0.5 block text-sm tabular-nums">{age} min</strong>
                          </div>
                        </div>

                        {critical || warning ? (
                          <div className={cn('mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black', critical ? 'bg-red-500/15 text-red-300' : 'bg-amber-400/15 text-amber-200')}>
                            <AlertTriangle className="h-4 w-4 shrink-0" /> {critical ? copy.critical : copy.warning}
                          </div>
                        ) : null}

                        <div className="my-3 border-y border-white/[0.07] py-3">
                          <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                            <span>{copy.items}</span><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                          </div>
                          {order.items.length ? (
                            <ul className="space-y-2">
                              {order.items.map((item) => (
                                <li key={item.id} className="flex items-start gap-2 text-sm font-bold text-zinc-100">
                                  <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-lg bg-[#e10600] px-1 text-xs text-white">{item.quantity}×</span>
                                  <span className="min-w-0 break-words pt-0.5">
                                    {item.product_name}
                                    {item.configuration?.substitution_preference ? (
                                      <span data-testid="kitchen-item-substitution" className="mt-1 block rounded-lg border border-amber-300/20 bg-amber-300/[0.08] px-2 py-1 text-[11px] font-bold leading-4 text-amber-200">
                                        {item.configuration.substitution_preference === 'best_match'
                                          ? copy.substituteBest
                                          : item.configuration.substitution_preference === 'contact_me'
                                            ? copy.substituteContact
                                            : copy.substituteRefund}
                                      </span>
                                    ) : null}
                                    {item.configuration?.fulfillment_status ? <span data-testid="kitchen-item-fulfillment" className={cn('mt-1 block rounded-lg px-2 py-1 text-[11px] font-black leading-4', item.configuration.fulfillment_status === 'unavailable_refund' ? 'bg-red-500/15 text-red-200 line-through' : 'bg-emerald-500/15 text-emerald-200')}>{item.configuration.fulfillment_status === 'unavailable_refund' ? copy.doNotPack : copy.substituted}</span> : null}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : <p className="text-sm text-zinc-500">{copy.noItems}</p>}
                        </div>

                        {order.delivery_instructions ? (
                          <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-3 text-xs text-amber-100">
                            <strong className="mb-1 block text-amber-300">{copy.notes}</strong>{order.delivery_instructions}
                          </div>
                        ) : null}

                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                          <span>{order.accepted_at ? `${copy.acceptedAge}: ${acceptedAge} min` : `${copy.orderAge}: ${age} min`}</span>
                          <strong className="text-zinc-300">{formatCurrency(Number(order.total ?? 0), locale)}</strong>
                        </div>

                        {order.estimated_ready_at && order.status !== 'ready' ? (
                          <div data-testid="kitchen-prep-sla" className={cn('mb-3 rounded-xl border px-3 py-2 text-center text-xs font-black', slaState === 'critical' || slaState === 'late' ? 'border-red-400/30 bg-red-400/10 text-red-200' : slaState === 'warning' ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200')}>
                            {remaining && remaining > 0
                              ? `${PREP_COPY[locale].remaining} ${remaining} ${PREP_COPY[locale].unit}`
                              : `${PREP_COPY[locale].overdue} ${Math.max(1, Math.floor((now - new Date(order.estimated_ready_at).getTime()) / 60_000))} ${PREP_COPY[locale].unit}`}
                          </div>
                        ) : null}

                        {stage === 'pending' ? (
                          <div className="mb-3 rounded-xl border border-[#ffc107]/20 bg-[#ffc107]/8 p-3" data-testid="kitchen-prep-estimate">
                            <p className="text-xs font-black text-[#ffc107]">{PREP_COPY[locale].promise}</p>
                            <div className="mt-2 grid grid-cols-4 gap-1">{[10, 15, 20, 30].map((minutes) => <button key={minutes} type="button" onClick={() => setPrepEstimates((current) => ({ ...current, [order.id]: minutes }))} aria-pressed={(prepEstimates[order.id] ?? 20) === minutes} className={cn('min-h-10 rounded-lg text-xs font-black', (prepEstimates[order.id] ?? 20) === minutes ? 'bg-[#ffc107] text-black' : 'bg-black/25 text-zinc-300')}>{minutes}</button>)}</div>
                          </div>
                        ) : null}

                        {stage === 'ready' ? (
                          <div data-testid="kitchen-waiting-driver" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-3 text-center text-sm font-black text-emerald-300">
                            <PackageCheck className="me-1 inline h-4 w-4" /> {order.driver_name ? copy.driverAssigned.replace('{name}', order.driver_name) : copy.waitingDriver}
                          </div>
                        ) : (
                          <button type="button" onClick={() => moveOrder(order)} disabled={!network.isOnline || Boolean(busyOrderId)} data-testid={`kitchen-order-${NEXT_STATUS[stage]}`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#e10600] to-[#ff2c22] px-4 text-sm font-black text-white shadow-lg shadow-red-950/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : stage === 'pending' ? <Check className="h-4 w-4" /> : stage === 'confirmed' ? <ChefHat className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                            {stage === 'pending' ? copy.accept : stage === 'confirmed' ? copy.start : copy.markReady}
                          </button>
                        )}

                        <div className="mt-2 grid grid-cols-2 gap-2 print:hidden">
                          <Link href={`/restaurant/orders/${order.id}`} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
                            {copy.details}<ChevronRight className={cn('h-4 w-4', locale === 'ar' && 'rotate-180')} />
                          </Link>
                          <button type="button" onClick={() => printTickets(order.id)} aria-label={`${copy.print} #${displayOrderNumber(order)}`} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
                            <Printer className="h-4 w-4" /> {copy.print}
                          </button>
                        </div>
                        {order.customer_phone ? (
                          <a href={`tel:${order.customer_phone}`} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-xs font-bold text-zinc-300 hover:bg-white/[0.06] print:hidden">
                            <Phone className="h-4 w-4" /> {copy.call}
                          </a>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
