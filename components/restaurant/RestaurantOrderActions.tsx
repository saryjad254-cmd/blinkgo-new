'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Check from 'lucide-react/dist/esm/icons/check';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import PackageCheck from 'lucide-react/dist/esm/icons/package-check';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import X from 'lucide-react/dist/esm/icons/x';
import type { OrderStatus } from '@/lib/types';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/utils/haptics';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

interface Props {
  orderId: string;
  currentStatus: OrderStatus;
  locale?: 'ar' | 'de' | 'en';
  fulfillmentType?: 'delivery' | 'pickup';
}

const ACTION_MAP: Partial<Record<OrderStatus, { next: OrderStatus; Icon: typeof Check }>> = {
  pending: { next: 'confirmed', Icon: Check },
  confirmed: { next: 'preparing', Icon: ChefHat },
  preparing: { next: 'ready', Icon: PackageCheck },
};

const COPY = {
  de: { decline: 'Bestellung ablehnen', confirm: 'Bestellung annehmen', prepare: 'Zubereitung starten', ready: 'Abholbereit melden', failed: 'Status konnte nicht aktualisiert werden.', updating: 'Wird aktualisiert…', confirmDecline: 'Diese Bestellung wirklich ablehnen?', updated: 'Bestellstatus aktualisiert.', offline: 'Offline – Aktionen sind gesperrt.' },
  ar: { decline: 'رفض الطلب', confirm: 'قبول الطلب', prepare: 'بدء التحضير', ready: 'جاهز للاستلام', failed: 'تعذر تحديث حالة الطلب.', updating: 'جارٍ التحديث…', confirmDecline: 'هل تريد رفض هذا الطلب؟', updated: 'تم تحديث حالة الطلب.', offline: 'لا يوجد اتصال — الإجراءات متوقفة.' },
  en: { decline: 'Decline order', confirm: 'Accept order', prepare: 'Start preparation', ready: 'Mark ready', failed: 'Order status could not be updated.', updating: 'Updating…', confirmDecline: 'Decline this order?', updated: 'Order status updated.', offline: 'Offline – actions are locked.' },
} as const;

export function RestaurantOrderActions({ orderId, currentStatus, locale = 'de', fulfillmentType = 'delivery' }: Props) {
  const router = useRouter();
  const network = useOnlineStatus();
  const { success, error: toastError } = useToast();
  const [loading, setLoading] = useState<'next' | 'cancel' | null>(null);
  const action = currentStatus === 'ready' && fulfillmentType === 'pickup'
    ? { next: 'delivered' as OrderStatus, Icon: PackageCheck }
    : ACTION_MAP[currentStatus];
  const copy = COPY[locale];

  const labelFor = (status: OrderStatus) => status === 'confirmed' ? copy.confirm : status === 'preparing' ? copy.prepare : status === 'ready' ? copy.ready : status === 'delivered' ? (locale === 'ar' ? 'تأكيد تسليم الطلب للزبون' : locale === 'en' ? 'Confirm customer pickup' : 'Abholung bestätigen') : '';

  async function updateStatus(nextStatus: OrderStatus | 'cancelled') {
    if (!network.isOnline || loading) return;
    if (nextStatus === 'cancelled' && !window.confirm(copy.confirmDecline)) return;
    setLoading(nextStatus === 'cancelled' ? 'cancel' : 'next');
    try {
      const response = await fetch('/api/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': locale },
        body: JSON.stringify({ order_id: orderId, status: nextStatus, metadata: nextStatus === 'cancelled' ? { reason: 'restaurant_declined' } : {} }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(extractErrorMessage(payload, copy.failed));
      haptic('success');
      success(copy.updated);
      router.refresh();
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : copy.failed);
    } finally {
      setLoading(null);
    }
  }

  const showCancel = currentStatus === 'pending' || currentStatus === 'confirmed';
  if (!action && !showCancel) return null;

  return (
    <div data-testid="restaurant-order-actions" className="space-y-3">
      {!network.isOnline ? <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm font-bold text-red-200"><WifiOff className="h-4 w-4" />{copy.offline}</div> : null}
      {action ? (
        <button type="button" onClick={() => updateStatus(action.next)} disabled={!network.isOnline || loading !== null} data-testid={`restaurant-detail-order-${action.next}`} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#e10600] to-[#ff2c22] px-5 text-base font-black text-white shadow-lg shadow-red-950/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
          {loading === 'next' ? <><Loader2 className="h-5 w-5 animate-spin" />{copy.updating}</> : <><action.Icon className="h-5 w-5" />{labelFor(action.next)}</>}
        </button>
      ) : null}
      {showCancel ? (
        <button type="button" onClick={() => updateStatus('cancelled')} disabled={!network.isOnline || loading !== null} data-testid="restaurant-detail-order-cancel" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-400/[0.06] px-5 text-sm font-black text-red-300 hover:bg-red-400/10 disabled:opacity-45">
          {loading === 'cancel' ? <><Loader2 className="h-5 w-5 animate-spin" />{copy.updating}</> : <><X className="h-5 w-5" />{copy.decline}</>}
        </button>
      ) : null}
    </div>
  );
}
