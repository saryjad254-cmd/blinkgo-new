'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Camera from 'lucide-react/dist/esm/icons/camera';
import ImageIcon from 'lucide-react/dist/esm/icons/image';
import KeyRound from 'lucide-react/dist/esm/icons/key-round';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import X from 'lucide-react/dist/esm/icons/x';
import type { Locale } from '@/lib/i18n/I18nProvider';
import type { DeliveryHandoff } from '@/lib/delivery-preferences';

interface Props {
  open: boolean;
  locale: Locale;
  handoff?: DeliveryHandoff;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (pin: string, deliveryPhoto?: string) => void;
}

const COPY = {
  de: { pinTitle: 'Liefercode bestätigen', pinBody: 'Bitte den vierstelligen Code des Kunden eingeben.', pinLabel: '4-stelliger Liefercode', photoTitle: 'Ablage dokumentieren', photoBody: 'Fotografiere nur die abgestellte Bestellung und den unmittelbaren Ablageort. Keine Personen oder privaten Innenräume.', photoButton: 'Foto aufnehmen', photoReplace: 'Foto ersetzen', photoRequired: 'Für „Vor der Tür abstellen“ ist ein Foto erforderlich.', photoInvalid: 'Nur JPG, PNG oder WebP bis 3 MB.', remove: 'Foto entfernen', privacy: 'Das Foto ist privat und wird nach 30 Tagen gelöscht.', cancel: 'Zurück', confirm: 'Lieferung abschließen' },
  ar: { pinTitle: 'تأكيد رمز التسليم', pinBody: 'أدخل الرمز المؤلف من أربعة أرقام لدى الزبون.', pinLabel: 'رمز التسليم من 4 أرقام', photoTitle: 'توثيق ترك الطلب', photoBody: 'صوّر الطلب ومكان تركه فقط. لا تصوّر الأشخاص أو داخل المنزل.', photoButton: 'التقاط صورة', photoReplace: 'استبدال الصورة', photoRequired: 'الصورة مطلوبة عند اختيار «اتركه عند الباب».', photoInvalid: 'يسمح بصور JPG أو PNG أو WebP حتى 3 ميغابايت.', remove: 'حذف الصورة', privacy: 'الصورة خاصة وتُحذف بعد 30 يومًا.', cancel: 'رجوع', confirm: 'إكمال التسليم' },
  en: { pinTitle: 'Confirm delivery code', pinBody: 'Enter the customer’s four-digit code.', pinLabel: '4-digit delivery code', photoTitle: 'Document the drop-off', photoBody: 'Photograph only the order and immediate drop-off spot. Do not include people or private interiors.', photoButton: 'Take photo', photoReplace: 'Replace photo', photoRequired: 'A photo is required for leave-at-door delivery.', photoInvalid: 'Use a JPG, PNG or WebP image up to 3 MB.', remove: 'Remove photo', privacy: 'The photo is private and deleted after 30 days.', cancel: 'Back', confirm: 'Complete delivery' },
} satisfies Record<Locale, Record<string, string>>;

export function DriverDeliveryPinDialog({ open, ...props }: Props) {
  if (!open) return null;
  return <DeliveryEvidenceDialogContent {...props} />;
}

function DeliveryEvidenceDialogContent({ locale, handoff = 'hand_to_me', busy = false, onClose, onConfirm }: Omit<Props, 'open'>) {
  const copy = COPY[locale];
  const photoRequired = handoff === 'leave_at_door';
  const [pin, setPin] = useState('');
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => photoRequired ? fileRef.current?.focus() : inputRef.current?.focus());
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [busy, onClose, photoRequired]);

  function selectPhoto(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError(copy.photoInvalid);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setPhoto(typeof reader.result === 'string' ? reader.result : ''); setError(''); };
    reader.onerror = () => setError(copy.photoInvalid);
    reader.readAsDataURL(file);
  }

  const canConfirm = photoRequired ? Boolean(photo) : pin.length === 4;
  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }} className="fixed inset-0 z-[1650] flex items-end justify-center bg-black/80 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delivery-evidence-title" data-testid="driver-delivery-evidence-dialog" dir={locale === 'ar' ? 'rtl' : 'ltr'} className="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-[28px] border border-white/15 bg-[#111113] p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,.85)]">
        <div className="flex items-start gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">{photoRequired ? <Camera className="size-6" /> : <KeyRound className="size-6" />}</div><div className="min-w-0 flex-1"><h2 id="delivery-evidence-title" className="text-lg font-black">{photoRequired ? copy.photoTitle : copy.pinTitle}</h2><p className="mt-2 text-sm leading-5 text-white/55">{photoRequired ? copy.photoBody : copy.pinBody}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label={copy.cancel} className="grid size-11 place-items-center rounded-xl bg-white/5"><X className="size-5" /></button></div>

        {photoRequired ? <div className="mt-5">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => selectPhoto(event.target.files?.[0])} className="sr-only" data-testid="driver-delivery-photo-input" />
          {photo ? <div className="overflow-hidden rounded-2xl border border-emerald-400/25 bg-black/30"><Image src={photo} width={640} height={360} unoptimized alt={locale === 'ar' ? 'معاينة إثبات التسليم' : locale === 'en' ? 'Delivery proof preview' : 'Vorschau des Liefernachweises'} className="aspect-video w-full object-cover" /><div className="grid grid-cols-2 gap-2 p-2"><button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="min-h-11 rounded-xl bg-white/8 text-xs font-black">{copy.photoReplace}</button><button type="button" onClick={() => { setPhoto(''); if (fileRef.current) fileRef.current.value = ''; }} disabled={busy} className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-red-500/12 text-xs font-black text-red-300"><Trash2 className="size-4" />{copy.remove}</button></div></div> : <button type="button" onClick={() => fileRef.current?.click()} data-testid="driver-delivery-photo-button" className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-400/35 bg-emerald-400/8 text-emerald-300"><ImageIcon className="size-8" /><span className="font-black">{copy.photoButton}</span><span className="text-xs text-white/45">{copy.photoRequired}</span></button>}
          <p className="mt-2 text-xs leading-5 text-white/45">{copy.privacy}</p>
        </div> : <label className="mt-5 block text-sm font-bold text-white/75">{copy.pinLabel}<input ref={inputRef} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(event) => { if (event.key === 'Enter' && pin.length === 4 && !busy) onConfirm(pin); }} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4}" maxLength={4} data-testid="driver-delivery-pin-input" className="mt-2 h-16 w-full rounded-2xl border border-white/15 bg-black/25 text-center font-mono text-3xl font-black tracking-[.55em] text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" /></label>}

        {error && <p role="alert" className="mt-3 text-sm font-bold text-red-300">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-12 rounded-2xl bg-white/7 text-sm font-black">{copy.cancel}</button><button type="button" onClick={() => onConfirm(pin, photo || undefined)} disabled={!canConfirm || busy} data-testid="driver-delivery-evidence-confirm" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 text-sm font-black text-white disabled:opacity-40">{busy && <Loader2 className="size-4 animate-spin" />}{copy.confirm}</button></div>
      </div>
    </div>
  );
}
