'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Phone from 'lucide-react/dist/esm/icons/phone';
import X from 'lucide-react/dist/esm/icons/x';
import type { Locale } from '@/lib/i18n/I18nProvider';
import { FAILED_DELIVERY_REASONS, type FailedDeliveryReason } from '@/lib/driver/delivery-outcome-policy';
import { cn } from '@/lib/cn';

const TEXT = {
  de: { title: 'Zustellung nicht möglich', body: 'Wähle den genauen Grund. Der Vorgang wird an den Support übergeben und kann nicht rückgängig gemacht werden.', attempts: 'Kontaktversuche', details: 'Kurze Beschreibung', placeholder: 'Was ist passiert?', cancel: 'Zurück', confirm: 'Zustellung beenden', warning: 'Die Bestellung wird als nicht zustellbar markiert.', required: 'Bitte ergänze eine kurze Beschreibung.', attemptsRequired: 'Versuche den Kunden mindestens zweimal anzurufen.' },
  ar: { title: 'تعذّر تسليم الطلب', body: 'اختر السبب الدقيق. سيتم تحويل الحالة إلى الدعم ولا يمكن التراجع عنها.', attempts: 'محاولات الاتصال', details: 'وصف مختصر', placeholder: 'ماذا حدث؟', cancel: 'رجوع', confirm: 'إنهاء التوصيل', warning: 'سيتم تعليم الطلب كغير قابل للتسليم.', required: 'أضف وصفًا مختصرًا.', attemptsRequired: 'حاول الاتصال بالزبون مرتين على الأقل.' },
  en: { title: 'Unable to deliver', body: 'Choose the exact reason. The case is escalated to support and cannot be undone.', attempts: 'Contact attempts', details: 'Short description', placeholder: 'What happened?', cancel: 'Back', confirm: 'End delivery', warning: 'The order will be marked as undeliverable.', required: 'Add a short description.', attemptsRequired: 'Try calling the customer at least twice.' },
} satisfies Record<Locale, Record<string, string>>;

const LABELS: Record<FailedDeliveryReason, Record<Locale, string>> = {
  customer_unreachable: { de: 'Kunde nicht erreichbar', ar: 'الزبون لا يجيب', en: 'Customer unreachable' },
  cannot_find_address: { de: 'Adresse nicht auffindbar', ar: 'تعذّر العثور على العنوان', en: 'Cannot find address' },
  unsafe_location: { de: 'Unsicherer Zustellort', ar: 'مكان التسليم غير آمن', en: 'Unsafe location' },
  recipient_refused: { de: 'Annahme verweigert', ar: 'المستلم رفض الطلب', en: 'Recipient refused' },
  damaged_order: { de: 'Bestellung beschädigt', ar: 'الطلب متضرر', en: 'Order damaged' },
  other: { de: 'Anderer Grund', ar: 'سبب آخر', en: 'Other reason' },
};

export function DriverFailedDeliveryDialog({ open, locale, busy, onClose, onConfirm }: {
  open: boolean;
  locale: Locale;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: FailedDeliveryReason, details: string, contactAttempts: number) => void;
}) {
  const copy = TEXT[locale];
  const [reason, setReason] = useState<FailedDeliveryReason | null>(null);
  const [details, setDetails] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const detailsRequired = useMemo(() => Boolean(reason && ['unsafe_location', 'recipient_refused', 'damaged_order', 'other'].includes(reason)), [reason]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus());
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [busy, onClose, open]);

  if (!open) return null;
  function submit() {
    if (!reason || busy) return;
    if (reason === 'customer_unreachable' && attempts < 2) { setError(copy.attemptsRequired); return; }
    if (detailsRequired && details.trim().length < 5) { setError(copy.required); return; }
    setError('');
    onConfirm(reason, details.trim(), attempts);
  }

  return <div className="fixed inset-0 z-[1700] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="failed-delivery-title" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-testid="driver-failed-delivery-dialog" className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] border border-white/15 bg-[#111113] p-5 text-white shadow-2xl sm:rounded-[30px]">
      <div className="flex items-start gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-500/15 text-red-300"><AlertTriangle className="size-6" /></div><div className="flex-1"><h2 id="failed-delivery-title" className="text-xl font-black">{copy.title}</h2><p className="mt-1 text-sm leading-5 text-white/55">{copy.body}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label={copy.cancel} className="grid size-11 place-items-center rounded-xl bg-white/5"><X className="size-5" /></button></div>
      <div className="mt-5 grid gap-2">{FAILED_DELIVERY_REASONS.map((code) => <button key={code} type="button" aria-pressed={reason === code} onClick={() => { setReason(code); setError(''); }} className={cn('min-h-12 rounded-2xl border px-4 text-start text-sm font-black', reason === code ? 'border-red-400 bg-red-500/12 text-white' : 'border-white/10 bg-white/[.03] text-white/75')}>{LABELS[code][locale]}</button>)}</div>
      {reason === 'customer_unreachable' && <div className="mt-4 rounded-2xl border border-[#ffc107]/20 bg-[#ffc107]/8 p-3"><p className="flex items-center gap-2 text-sm font-black text-[#ffc107]"><Phone className="size-4" />{copy.attempts}</p><div className="mt-3 grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((count) => <button key={count} type="button" aria-pressed={attempts === count} onClick={() => setAttempts(count)} className={cn('min-h-11 rounded-xl font-black', attempts === count ? 'bg-[#ffc107] text-black' : 'bg-white/7 text-white')}>{count}{count === 3 ? '+' : ''}</button>)}</div></div>}
      {reason && <label className="mt-4 block text-xs font-black text-white/70">{copy.details}{detailsRequired ? ' *' : ''}<textarea value={details} onChange={(event) => setDetails(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder={copy.placeholder} className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-white/12 bg-black/25 p-3 text-sm font-normal text-white outline-none placeholder:text-white/30 focus:border-red-400" /><span className="mt-1 block text-end text-[10px] text-white/35">{details.length}/500</span></label>}
      <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-bold leading-5 text-red-200">{copy.warning}</p>
      {error && <p role="alert" className="mt-3 text-sm font-black text-red-300">{error}</p>}
      <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-12 rounded-2xl bg-white/7 font-black">{copy.cancel}</button><button type="button" onClick={submit} disabled={!reason || busy} data-testid="driver-failed-delivery-confirm" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 font-black disabled:opacity-40">{busy && <Loader2 className="size-4 animate-spin" />}{copy.confirm}</button></div>
    </div>
  </div>;
}
