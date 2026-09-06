'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import ImageIcon from 'lucide-react/dist/esm/icons/image';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Send from 'lucide-react/dist/esm/icons/send';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';

const COPY = {
  de: { eyebrow: 'Qualitätsprüfung', title: 'Produkt beantragen', sub: 'Gib vollständige Informationen an. Nach der Freigabe erscheint das Produkt in deiner Speisekarte.', name: 'Produktname', desc: 'Beschreibung', category: 'Kategorie', price: 'Preisvorschlag', image: 'Bild-URL', optional: 'Optional', prep: 'Zubereitungszeit', min: 'Min.', send: 'Zur Prüfung senden', sending: 'Wird gesendet…', back: 'Produktanfragen', success: 'Anfrage wurde gesendet', error: 'Anfrage konnte nicht gesendet werden.', offline: 'Du bist offline. Verbinde dich, um die Anfrage zu senden.', process: 'BlinkGo prüft Qualität, Darstellung und Richtlinien. Den Preis und die Verfügbarkeit steuerst du nach Freigabe.' },
  en: { eyebrow: 'Quality review', title: 'Request a product', sub: 'Provide complete information. Once approved, the product appears in your menu.', name: 'Product name', desc: 'Description', category: 'Category', price: 'Suggested price', image: 'Image URL', optional: 'Optional', prep: 'Preparation time', min: 'min', send: 'Send for review', sending: 'Sending…', back: 'Product requests', success: 'Request submitted', error: 'Could not submit the request.', offline: 'You are offline. Reconnect to submit the request.', process: 'BlinkGo reviews quality, presentation and policy. You control price and availability after approval.' },
  ar: { eyebrow: 'مراجعة الجودة', title: 'طلب منتج جديد', sub: 'أدخل معلومات كاملة. بعد الموافقة سيظهر المنتج ضمن منيو المطعم.', name: 'اسم المنتج', desc: 'الوصف', category: 'الفئة', price: 'السعر المقترح', image: 'رابط الصورة', optional: 'اختياري', prep: 'وقت التحضير', min: 'دقيقة', send: 'إرسال للمراجعة', sending: 'جارٍ الإرسال…', back: 'طلبات المنتجات', success: 'تم إرسال الطلب', error: 'تعذر إرسال الطلب.', offline: 'أنت غير متصل. أعد الاتصال لإرسال الطلب.', process: 'يراجع BlinkGo الجودة والعرض والسياسات. بعد الموافقة تتحكم أنت بالسعر والتوفر.' },
} as const;

export default function NewProductRequestPage() {
  const { locale } = useI18n(); const t = COPY[locale]; const router = useRouter(); const network = useOnlineStatus(); const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!network.isOnline) return setMessage(t.offline); setBusy(true); setMessage(null);
    try { const body = Object.fromEntries(new FormData(event.currentTarget).entries()); const response = await fetch('/api/product-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const result = await response.json().catch(() => ({})); if (!response.ok) { const text = typeof result.error === 'string' ? result.error : t.error; setMessage(text); toastError(t.error); return; } success(t.success); router.push('/restaurant/menu/requests'); router.refresh(); } catch { setMessage(t.error); toastError(t.error); } finally { setBusy(false); }
  }
  const field = 'mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-white outline-none transition placeholder:text-zinc-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/20';
  return <main data-testid="restaurant-request-form-page" dir={locale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl">
    <Link href="/restaurant/menu/requests" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-zinc-400 hover:bg-white/5 hover:text-white"><ArrowLeft className={`size-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />{t.back}</Link>
    <header className="mb-5 overflow-hidden rounded-[2rem] border border-red-500/20 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.22),transparent_42%),linear-gradient(145deg,#181818,#0c0c0c)] p-5 sm:p-7"><p className="text-xs font-black uppercase tracking-[.22em] text-amber-300">{t.eyebrow}</p><h1 className="mt-2 text-3xl font-black">{t.title}</h1><p className="mt-2 text-sm leading-6 text-zinc-400">{t.sub}</p></header>
    <form data-testid="restaurant-request-form" onSubmit={submit} className="space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-300" /><p className="text-sm leading-6 text-amber-100/75">{t.process}</p></div>
      {!network.isOnline && <p role="alert" className="flex items-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200"><AlertTriangle className="size-4" />{t.offline}</p>}{message && <p role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{message}</p>}
      <label className="block text-sm font-semibold text-zinc-300">{t.name}<input data-testid="restaurant-request-name" name="name" minLength={2} maxLength={100} required autoComplete="off" className={field} /></label>
      <label className="block text-sm font-semibold text-zinc-300">{t.desc}<textarea data-testid="restaurant-request-description" name="description" maxLength={1000} rows={4} className={`${field} h-auto min-h-28 py-3`} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-300">{t.category}<input data-testid="restaurant-request-category" name="category" required maxLength={100} className={field} /></label><label className="text-sm font-semibold text-zinc-300">{t.price} (€)<input data-testid="restaurant-request-price" name="suggested_price" type="number" min="0.01" max="9999" step="0.01" required className={field} /></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-300">{t.image} <span className="text-zinc-600">({t.optional})</span><span className="relative block"><ImageIcon className="pointer-events-none absolute start-4 top-6 size-4 text-zinc-600" /><input name="image_url" type="url" inputMode="url" className={`${field} ps-11`} /></span></label><label className="text-sm font-semibold text-zinc-300">{t.prep} ({t.min})<input data-testid="restaurant-request-prep" name="preparation_time" type="number" min="1" max="180" defaultValue="15" required className={field} /></label></div>
      <button data-testid="restaurant-request-submit" disabled={busy || !network.isOnline} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 font-extrabold text-white shadow-lg shadow-red-950/30 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{busy ? t.sending : t.send}</button>
    </form>
  </div></main>;
}
