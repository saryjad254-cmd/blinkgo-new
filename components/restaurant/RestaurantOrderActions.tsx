'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ChefHat, PackageCheck, Loader2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n/I18nProvider';
import type { OrderStatus } from '@/lib/types';

interface Props {
  orderId: string;
  currentStatus: OrderStatus;
  locale?: 'ar' | 'de' | 'en';
}

interface ActionInfo {
  next: OrderStatus;
  className: string;
  icon: typeof Check;
}

const ACTION_MAP: Partial<Record<OrderStatus, ActionInfo>> = {
  pending:   { next: 'confirmed', icon: Check,        className: 'bg-success text-white' },
  confirmed: { next: 'preparing', icon: ChefHat,      className: 'bg-brand text-white' },
  preparing: { next: 'ready',     icon: PackageCheck, className: 'bg-info text-white' },
};

export function RestaurantOrderActions({ orderId, currentStatus, locale }: Props) {
  const router = useRouter();
  const t = useT();
  const detectedLocale = (locale ?? (t as any)?.common?.loading ? 'de' : 'de') as 'ar' | 'de' | 'en';
  // Use the I18nProvider locale if prop wasn't passed
  const loc = (locale ?? 'de') as 'ar' | 'de' | 'en';

  const [loading, setLoading] = useState<'next' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = ACTION_MAP[currentStatus];

  // Localized labels
  const labels = {
    cancel:         loc === 'ar' ? 'رفض'        : loc === 'en' ? 'Decline'         : 'Ablehnen',
    confirmOrder:   loc === 'ar' ? 'تأكيد الطلب' : loc === 'en' ? 'Confirm order'   : 'Bestellung bestätigen',
    startPreparing: loc === 'ar' ? 'بدء التحضير' : loc === 'en' ? 'Start preparing' : 'Zubereitung starten',
    markReady:      loc === 'ar' ? 'جاهز للاستلام' : loc === 'en' ? 'Mark ready'    : 'Als abholbereit markieren',
    updateFailed:   loc === 'ar' ? 'فشل التحديث' : loc === 'en' ? 'Update failed'   : 'Update fehlgeschlagen',
    updating:       loc === 'ar' ? 'جارٍ التحديث...' : loc === 'en' ? 'Updating...'  : 'Wird aktualisiert...',
  };

  const labelFor = (status: OrderStatus | undefined): string => {
    if (status === 'confirmed') return labels.confirmOrder;
    if (status === 'preparing') return labels.startPreparing;
    if (status === 'ready') return labels.markReady;
    return '';
  };

  async function updateStatus(nextStatus: OrderStatus | 'cancelled') {
    const key = nextStatus === 'cancelled' ? 'cancel' : 'next';
    setLoading(key);
    setError(null);

    try {
      const supabase = createBrowserClient();
      const updates: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === 'cancelled') updates.cancelled_at = new Date().toISOString();
      if (nextStatus === 'preparing') updates.prepared_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId);

      if (updateError) throw updateError;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? labels.updateFailed);
    } finally {
      setLoading(null);
    }
  }

  // Terminal states (ready, delivering, delivered, cancelled) get no main "next" button
  const showNext = !!next;
  const showCancel = currentStatus === 'pending' || currentStatus === 'confirmed';

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-xl bg-danger/15 border border-danger/30 text-sm text-danger flex items-start gap-2">
          <X className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showNext && next && (
        <button
          onClick={() => updateStatus(next.next)}
          disabled={loading !== null}
          className={`w-full py-4 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 transition-all ${next.className}`}
        >
          {loading === 'next' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {labels.updating}
            </>
          ) : (
            <>
              <next.icon className="w-5 h-5" />
              {labelFor(next.next)}
            </>
          )}
        </button>
      )}

      {showCancel && (
        <button
          onClick={() => updateStatus('cancelled')}
          disabled={loading !== null}
          className="w-full py-4 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 transition-all bg-danger text-white"
        >
          {loading === 'cancel' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {labels.updating}
            </>
          ) : (
            <>
              <X className="w-5 h-5" />
              {labels.cancel}
            </>
          )}
        </button>
      )}
    </div>
  );
}
