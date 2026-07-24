'use client';

/**
 * CancelOrderButton — allows customers to cancel their own orders.
 * Only enabled when the order is in a cancellable state (pending/confirmed).
 * Shows a confirmation dialog before cancelling.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface Props {
  orderId: string;
  orderStatus: string;
  className?: string;
}

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

export function CancelOrderButton({ orderId, orderStatus, className }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isCancellable = CANCELLABLE_STATUSES.includes(orderStatus);

  if (!isCancellable) return null;

  const t = ({
    de: {
      title: 'Bestellung stornieren?',
      description: 'Sie können diese Bestellung stornieren, solange das Restaurant noch nicht mit der Zubereitung begonnen hat.',
      reasonLabel: 'Grund (optional)',
      reasonPlaceholder: 'z. B. Falsche Adresse, Meinung geändert...',
      cancel: 'Stornieren',
      keep: 'Behalten',
      success: 'Bestellung erfolgreich storniert',
      error: 'Stornierung fehlgeschlagen',
      tooLate: 'Bestellung kann nicht mehr storniert werden',
    },
    ar: {
      title: 'إلغاء الطلب؟',
      description: 'يمكنك إلغاء هذا الطلب طالما لم يبدأ المطعم في التحضير.',
      reasonLabel: 'السبب (اختياري)',
      reasonPlaceholder: 'مثال: عنوان خاطئ، غيرت رأيي...',
      cancel: 'إلغاء الطلب',
      keep: 'الاحتفاظ',
      success: 'تم إلغاء الطلب بنجاح',
      error: 'فشل الإلغاء',
      tooLate: 'لا يمكن إلغاء الطلب الآن',
    },
    en: {
      title: 'Cancel order?',
      description: 'You can cancel this order as long as the restaurant has not started preparing it yet.',
      reasonLabel: 'Reason (optional)',
      reasonPlaceholder: 'e.g. Wrong address, changed my mind...',
      cancel: 'Cancel order',
      keep: 'Keep order',
      success: 'Order cancelled successfully',
      error: 'Failed to cancel',
      tooLate: 'Order can no longer be cancelled',
    },
  } as const)[(locale as 'de' | 'ar' | 'en')] || ({
    de: {
      title: 'Bestellung stornieren?',
      description: 'Sie können diese Bestellung stornieren.',
      reasonLabel: 'Grund (optional)',
      reasonPlaceholder: 'z. B. Falsche Adresse...',
      cancel: 'Stornieren',
      keep: 'Behalten',
      success: 'Bestellung erfolgreich storniert',
      error: 'Stornierung fehlgeschlagen',
      tooLate: 'Bestellung kann nicht mehr storniert werden',
    },
  } as const).de;

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      const supabaseModule = await import('@/lib/supabase/client');
      const supabase = supabaseModule.createBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: reason || undefined }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json?.error?.code === 'CANCEL_TOO_LATE') {
          toast({ type: 'error', message: t.tooLate });
        } else {
          throw new Error(json.error?.message || json.error || t.error);
        }
        setOpen(false);
        return;
      }

      toast({ type: 'success', message: t.success });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ type: 'error', message: e?.message || t.error });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-2xl border-2 border-danger/40 text-danger text-sm font-extrabold bg-danger/5 hover:bg-danger/10 hover:border-danger active:translate-y-0 transition-all duration-200',
          className,
        )}
      >
        <X className="w-4 h-4" />
        {t.cancel}
      </button>

      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-bg-elevated border border-edge shadow-speed-xl overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-edge flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-danger/15 border border-danger/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-danger" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-extrabold text-text">{t.title}</h3>
                <p className="text-sm text-text-secondary mt-1 leading-relaxed">{t.description}</p>
              </div>
            </div>

            {/* Reason input */}
            <div className="px-6 py-4">
              <label className="block text-xs font-bold text-text-secondary mb-2">
                {t.reasonLabel}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.reasonPlaceholder}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2.5 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted text-sm focus:border-danger focus:ring-2 focus:ring-danger/20 focus:outline-none transition-all resize-none"
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              />
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="flex-1 h-11 rounded-2xl border border-edge bg-surface text-text font-bold text-sm hover:border-edge-strong hover:bg-surface-light active:translate-y-0 transition-all disabled:opacity-50"
              >
                {t.keep}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="flex-1 h-11 rounded-2xl bg-danger text-white font-extrabold text-sm shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.cancel}…
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    {t.cancel}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
