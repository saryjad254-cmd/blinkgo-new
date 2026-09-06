'use client';

import type { Locale } from '@/lib/i18n/server-translations';
import { formatEUR } from '@/lib/format';
import Check from 'lucide-react/dist/esm/icons/check';
import Clock from 'lucide-react/dist/esm/icons/clock';
import X from 'lucide-react/dist/esm/icons/x';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Banknote from 'lucide-react/dist/esm/icons/banknote';

interface RefundDisplay {
  id: string;
  status: 'requested' | 'validating' | 'submitted' | 'pending' | 'succeeded' | 'failed' | 'canceled' | 'requires_review';
  requested_amount_cents: number;
  refunded_amount_cents: number;
  currency: string;
  created_at: string;
  completed_at: string | null;
}

const STATUS_LABEL: Record<RefundDisplay['status'], { de: string; en: string; ar: string }> = {
  requested:        { de: 'Anfrage eingegangen', en: 'Request received', ar: 'تم استلام الطلب' },
  validating:       { de: 'Wird geprüft', en: 'Validating', ar: 'قيد التحقق' },
  submitted:        { de: 'An Bank gesendet', en: 'Sent to bank', ar: 'تم الإرسال للبنك' },
  pending:          { de: 'Wird verarbeitet', en: 'Processing', ar: 'قيد المعالجة' },
  succeeded:        { de: 'Erstattet', en: 'Refunded', ar: 'تم الاسترداد' },
  failed:           { de: 'Fehlgeschlagen', en: 'Failed', ar: 'فشل' },
  canceled:         { de: 'Storniert', en: 'Canceled', ar: 'ملغى' },
  requires_review:  { de: 'Manuelle Prüfung', en: 'Manual review', ar: 'قيد المراجعة' },
};

const STATUS_COLOR: Record<RefundDisplay['status'], string> = {
  requested:       'bg-brand-yellow-100 text-brand-yellow-700',
  validating:      'bg-brand-yellow-100 text-brand-yellow-700',
  submitted:       'bg-blue-100 text-blue-700',
  pending:         'bg-blue-100 text-blue-700',
  succeeded:       'bg-emerald-100 text-emerald-700',
  failed:          'bg-red-100 text-red-700',
  canceled:        'bg-zinc-200 text-zinc-600',
  requires_review: 'bg-amber-100 text-amber-700',
};

const STATUS_ICON: Record<RefundDisplay['status'], JSX.Element> = {
  requested:       <Clock className="h-4 w-4" />,
  validating:      <Clock className="h-4 w-4" />,
  submitted:       <Banknote className="h-4 w-4" />,
  pending:         <Clock className="h-4 w-4" />,
  succeeded:       <Check className="h-4 w-4" />,
  failed:          <X className="h-4 w-4" />,
  canceled:        <X className="h-4 w-4" />,
  requires_review: <AlertTriangle className="h-4 w-4" />,
};

export function RefundStatusCard({
  refunds,
  locale,
}: {
  refunds: RefundDisplay[];
  locale: Locale;
}) {
  if (refunds.length === 0) return null;

  // Aggregate
  const succeeded = refunds.filter((r) => r.status === 'succeeded');
  const pending = refunds.filter((r) => ['requested', 'validating', 'submitted', 'pending'].includes(r.status));
  const failed = refunds.filter((r) => ['failed', 'canceled', 'requires_review'].includes(r.status));
  const totalSucceeded = succeeded.reduce((s, r) => s + r.refunded_amount_cents, 0);
  const totalPending = pending.reduce((s, r) => s + r.requested_amount_cents, 0);

  const label = (s: RefundDisplay['status']): string => {
    const l = STATUS_LABEL[s];
    if (!l) return s;
    if (locale === 'ar') return l.ar;
    if (locale === 'en') return l.en;
    return l.de;
  };

  return (
    <div className="card-glass p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base flex items-center gap-2">
          <Banknote className="h-5 w-5 text-emerald-600" />
          {locale === 'ar' ? 'المبالغ المستردة' : locale === 'en' ? 'Refunds' : 'Rückerstattungen'}
        </h3>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {totalSucceeded > 0 && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3">
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              {locale === 'ar' ? 'تم استردادها' : locale === 'en' ? 'Refunded' : 'Erstattet'}
            </div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
              {formatEUR(totalSucceeded / 100)}
            </div>
          </div>
        )}
        {totalPending > 0 && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
            <div className="text-xs text-blue-700 dark:text-blue-300">
              {locale === 'ar' ? 'قيد المعالجة' : locale === 'en' ? 'Processing' : 'In Bearbeitung'}
            </div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
              {formatEUR(totalPending / 100)}
            </div>
          </div>
        )}
        {failed.length > 0 && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 col-span-2">
            <div className="text-xs text-red-700 dark:text-red-300">
              {locale === 'ar' ? 'فشل في الاسترداد' : locale === 'en' ? 'Refund failed' : 'Rückerstattung fehlgeschlagen'}
            </div>
            <div className="text-sm text-red-700 dark:text-red-300">
              {locale === 'ar' ? 'تواصل مع الدعم للمعالجة.' : locale === 'en' ? 'Please contact support.' : 'Bitte kontaktieren Sie den Support.'}
            </div>
          </div>
        )}
      </div>

      {/* Per-refund list */}
      <div className="space-y-2">
        {refunds.map((r) => (
          <div key={r.id} className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold flex items-center gap-1 ${STATUS_COLOR[r.status]}`}>
                {STATUS_ICON[r.status]}
                {label(r.status)}
              </span>
            </div>
            <div className="font-mono text-xs">
              {formatEUR(r.refunded_amount_cents / 100)}
              {r.refunded_amount_cents !== r.requested_amount_cents && (
                <span className="text-zinc-500"> / {formatEUR(r.requested_amount_cents / 100)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
