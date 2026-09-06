'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import MapPinOff from 'lucide-react/dist/esm/icons/map-pin-off';
import PackageX from 'lucide-react/dist/esm/icons/package-x';
import PhoneOff from 'lucide-react/dist/esm/icons/phone-off';
import Store from 'lucide-react/dist/esm/icons/store';
import X from 'lucide-react/dist/esm/icons/x';
import type { Locale } from '@/lib/i18n/I18nProvider';
import { canReportDriverIssue, type DriverIssueCode } from '@/lib/driver/issue-policy';
import { cn } from '@/lib/cn';

const COPY = {
  de: { title: 'Hilfe bei dieser Lieferung', sub: 'Melde ein Problem. BlinkGo protokolliert es direkt bei der Tour.', close: 'Schließen', details: 'Kurze Beschreibung', detailsPlaceholder: 'Was ist passiert?', send: 'Problem melden', sent: 'Problem wurde gemeldet', required: 'Bitte beschreibe die unsichere Situation kurz.', urgent: 'Dringend' },
  ar: { title: 'مساعدة في هذا التوصيل', sub: 'أبلغ عن المشكلة وسيتم ربطها مباشرة بالطلب.', close: 'إغلاق', details: 'وصف مختصر', detailsPlaceholder: 'ماذا حدث؟', send: 'إرسال البلاغ', sent: 'تم إرسال البلاغ', required: 'اشرح حالة الخطر باختصار.', urgent: 'عاجل' },
  en: { title: 'Help with this delivery', sub: 'Report an issue and BlinkGo will attach it directly to the delivery.', close: 'Close', details: 'Short description', detailsPlaceholder: 'What happened?', send: 'Report issue', sent: 'Issue reported', required: 'Briefly describe the unsafe situation.', urgent: 'Urgent' },
} satisfies Record<Locale, Record<string, string>>;

const LABELS: Record<DriverIssueCode, Record<Locale, string>> = {
  restaurant_delay: { de: 'Restaurant braucht länger', ar: 'المطعم متأخر', en: 'Restaurant is delayed' },
  order_not_ready: { de: 'Bestellung ist nicht fertig', ar: 'الطلب غير جاهز', en: 'Order is not ready' },
  cannot_find_restaurant: { de: 'Restaurant nicht auffindbar', ar: 'لا أجد المطعم', en: 'Cannot find restaurant' },
  cannot_find_customer: { de: 'Adresse nicht auffindbar', ar: 'لا أجد عنوان الزبون', en: 'Cannot find customer address' },
  customer_unreachable: { de: 'Kunde nicht erreichbar', ar: 'الزبون لا يجيب', en: 'Customer is unreachable' },
  damaged_order: { de: 'Bestellung beschädigt', ar: 'الطلب متضرر', en: 'Order is damaged' },
  unsafe_situation: { de: 'Unsichere Situation', ar: 'حالة غير آمنة', en: 'Unsafe situation' },
};

const OPTIONS: Array<{ code: DriverIssueCode; icon: typeof Clock3; urgent?: boolean }> = [
  { code: 'restaurant_delay', icon: Clock3 },
  { code: 'order_not_ready', icon: Store },
  { code: 'cannot_find_restaurant', icon: MapPinOff },
  { code: 'cannot_find_customer', icon: MapPinOff },
  { code: 'customer_unreachable', icon: PhoneOff },
  { code: 'damaged_order', icon: PackageX, urgent: true },
  { code: 'unsafe_situation', icon: AlertTriangle, urgent: true },
];

export function DriverIssueDialog({
  open,
  locale,
  orderStatus,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  locale: Locale;
  orderStatus: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (code: DriverIssueCode, details: string) => Promise<void>;
}) {
  const copy = COPY[locale];
  const [selected, setSelected] = useState<DriverIssueCode | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => OPTIONS.filter((item) => canReportDriverIssue(item.code, orderStatus)), [orderStatus]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [busy, onClose, open]);

  if (!open) return null;

  async function submit() {
    if (!selected || busy) return;
    if (selected === 'unsafe_situation' && details.trim().length < 5) { setError(copy.required); return; }
    setError('');
    await onSubmit(selected, details.trim());
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="driver-issue-title" data-testid="driver-issue-dialog" dir={locale === 'ar' ? 'rtl' : 'ltr'} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[28px] border border-white/15 bg-[#101010] p-5 text-white shadow-2xl sm:max-w-lg sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-4"><div><h2 id="driver-issue-title" className="text-xl font-black">{copy.title}</h2><p className="mt-1 text-sm leading-6 text-white/55">{copy.sub}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label={copy.close} className="grid size-11 shrink-0 place-items-center rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-50"><X className="size-5" /></button></div>
        <div className="mt-5 grid gap-2">{options.map(({ code, icon: Icon, urgent }) => <button key={code} type="button" aria-pressed={selected === code} data-testid={`driver-issue-${code}`} onClick={() => { setSelected(code); setError(''); }} className={cn('flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-start transition', selected === code ? 'border-[#e10600] bg-[#e10600]/12' : 'border-white/10 bg-white/[.03] hover:bg-white/[.07]')}><span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', urgent ? 'bg-red-500/15 text-red-300' : 'bg-[#ffc107]/12 text-[#ffc107]')}><Icon className="size-5" /></span><span className="flex-1 text-sm font-black">{LABELS[code][locale]}</span>{urgent && <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-black uppercase text-red-300">{copy.urgent}</span>}<ChevronRight className="size-4 text-white/30 rtl:rotate-180" /></button>)}</div>
        {selected && <label className="mt-4 block"><span className="mb-2 block text-xs font-black text-white/70">{copy.details}{selected === 'unsafe_situation' ? ' *' : ''}</span><textarea value={details} onChange={(event) => setDetails(event.target.value.slice(0, 500))} rows={3} maxLength={500} data-testid="driver-issue-details" placeholder={copy.detailsPlaceholder} className="min-h-24 w-full resize-y rounded-2xl border border-white/12 bg-black/30 p-3 text-sm outline-none placeholder:text-white/30 focus:border-[#e10600] focus:ring-2 focus:ring-[#e10600]/25" /><span className="mt-1 block text-end text-[10px] text-white/35">{details.length}/500</span></label>}
        {error && <p role="alert" className="mt-2 text-sm font-bold text-red-300">{error}</p>}
        <button type="button" onClick={() => void submit()} disabled={!selected || busy} data-testid="driver-issue-submit" className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#e10600] font-black shadow-[0_12px_35px_rgba(225,6,0,.28)] hover:bg-[#ff1811] disabled:cursor-not-allowed disabled:opacity-45">{busy ? <span className="size-5 animate-spin rounded-full border-2 border-white/25 border-t-white" /> : <AlertTriangle className="size-5" />}{copy.send}</button>
      </div>
    </div>
  );
}
