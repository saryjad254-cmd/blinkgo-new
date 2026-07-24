'use client';

import { useState, useTransition } from 'react';
import {
  Package,
  Truck,
  CheckCircle2,
  X,
  Loader2,
  ChefHat,
  Phone,
  Home,
  AlertCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';

/**
 * OrderActions
 * ────────────
 * The primary "next action" button for the active order.
 * Designed for the driver who is mid-delivery: HUGE touch target
 * (h-16+), high contrast, no text under the icon, single action.
 *
 * The order's currentStatus determines which action is shown:
 *   confirmed → "Start preparation" (restaurant was pre-confirmed; driver marks kitchen in)
 *   preparing → "Mark ready for pickup"
 *   ready     → "I picked up" (move to picked_up)
 *   picked_up → "Mark delivered" (move to delivered)
 *   delivered → no action (terminal)
 */

interface Props {
  orderId: string;
  currentStatus: string;
}

const ACTION_MAP: Record<string, {
  nextStatus: string;
  icon: any;
  bgClass: string;
  shadowClass: string;
  labelDe: string;
  labelAr: string;
  labelEn: string;
  emoji?: string;
}> = {
  confirmed: {
    nextStatus: 'preparing',
    icon: ChefHat,
    bgClass: 'bg-brand-yellow-500',
    shadowClass: 'shadow-amber-500/40',
    labelDe: 'Vorbereitung starten',
    labelAr: 'بدء التحضير',
    labelEn: 'Start preparing',
  },
  preparing: {
    nextStatus: 'ready',
    icon: Package,
    bgClass: 'bg-cyan-500',
    shadowClass: 'shadow-cyan-500/40',
    labelDe: 'Abholbereit markieren',
    labelAr: 'جاهز للاستلام',
    labelEn: 'Mark as ready',
  },
  ready: {
    nextStatus: 'picked_up',
    icon: Truck,
    bgClass: 'bg-brand-gradient',
    shadowClass: 'shadow-brand-500/40',
    labelDe: 'Abgeholt — Lieferung starten',
    labelAr: 'تم الاستلام — ابدأ التوصيل',
    labelEn: 'Picked up — start delivery',
  },
  picked_up: {
    nextStatus: 'delivered',
    icon: Home,
    bgClass: 'bg-emerald-500',
    shadowClass: 'shadow-emerald-500/40',
    labelDe: 'Geliefert — Bestellung abschließen',
    labelAr: 'تم التوصيل — إكمال الطلب',
    labelEn: 'Delivered — complete order',
  },
  delivering: {
    nextStatus: 'delivered',
    icon: Home,
    bgClass: 'bg-emerald-500',
    shadowClass: 'shadow-emerald-500/40',
    labelDe: 'Geliefert — Bestellung abschließen',
    labelAr: 'تم التوصيل — إكمال الطلب',
    labelEn: 'Delivered — complete order',
  },
};

export function OrderActions({ orderId, currentStatus }: Props) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const action = ACTION_MAP[currentStatus];

  if (!action) {
    // Terminal state — show minimal status
    const isCancelled = currentStatus === 'cancelled';
    return (
      <div
        className={cn(
          'w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-base font-extrabold',
          isCancelled
            ? 'bg-red-500/15 text-red-400'
            : 'bg-emerald-500/15 text-emerald-400'
        )}
      >
        <CheckCircle2 className="w-5 h-5" />
        {isCancelled
          ? (locale === 'ar' ? 'ملغى' : locale === 'en' ? 'Cancelled' : 'Storniert')
          : (locale === 'ar' ? 'مكتمل' : locale === 'en' ? 'Completed' : 'Abgeschlossen')}
      </div>
    );
  }

  const Icon = action.icon;
  const label = (action as any)[`label${locale === 'ar' ? 'Ar' : locale === 'en' ? 'En' : 'De'}`] ?? action.labelDe;

  const handleAction = () => {
    if (submitting) return;
    setSubmitting(true);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, status: action.nextStatus }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error?.message || j?.error || 'Update failed');
        }
        // Refresh the server data
        router.refresh();
        if (action.nextStatus === 'delivered') {
          toast({ type: 'success', message: locale === 'ar' ? 'تم التوصيل!' : locale === 'en' ? 'Delivered!' : 'Zugestellt!' });
        }
      } catch (e: any) {
        toast({ type: 'error', message: e.message ?? (locale === 'ar' ? 'فشل' : locale === 'en' ? 'Failed' : 'Fehler') });
      } finally {
        setSubmitting(false);
      }
    });
  };

  const handleReject = () => {
    setShowReject(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/driver/orders/${orderId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'driver_cancelled' }),
        });
        if (res.ok) {
          toast({ type: 'info', message: locale === 'ar' ? 'تم الإلغاء' : locale === 'en' ? 'Cancelled' : 'Storniert' });
          router.push('/driver/dashboard');
        }
      } catch {}
    });
  };

  return (
    <div className="space-y-2">
      {/* LARGE primary action button */}
      <button
        type="button"
        onClick={handleAction}
        disabled={submitting || pending}
        className={cn(
          'w-full h-16 sm:h-20 rounded-2xl text-white font-black text-lg sm:text-xl',
          'flex items-center justify-center gap-3',
          'shadow-2xl',
          action.bgClass,
          action.shadowClass,
          'active:scale-[0.98] transition-all touch-manipulation',
          (submitting || pending) && 'opacity-60 cursor-wait'
        )}
      >
        {submitting || pending ? (
          <Loader2 className="w-7 h-7 animate-spin" />
        ) : (
          <>
            <Icon className="w-7 h-7" />
            <span>{label}</span>
            <span className="text-2xl">→</span>
          </>
        )}
      </button>

      {/* Secondary action: contact or cancel */}
      <div className="grid grid-cols-2 gap-2">
        {action.nextStatus === 'picked_up' && (
          <a
            href={`tel:`}
            className="h-12 rounded-xl bg-ink-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 touch-manipulation"
          >
            <Phone className="w-4 h-4" />
            {locale === 'ar' ? 'اتصال' : locale === 'en' ? 'Call' : 'Anrufen'}
          </a>
        )}
        {action.nextStatus !== 'picked_up' && (
          <div className="hidden sm:block" />
        )}
        <button
          type="button"
          onClick={() => setShowReject(true)}
          className="h-12 rounded-xl bg-ink-700 text-text-secondary hover:text-red-400 font-bold text-sm flex items-center justify-center gap-1.5 touch-manipulation transition-colors"
        >
          <X className="w-4 h-4" />
          {locale === 'ar' ? 'إلغاء' : locale === 'en' ? 'Cancel' : 'Abbrechen'}
        </button>
      </div>

      {/* Reject confirmation modal */}
      {showReject && (
        <div
          className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowReject(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-bg-elevated border border-edge shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-white">
                {locale === 'ar' ? 'إلغاء الطلب؟' : locale === 'en' ? 'Cancel this order?' : 'Bestellung abbrechen?'}
              </h3>
            </div>
            <p className="text-sm text-text-muted mb-5">
              {locale === 'ar'
                ? 'سيتم تحرير الطلب للسائقين الآخرين.'
                : locale === 'en'
                ? 'The order will be released to other drivers.'
                : 'Die Bestellung wird für andere Fahrer freigegeben.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowReject(false)}
                className="h-12 rounded-xl bg-ink-700 text-text-secondary font-bold touch-manipulation"
              >
                {locale === 'ar' ? 'تراجع' : locale === 'en' ? 'Keep' : 'Behalten'}
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="h-12 rounded-xl bg-red-500 text-white font-bold touch-manipulation"
              >
                {locale === 'ar' ? 'نعم، إلغاء' : locale === 'en' ? 'Yes, cancel' : 'Ja, abbrechen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
