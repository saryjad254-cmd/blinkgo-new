'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Loader2, CheckCircle2, X, AlertTriangle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { useT, tr } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { createBrowserClient } from '@/lib/supabase/client';

const REFUND_REASONS = [
  { key: 'food_quality',  icon: '🍽️', de: 'Qualität des Essens', ar: 'جودة الطعام', en: 'Food quality' },
  { key: 'wrong_order',   icon: '❌', de: 'Falsche Bestellung', ar: 'طلب خاطئ', en: 'Wrong order' },
  { key: 'missing_items', icon: '📦', de: 'Fehlende Artikel', ar: 'عناصر مفقودة', en: 'Missing items' },
  { key: 'late_delivery', icon: '⏰', de: 'Zu späte Lieferung', ar: 'تأخر التوصيل', en: 'Late delivery' },
  { key: 'damaged',       icon: '💔', de: 'Beschädigtes Produkt', ar: 'منتج تالف', en: 'Damaged product' },
  { key: 'other',         icon: '💬', de: 'Sonstiges', ar: 'أخرى', en: 'Other' },
];

const COPY = {
  de: {
    title: 'Rückerstattung anfordern',
    subtitle: 'Wählen Sie einen Grund und beschreiben Sie das Problem',
    reason: 'Grund',
    notes: 'Zusätzliche Details (optional)',
    notesPlaceholder: 'Beschreiben Sie, was passiert ist...',
    submit: 'Anfrage senden',
    submitting: 'Wird gesendet…',
    success: 'Anfrage eingereicht',
    successMsg: 'Wir bearbeiten Ihre Anfrage so schnell wie möglich.',
    errorAlready: 'Es existiert bereits eine Rückerstattungsanfrage für diese Bestellung.',
    errorWindow: 'Das Rückerstattungsfenster (7 Tage) ist abgelaufen.',
    errorStatus: 'Rückerstattungen sind nur für abgeschlossene oder stornierte Bestellungen möglich.',
  },
  ar: {
    title: 'طلب استرداد',
    subtitle: 'اختر سبباً واوصف المشكلة',
    reason: 'السبب',
    notes: 'تفاصيل إضافية (اختياري)',
    notesPlaceholder: 'صف ما حدث...',
    submit: 'إرسال الطلب',
    submitting: 'جاري الإرسال…',
    success: 'تم تقديم الطلب',
    successMsg: 'سنعالج طلبك في أسرع وقت ممكن.',
    errorAlready: 'يوجد بالفعل طلب استرداد لهذه الطلب.',
    errorWindow: 'انتهت نافذة الاسترداد (7 أيام).',
    errorStatus: 'الاسترداد متاح فقط للطلبات المكتملة أو الملغاة.',
  },
  en: {
    title: 'Request a refund',
    subtitle: 'Choose a reason and describe the problem',
    reason: 'Reason',
    notes: 'Additional details (optional)',
    notesPlaceholder: 'Describe what happened...',
    submit: 'Submit request',
    submitting: 'Submitting…',
    success: 'Request submitted',
    successMsg: 'We\'ll process your request as soon as possible.',
    errorAlready: 'A refund request already exists for this order.',
    errorWindow: 'The refund window (7 days) has expired.',
    errorStatus: 'Refunds are only available for completed or cancelled orders.',
  },
};

interface RefundRequestButtonProps {
  orderId: string;
  orderStatus: string;
  orderTotal: number;
  orderCreatedAt: string;
  hasExistingRefund?: boolean;
  locale?: 'de' | 'ar' | 'en';
  className?: string;
}

/**
 * Customer-facing refund request button + modal.
 *
 * 3-step flow: open → reason → submitted
 * - Step 1: Pick a reason (visual grid)
 * - Step 2: Add notes (optional)
 * - Step 3: Submit + success animation
 */
export function RefundRequestButton({
  orderId,
  orderStatus,
  orderTotal,
  orderCreatedAt,
  hasExistingRefund = false,
  locale = 'de',
  className,
}: RefundRequestButtonProps) {
  const { toast } = useToast();
  const copy = COPY[locale];

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'reason' | 'notes' | 'success'>('reason');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [eligible, setEligible] = useState(!hasExistingRefund);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  const handleOpen = () => {
    // Check eligibility
    if (hasExistingRefund) {
      setErrorReason(copy.errorAlready);
      return;
    }
    if (!['delivered', 'cancelled'].includes(orderStatus)) {
      setErrorReason(copy.errorStatus);
      return;
    }
    const daysSince = (Date.now() - new Date(orderCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 7) {
      setErrorReason(copy.errorWindow);
      return;
    }
    setEligible(true);
    setErrorReason(null);
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const res = await fetch(`/api/orders/${orderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.error?.includes('already')) throw new Error(copy.errorAlready);
        if (json.error?.includes('window')) throw new Error(copy.errorWindow);
        if (json.error?.includes('Refunds')) throw new Error(copy.errorStatus);
        throw new Error(json.error?.message || 'Failed');
      }
      setStep('success');
      toast({ type: 'success', message: copy.success });
    } catch (e: any) {
      toast({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setStep('reason');
      setReason('');
      setNotes('');
    }, 300);
  };

  // Don't show if no refund possible
  if (!['delivered', 'cancelled'].includes(orderStatus)) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        icon={<RefreshCw className="w-4 h-4" />}
        onClick={handleOpen}
        className={className}
      >
        {locale === 'de' ? 'Rückerstattung' : locale === 'ar' ? 'طلب استرداد' : 'Request refund'}
      </Button>

      {errorReason && (
        <button
          onClick={handleOpen}
          className="text-xs text-text-muted hover:text-danger flex items-center gap-1"
        >
          <AlertTriangle className="w-3 h-3" />
          {errorReason}
        </button>
      )}

      <BottomSheet
        open={open}
        onClose={handleClose}
        title={step === 'success' ? copy.success : copy.title}
        description={step !== 'success' ? copy.subtitle : copy.successMsg}
      >
        {step === 'reason' && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
              {copy.reason}
            </p>
            {REFUND_REASONS.map((r) => {
              const label = (r as any)[locale] || r.en;
              const selected = reason === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => {
                    setReason(r.key);
                    setStep('notes');
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 p-4 rounded-2xl',
                    'border-2 transition-all duration-200',
                    'active:scale-[0.985] touch-manipulation',
                    selected
                      ? 'border-brand bg-brand-red-500/10'
                      : 'border-edge bg-surface hover:border-edge-strong',
                  )}
                >
                  <span className="text-2xl">{r.icon}</span>
                  <span className="text-sm font-bold text-text flex-1 text-start">{label}</span>
                  <ChevronRight className="w-4 h-4 text-text-muted rtl:rotate-180" />
                </button>
              );
            })}
          </div>
        )}

        {step === 'notes' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-surface-light">
              <span className="text-xl">
                {REFUND_REASONS.find((r) => r.key === reason)?.icon}
              </span>
              <span className="text-sm font-bold text-text">
                {(REFUND_REASONS.find((r) => r.key === reason) as any)?.[locale] || reason}
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 block">
                {copy.notes}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder={copy.notesPlaceholder}
                rows={4}
                className={cn(
                  'w-full p-3 rounded-2xl',
                  'bg-bg-elevated border border-edge',
                  'text-sm text-text placeholder:text-text-muted',
                  'focus:outline-none focus:border-brand-red-500',
                  'resize-none',
                )}
                maxLength={500}
              />
              <p className="text-2xs text-text-muted mt-1 text-end">
                {notes.length}/500
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setStep('reason')}
                fullWidth
              >
                ←
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSubmit}
                loading={loading}
                fullWidth
              >
                {loading ? copy.submitting : copy.submit}
              </Button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="py-8 text-center"
          >
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-success-gradient flex items-center justify-center shadow-glow-success">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-lg font-black text-text mb-2">{copy.success}</h3>
            <p className="text-sm text-text-secondary mb-6">{copy.successMsg}</p>
            <Button variant="primary" size="md" onClick={handleClose} fullWidth>
              {locale === 'de' ? 'Schließen' : locale === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          </motion.div>
        )}
      </BottomSheet>
    </>
  );
}
