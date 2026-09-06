'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Package from 'lucide-react/dist/esm/icons/package';
import Truck from 'lucide-react/dist/esm/icons/truck';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import X from 'lucide-react/dist/esm/icons/x';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Phone from 'lucide-react/dist/esm/icons/phone';
import Home from 'lucide-react/dist/esm/icons/home';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';
import { DriverReleaseDialog } from './DriverReleaseDialog';
import { DriverDeliveryPinDialog } from './DriverDeliveryPinDialog';
import { DriverFailedDeliveryDialog } from './DriverFailedDeliveryDialog';
import type { DriverReleaseReason } from '@/lib/driver/rejection-reasons';
import { extractErrorMessage } from '@/lib/foundation/error-helper';
import type { DeliveryHandoff } from '@/lib/delivery-preferences';
import type { FailedDeliveryReason } from '@/lib/driver/delivery-outcome-policy';

interface Props {
  orderId: string;
  currentStatus: string;
  contactPhone?: string | null;
  arrivedPickupAt?: string | null;
  arrivedDropoffAt?: string | null;
  deliveryHandoff?: DeliveryHandoff;
}

const ACTIONS = {
  ready: {
    endpoint: 'pickup',
    icon: Truck,
    className: 'bg-brand-gradient shadow-brand-500/40',
    de: 'Abgeholt — Lieferung starten',
    ar: 'تم الاستلام — ابدأ التوصيل',
    en: 'Picked up — start delivery',
  },
  picked_up: {
    endpoint: 'complete',
    icon: Home,
    className: 'bg-emerald-500 shadow-emerald-500/40',
    de: 'Geliefert — Bestellung abschließen',
    ar: 'تم التوصيل — إكمال الطلب',
    en: 'Delivered — complete order',
  },
  delivering: {
    endpoint: 'complete',
    icon: Home,
    className: 'bg-emerald-500 shadow-emerald-500/40',
    de: 'Geliefert — Bestellung abschließen',
    ar: 'تم التوصيل — إكمال الطلب',
    en: 'Delivered — complete order',
  },
} as const;

export function OrderActions({ orderId, currentStatus, contactPhone, arrivedPickupAt, arrivedDropoffAt, deliveryHandoff = 'hand_to_me' }: Props) {
  const router = useRouter();
  const { locale } = useI18n();
  const { success, error: toastError, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [showDeliveryPin, setShowDeliveryPin] = useState(false);
  const [showFailedDelivery, setShowFailedDelivery] = useState(false);
  const inFlightRef = useRef(false);
  const action = ACTIONS[currentStatus as keyof typeof ACTIONS];
  const isWaitingForRestaurant = currentStatus === 'confirmed' || currentStatus === 'preparing';
  const isRestaurantPhase = isWaitingForRestaurant || currentStatus === 'ready';
  const isCustomerPhase = currentStatus === 'picked_up' || currentStatus === 'delivering';

  const runAction = (deliveryPin?: string, deliveryPhoto?: string) => {
    if (!action || inFlightRef.current) return;
    if (action.endpoint === 'complete' && !deliveryPin && !deliveryPhoto) {
      setShowDeliveryPin(true);
      return;
    }
    inFlightRef.current = true;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/driver/orders/${orderId}/${action.endpoint}`, {
          method: 'POST',
          headers: action.endpoint === 'complete' ? { 'Content-Type': 'application/json' } : undefined,
          body: action.endpoint === 'complete' ? JSON.stringify({ delivery_pin: deliveryPin, delivery_photo: deliveryPhoto }) : undefined,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(extractErrorMessage(payload, 'Update failed'));
        }
        if (action.endpoint === 'complete') {
          setShowDeliveryPin(false);
          success(locale === 'ar' ? 'تم التوصيل بنجاح' : locale === 'en' ? 'Delivery completed' : 'Lieferung abgeschlossen');
          router.push('/driver/dashboard');
        } else {
          success(locale === 'ar' ? 'تم تأكيد الاستلام' : locale === 'en' ? 'Pickup confirmed' : 'Abholung bestätigt');
          router.refresh();
        }
      } catch (error) {
        toastError(error instanceof Error ? error.message : locale === 'de' ? 'Aktion fehlgeschlagen' : 'Action failed');
      } finally {
        inFlightRef.current = false;
      }
    });
  };

  const releaseOrder = (reason: DriverReleaseReason, details: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setShowReject(false);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/driver/orders/${orderId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason_code: reason, details }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(extractErrorMessage(payload, 'Release failed'));
        }
        info(locale === 'ar' ? 'تم تحرير الرحلة' : locale === 'en' ? 'Delivery released' : 'Tour freigegeben');
        router.push('/driver/dashboard');
      } catch (error) {
        toastError(error instanceof Error ? error.message : locale === 'de' ? 'Freigabe fehlgeschlagen' : 'Release failed');
      } finally {
        inFlightRef.current = false;
      }
    });
  };

  const markArrival = (stage: 'pickup' | 'dropoff') => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/driver/orders/${orderId}/arrive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(extractErrorMessage(payload, 'Arrival failed'));
        success(stage === 'pickup'
          ? (locale === 'ar' ? 'بدأ تسجيل وقت الانتظار في المطعم' : locale === 'en' ? 'Restaurant wait timer started' : 'Restaurant-Wartezeit gestartet')
          : (locale === 'ar' ? 'تم تسجيل الوصول إلى الزبون' : locale === 'en' ? 'Customer arrival recorded' : 'Ankunft beim Kunden erfasst'));
        router.refresh();
      } catch (error) {
        toastError(error instanceof Error ? error.message : locale === 'de' ? 'Ankunft konnte nicht erfasst werden' : 'Arrival failed');
      } finally {
        inFlightRef.current = false;
      }
    });
  };

  const failDelivery = (reason: FailedDeliveryReason, details: string, contactAttempts: number) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/driver/orders/${orderId}/fail-delivery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason_code: reason, details, contact_attempts: contactAttempts }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(extractErrorMessage(payload, 'Failed delivery could not be saved'));
        setShowFailedDelivery(false);
        info(locale === 'ar' ? 'تم تحويل الحالة إلى الدعم' : locale === 'en' ? 'Case escalated to support' : 'Fall an Support übergeben');
        router.push('/driver/dashboard');
      } catch (error) {
        toastError(error instanceof Error ? error.message : locale === 'de' ? 'Nichtzustellung konnte nicht gespeichert werden' : 'Failed delivery could not be saved');
      } finally {
        inFlightRef.current = false;
      }
    });
  };

  const rejectDialog = (
    <DriverReleaseDialog
      open={showReject}
      locale={locale}
      busy={pending}
      onClose={() => setShowReject(false)}
      onConfirm={releaseOrder}
    />
  );
  const deliveryPinDialog = (
    <DriverDeliveryPinDialog
      open={showDeliveryPin}
      locale={locale}
      handoff={deliveryHandoff}
      busy={pending}
      onClose={() => setShowDeliveryPin(false)}
      onConfirm={runAction}
    />
  );
  const failedDeliveryDialog = <DriverFailedDeliveryDialog open={showFailedDelivery} locale={locale} busy={pending} onClose={() => setShowFailedDelivery(false)} onConfirm={failDelivery} />;

  if (isRestaurantPhase && !arrivedPickupAt) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => markArrival('pickup')} disabled={pending} data-testid="driver-detail-arrive-pickup" className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-gradient text-lg font-black text-white shadow-2xl shadow-brand-500/35 disabled:opacity-60">
          {pending ? <Loader2 className="size-6 animate-spin" /> : <MapPin className="size-6" />}
          {locale === 'ar' ? 'وصلت إلى المطعم' : locale === 'en' ? 'I arrived at the restaurant' : 'Im Restaurant angekommen'}
        </button>
        <button type="button" onClick={() => setShowReject(true)} className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-700 text-sm font-bold text-text-secondary transition-colors hover:text-red-400"><X className="size-4" />{locale === 'ar' ? 'تحرير الرحلة' : locale === 'en' ? 'Release delivery' : 'Tour freigeben'}</button>
        {rejectDialog}
      </div>
    );
  }

  if (isCustomerPhase && !arrivedDropoffAt) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => markArrival('dropoff')} disabled={pending} data-testid="driver-detail-arrive-dropoff" className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-gradient text-lg font-black text-white shadow-2xl shadow-brand-500/35 disabled:opacity-60">
          {pending ? <Loader2 className="size-6 animate-spin" /> : <MapPin className="size-6" />}
          {locale === 'ar' ? 'وصلت إلى الزبون' : locale === 'en' ? 'I arrived at the customer' : 'Beim Kunden angekommen'}
        </button>
        {contactPhone && <a href={`tel:${contactPhone}`} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-ink-700 text-sm font-bold text-white"><Phone className="size-4" />{locale === 'ar' ? 'اتصال' : locale === 'en' ? 'Call' : 'Anrufen'}</a>}
      </div>
    );
  }

  if (isWaitingForRestaurant) {
    return (
      <div className="space-y-2">
        <div className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-yellow-500/35 bg-brand-yellow-500/10 px-4 py-3" role="status">
          <Package className="size-6 shrink-0 text-brand-yellow-400" />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-white">{locale === 'ar' ? 'بانتظار المطعم' : locale === 'en' ? 'Waiting for restaurant' : 'Warten auf das Restaurant'}</p>
            <p className="text-xs text-text-muted">{locale === 'ar' ? 'سيظهر زر الاستلام عندما يصبح الطلب جاهزًا.' : locale === 'en' ? 'The pickup button appears when the order is ready.' : 'Der Abholbutton erscheint, sobald die Bestellung bereit ist.'}</p>
          </div>
          <button type="button" onClick={() => startTransition(() => router.refresh())} disabled={pending} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-ink-700 px-3 text-sm font-bold text-white disabled:opacity-60">
            <RefreshCw className={cn('size-4', pending && 'animate-spin')} />
            {locale === 'ar' ? 'تحديث' : locale === 'en' ? 'Refresh' : 'Aktualisieren'}
          </button>
        </div>
        {arrivedPickupAt && <div data-testid="driver-detail-wait-timer" className="flex min-h-12 items-center justify-between rounded-xl bg-brand-yellow-500/10 px-4 text-sm font-bold text-brand-yellow-400"><span>{locale === 'ar' ? 'وقت الانتظار' : locale === 'en' ? 'Waiting time' : 'Wartezeit'}</span><ElapsedSince since={arrivedPickupAt} /></div>}
        <button type="button" onClick={() => setShowReject(true)} className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-700 text-sm font-bold text-text-secondary transition-colors hover:text-red-400">
          <X className="size-4" />
          {locale === 'ar' ? 'تحرير الرحلة' : locale === 'en' ? 'Release delivery' : 'Tour freigeben'}
        </button>
        {rejectDialog}
      </div>
    );
  }

  if (!action) {
    const cancelled = currentStatus === 'cancelled';
    return (
      <div className={cn('flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold', cancelled ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400')}>
        <CheckCircle2 className="size-5" />
        {cancelled ? (locale === 'ar' ? 'ملغى' : locale === 'en' ? 'Cancelled' : 'Storniert') : (locale === 'ar' ? 'مكتمل' : locale === 'en' ? 'Completed' : 'Abgeschlossen')}
      </div>
    );
  }

  const Icon = action.icon;
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => runAction()} disabled={pending} className={cn('flex h-16 w-full touch-manipulation items-center justify-center gap-3 rounded-2xl text-lg font-black text-white shadow-2xl transition-all active:scale-[0.98] sm:h-20 sm:text-xl', action.className, pending && 'cursor-wait opacity-60')}>
        {pending ? <Loader2 className="size-7 animate-spin" /> : <><Icon className="size-7" /><span>{action[locale]}</span><span aria-hidden="true">→</span></>}
      </button>
      <div className={cn('grid gap-2', contactPhone ? 'grid-cols-2' : 'grid-cols-1')}>
        {contactPhone && (
          <a href={`tel:${contactPhone}`} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-ink-700 text-sm font-bold text-white">
            <Phone className="size-4" />
            {locale === 'ar' ? 'اتصال' : locale === 'en' ? 'Call' : 'Anrufen'}
          </a>
        )}
        {action.endpoint === 'pickup' && (
          <button type="button" onClick={() => setShowReject(true)} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-ink-700 text-sm font-bold text-text-secondary transition-colors hover:text-red-400">
            <X className="size-4" />
            {locale === 'ar' ? 'تحرير الرحلة' : locale === 'en' ? 'Release delivery' : 'Tour freigeben'}
          </button>
        )}
      </div>
      {rejectDialog}
      {deliveryPinDialog}
      {isCustomerPhase && arrivedDropoffAt && <button type="button" onClick={() => setShowFailedDelivery(true)} disabled={pending} data-testid="driver-detail-fail-delivery" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 text-sm font-black text-red-300"><X className="size-4" />{locale === 'ar' ? 'تعذّر التسليم' : locale === 'en' ? 'Unable to deliver' : 'Zustellung nicht möglich'}</button>}
      {failedDeliveryDialog}
    </div>
  );
}

function ElapsedSince({ since }: { since: string }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000)));
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000))), 1_000);
    return () => window.clearInterval(timer);
  }, [since]);
  return <span className="font-mono text-base font-black tabular-nums text-white" dir="ltr">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span>;
}
