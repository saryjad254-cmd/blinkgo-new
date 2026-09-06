'use client';

import Image from 'next/image';
import Camera from 'lucide-react/dist/esm/icons/camera';
import Eye from 'lucide-react/dist/esm/icons/eye';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import { useState } from 'react';

type Locale = 'de' | 'ar' | 'en';

const copy = {
  de: {
    title: 'Zustellnachweis',
    body: 'Die Aufnahme ist privat, nur kurzzeitig abrufbar und wird automatisch nach 30 Tagen gelöscht.',
    show: 'Zustellfoto anzeigen',
    hide: 'Foto ausblenden',
    unavailable: 'Der Zustellnachweis ist nicht verfügbar oder bereits abgelaufen.',
    alt: 'Foto des Ablageorts der Bestellung',
  },
  ar: {
    title: 'إثبات التسليم',
    body: 'الصورة خاصة، تُعرض عبر رابط مؤقت فقط، وتُحذف تلقائيًا بعد 30 يومًا.',
    show: 'عرض صورة التسليم',
    hide: 'إخفاء الصورة',
    unavailable: 'صورة إثبات التسليم غير متاحة أو انتهت مدة الاحتفاظ بها.',
    alt: 'صورة مكان تسليم الطلب',
  },
  en: {
    title: 'Delivery proof',
    body: 'This photo is private, available through a short-lived link, and automatically deleted after 30 days.',
    show: 'View delivery photo',
    hide: 'Hide photo',
    unavailable: 'The delivery proof is unavailable or has already expired.',
    alt: 'Photo of the order drop-off location',
  },
} as const;

export function DeliveryProofCard({ orderId, locale }: { orderId: string; locale: Locale }) {
  const t = copy[locale] ?? copy.de;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleProof() {
    if (url) {
      setUrl(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/delivery-proof`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      const signedUrl = payload?.data?.proof?.url;
      if (!response.ok || typeof signedUrl !== 'string') throw new Error('proof_unavailable');
      setUrl(signedUrl);
    } catch {
      setError(t.unavailable);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card-glass overflow-hidden p-4" data-testid="customer-delivery-proof">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand/10 text-brand">
          <Camera className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-text">{t.title}</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">{t.body}</p>
        </div>
        <ShieldCheck className="size-5 shrink-0 text-emerald-400" aria-label="Private" />
      </div>

      {url ? (
        <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl border border-edge bg-black">
          <Image src={url} alt={t.alt} fill unoptimized className="object-contain" sizes="(max-width: 768px) 100vw, 640px" />
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-400">{error}</p> : null}

      <button
        type="button"
        onClick={toggleProof}
        disabled={loading}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-edge bg-surface-elevated px-4 font-extrabold text-text transition hover:border-brand/50 hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        {url ? t.hide : t.show}
      </button>
    </section>
  );
}
