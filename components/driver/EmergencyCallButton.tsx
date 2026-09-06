'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Headphones from 'lucide-react/dist/esm/icons/headphones';
import Mail from 'lucide-react/dist/esm/icons/mail';
import Phone from 'lucide-react/dist/esm/icons/phone';
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert';
import X from 'lucide-react/dist/esm/icons/x';
import { useI18n } from '@/lib/i18n/I18nProvider';

const EMERGENCY_NUMBER = '112';

export function EmergencyCallButton({
  emergencyContact,
  supportPhone,
  supportEmail,
}: {
  emergencyContact?: string | null;
  supportPhone?: string | null;
  supportEmail?: string | null;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const normalizedSupportPhone = supportPhone?.replace(/[^\d+]/g, '') || '';
  const copy = locale === 'ar'
    ? { title: 'مركز السلامة', emergency: 'اتصال بالطوارئ', emergencyBody: 'شرطة، إسعاف أو إطفاء في ألمانيا والاتحاد الأوروبي', contact: 'جهة اتصال الطوارئ', support: 'دعم BlinkGo', supportBody: 'لمشكلات الطلب أو الحساب غير الطارئة', close: 'إغلاق', note: 'إذا كان هناك خطر مباشر اتصل بالرقم 112 أولًا. لا تستخدم دعم BlinkGo بدل خدمات الطوارئ.' }
    : locale === 'en'
      ? { title: 'Safety center', emergency: 'Call emergency services', emergencyBody: 'Police, ambulance or fire service in Germany and the EU', contact: 'My emergency contact', support: 'BlinkGo support', supportBody: 'For non-emergency delivery or account issues', close: 'Close', note: 'If anyone is in immediate danger, call 112 first. BlinkGo support is not a substitute for emergency services.' }
      : { title: 'Sicherheitscenter', emergency: 'Notruf wählen', emergencyBody: 'Polizei, Rettungsdienst oder Feuerwehr in Deutschland und der EU', contact: 'Mein Notfallkontakt', support: 'BlinkGo Support', supportBody: 'Für nicht dringende Liefer- oder Kontoprobleme', close: 'Schließen', note: 'Bei unmittelbarer Gefahr zuerst 112 wählen. BlinkGo Support ersetzt keine Rettungsdienste.' };
  const emergencyLabel = t.driver?.emergencyCall || copy.title;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('button, a')?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])];
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [open]);

  return <>
    <button type="button" onClick={() => setOpen(true)} data-testid="driver-safety-button" className="fixed bottom-20 end-4 z-[1100] grid size-14 place-items-center rounded-full border-4 border-[#09090b] bg-[#e10600] text-white shadow-[0_15px_45px_rgba(225,6,0,.45)] transition hover:bg-[#ff1811] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/40 active:scale-95 sm:size-16" aria-label={emergencyLabel} title={emergencyLabel}><ShieldAlert className="size-7" /></button>
    {open && <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="driver-safety-title" data-testid="driver-safety-dialog" dir={locale === 'ar' ? 'rtl' : 'ltr'} className="w-full rounded-t-[30px] border border-white/15 bg-[#101010] p-5 text-white shadow-2xl sm:max-w-md sm:rounded-[30px]">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-red-400">BlinkGo</p><h2 id="driver-safety-title" className="mt-1 text-2xl font-black">{copy.title}</h2></div><button type="button" onClick={() => setOpen(false)} aria-label={copy.close} className="grid size-11 place-items-center rounded-full bg-white/5 hover:bg-white/10"><X className="size-5" /></button></div>
        <div className="mt-5 space-y-3">
          <a href={`tel:${EMERGENCY_NUMBER}`} data-testid="driver-call-112" className="flex min-h-20 items-center gap-4 rounded-2xl bg-[#e10600] px-4 text-white shadow-[0_12px_35px_rgba(225,6,0,.3)] hover:bg-[#ff1811]"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><Phone className="size-6" /></span><span className="flex-1"><strong className="block text-lg">{copy.emergency} · <span dir="ltr">112</span></strong><span className="mt-1 block text-xs text-white/75">{copy.emergencyBody}</span></span></a>
          {emergencyContact && <a href={`tel:${emergencyContact.replace(/[^\d+]/g, '')}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/12 bg-white/5 px-4 hover:bg-white/10"><Phone className="size-5 text-[#ffc107]" /><span className="font-black">{copy.contact}</span><span className="ms-auto text-sm text-white/55" dir="ltr">{emergencyContact}</span></a>}
          {normalizedSupportPhone ? <a href={`tel:${normalizedSupportPhone}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/12 bg-white/5 px-4 hover:bg-white/10"><Headphones className="size-5 text-emerald-400" /><span className="flex-1"><strong className="block">{copy.support}</strong><span className="block text-xs text-white/45">{copy.supportBody}</span></span><span className="text-xs text-white/55" dir="ltr">{supportPhone}</span></a> : supportEmail ? <a href={`mailto:${supportEmail}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/12 bg-white/5 px-4 hover:bg-white/10"><Mail className="size-5 text-emerald-400" /><span className="flex-1"><strong className="block">{copy.support}</strong><span className="block text-xs text-white/45">{supportEmail}</span></span></a> : <Link href="/driver/support?new=1" onClick={() => setOpen(false)} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/12 bg-white/5 px-4 hover:bg-white/10"><Headphones className="size-5 text-emerald-400" /><span className="flex-1"><strong className="block">{copy.support}</strong><span className="block text-xs text-white/45">{copy.supportBody}</span></span></Link>}
        </div>
        <p className="mt-4 flex gap-2 rounded-2xl border border-[#ffc107]/20 bg-[#ffc107]/8 p-3 text-xs leading-5 text-white/65"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#ffc107]" />{copy.note}</p>
      </div>
    </div>}
  </>;
}
