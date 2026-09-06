'use client';

import { useEffect, useId, useRef, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Check from 'lucide-react/dist/esm/icons/check';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import X from 'lucide-react/dist/esm/icons/x';
import type { Locale } from '@/lib/i18n/I18nProvider';
import {
  DRIVER_RELEASE_REASONS,
  type DriverReleaseReason,
} from '@/lib/driver/rejection-reasons';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  locale: Locale;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: DriverReleaseReason, details: string) => void;
}

const TEXT = {
  de: {
    title: 'Warum möchtest du die Tour freigeben?',
    body: 'Die Bestellung wird sofort einem anderen Fahrer angeboten. Nach der Abholung ist eine Freigabe nicht mehr möglich.',
    cancel: 'Tour behalten', confirm: 'Tour freigeben', details: 'Kurze Beschreibung', detailsHint: 'Mindestens 3 Zeichen',
    reasons: {
      restaurant_delay: 'Zu lange Wartezeit im Restaurant', vehicle_issue: 'Problem mit meinem Fahrzeug',
      unsafe_route: 'Unsichere Route oder Situation', too_far: 'Abholung ist zu weit entfernt',
      personal_emergency: 'Persönlicher Notfall', other: 'Anderer Grund',
    },
  },
  ar: {
    title: 'لماذا تريد تحرير الرحلة؟',
    body: 'سيُعرض الطلب فوراً على سائق آخر. بعد استلام الطلب من المطعم لا يمكن تحريره.',
    cancel: 'الاحتفاظ بالرحلة', confirm: 'تحرير الرحلة', details: 'اشرح السبب باختصار', detailsHint: '3 أحرف على الأقل',
    reasons: {
      restaurant_delay: 'تأخير طويل في المطعم', vehicle_issue: 'مشكلة في المركبة',
      unsafe_route: 'الطريق أو الموقف غير آمن', too_far: 'المطعم بعيد جداً',
      personal_emergency: 'حالة شخصية طارئة', other: 'سبب آخر',
    },
  },
  en: {
    title: 'Why are you releasing this delivery?',
    body: 'The order will be offered to another driver immediately. It cannot be released after pickup.',
    cancel: 'Keep delivery', confirm: 'Release delivery', details: 'Briefly describe the reason', detailsHint: 'At least 3 characters',
    reasons: {
      restaurant_delay: 'Long restaurant delay', vehicle_issue: 'Vehicle problem',
      unsafe_route: 'Unsafe route or situation', too_far: 'Pickup is too far away',
      personal_emergency: 'Personal emergency', other: 'Another reason',
    },
  },
} satisfies Record<Locale, {
  title: string; body: string; cancel: string; confirm: string; details: string; detailsHint: string;
  reasons: Record<DriverReleaseReason, string>;
}>;

export function DriverReleaseDialog({ open, ...props }: Props) {
  if (!open) return null;
  return <DriverReleaseDialogContent {...props} />;
}

function DriverReleaseDialogContent({ locale, busy = false, onClose, onConfirm }: Omit<Props, 'open'>) {
  const copy = TEXT[locale];
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstReasonRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState<DriverReleaseReason | null>(null);
  const [details, setDetails] = useState('');
  const valid = reason !== null && (reason !== 'other' || details.trim().length >= 3);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => firstReasonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-[1600] flex items-end justify-center bg-black/75 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="driver-release-dialog"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/15 bg-[#111113] p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,.8)] sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e10600]/15 text-[#ff3b35]"><AlertTriangle className="size-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-black leading-tight">{copy.title}</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-5 text-white/55">{copy.body}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={copy.cancel} className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50"><X className="size-5" /></button>
        </div>

        <div className="mt-5 grid gap-2" role="radiogroup" aria-label={copy.title}>
          {DRIVER_RELEASE_REASONS.map((code, index) => (
            <button
              key={code}
              ref={index === 0 ? firstReasonRef : undefined}
              type="button"
              role="radio"
              aria-checked={reason === code}
              data-testid={`driver-release-reason-${code}`}
              onClick={() => setReason(code)}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-2xl border px-4 text-start text-sm font-bold transition',
                reason === code ? 'border-[#e10600] bg-[#e10600]/12 text-white' : 'border-white/10 bg-white/[.035] text-white/70 hover:bg-white/[.07]',
              )}
            >
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', reason === code ? 'border-[#e10600] bg-[#e10600]' : 'border-white/30')}>
                {reason === code && <Check className="size-3.5" />}
              </span>
              {copy.reasons[code]}
            </button>
          ))}
        </div>

        {reason === 'other' && (
          <label className="mt-3 block text-sm font-bold text-white/75">
            {copy.details}
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, 300))}
              data-testid="driver-release-details"
              rows={3}
              maxLength={300}
              autoFocus
              className="mt-2 w-full resize-none rounded-2xl border border-white/15 bg-black/25 p-3 text-base text-white outline-none placeholder:text-white/30 focus:border-[#e10600] focus:ring-2 focus:ring-[#e10600]/25"
              placeholder={copy.detailsHint}
            />
          </label>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} data-testid="driver-release-cancel" className="min-h-12 rounded-2xl bg-white/7 px-3 text-sm font-black hover:bg-white/10 disabled:opacity-50">{copy.cancel}</button>
          <button type="button" onClick={() => reason && onConfirm(reason, details.trim())} disabled={!valid || busy} data-testid="driver-release-confirm" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#e10600] px-3 text-sm font-black shadow-[0_10px_30px_rgba(225,6,0,.25)] hover:bg-[#ff1811] disabled:cursor-not-allowed disabled:opacity-40">{busy && <Loader2 className="size-4 animate-spin" />}{copy.confirm}</button>
        </div>
      </div>
    </div>
  );
}
