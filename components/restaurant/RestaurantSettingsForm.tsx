'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import BadgeEuro from 'lucide-react/dist/esm/icons/badge-euro';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Save from 'lucide-react/dist/esm/icons/save';
import Store from 'lucide-react/dist/esm/icons/store';
import { updateRestaurantSettings } from '@/lib/restaurant-actions';
import type { Restaurant } from '@/lib/types';
import type { Locale } from '@/lib/i18n/I18nProvider';
import { formatAddress } from '@/lib/format-address';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

const COPY = {
  de: { title: 'Restaurantprofil', sub: 'Diese Informationen sehen Kunden im Store und beim Checkout.', saved: 'Restaurantdaten gespeichert', error: 'Änderungen konnten nicht gespeichert werden.', offline: 'Du bist offline. Verbinde dich, um Änderungen zu speichern.', name: 'Restaurantname', description: 'Beschreibung', address: 'Adresse', phone: 'Telefon', deliveryFee: 'Liefergebühr', minimumOrder: 'Mindestbestellwert', active: 'Für Bestellungen geöffnet', activeHint: 'Ausgeschaltet können Kunden den Store sehen, aber keine Bestellung abschließen.', pickup: 'Abholung im Restaurant', pickupHint: 'Kunden können ohne Lieferadresse und ohne Liefergebühr bestellen.', pickupInstructions: 'Abholhinweise für Kunden', pickupPlaceholder: 'Zum Beispiel: Bitte am Seiteneingang melden und den sechsstelligen Code zeigen.', save: 'Änderungen speichern', saving: 'Wird gespeichert…', commercial: 'Preise & Bestellung', identity: 'Identität & Kontakt' },
  en: { title: 'Restaurant profile', sub: 'Customers see this information in the storefront and checkout.', saved: 'Restaurant details saved', error: 'Could not save changes.', offline: 'You are offline. Reconnect to save changes.', name: 'Restaurant name', description: 'Description', address: 'Address', phone: 'Phone', deliveryFee: 'Delivery fee', minimumOrder: 'Minimum order', active: 'Open for orders', activeHint: 'When off, customers can see the store but cannot complete an order.', pickup: 'Customer pickup', pickupHint: 'Customers can order without a delivery address or delivery fee.', pickupInstructions: 'Pickup instructions for customers', pickupPlaceholder: 'For example: Use the side entrance and show the six-digit pickup code.', save: 'Save changes', saving: 'Saving…', commercial: 'Pricing & ordering', identity: 'Identity & contact' },
  ar: { title: 'ملف المطعم', sub: 'تظهر هذه المعلومات للزبون داخل المتجر وأثناء الدفع.', saved: 'تم حفظ بيانات المطعم', error: 'تعذر حفظ التغييرات.', offline: 'أنت غير متصل. أعد الاتصال لحفظ التغييرات.', name: 'اسم المطعم', description: 'الوصف', address: 'العنوان', phone: 'رقم الهاتف', deliveryFee: 'رسوم التوصيل', minimumOrder: 'الحد الأدنى للطلب', active: 'مفتوح لاستقبال الطلبات', activeHint: 'عند الإيقاف يمكن للزبون رؤية المتجر لكن لا يمكنه إكمال الطلب.', pickup: 'استلام الزبون من المطعم', pickupHint: 'يستطيع الزبون الطلب بدون عنوان أو رسوم توصيل.', pickupInstructions: 'تعليمات الاستلام للزبون', pickupPlaceholder: 'مثال: ادخل من الباب الجانبي وأظهر رمز الاستلام المكون من 6 أرقام.', save: 'حفظ التغييرات', saving: 'جارٍ الحفظ…', commercial: 'الأسعار والطلب', identity: 'الهوية والتواصل' },
} as const;

export function RestaurantSettingsForm({ restaurant, locale }: { restaurant: Restaurant & { minimum_order?: number | null }; locale: Locale }) {
  const t = COPY[locale]; const router = useRouter(); const network = useOnlineStatus(); const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition(); const [message, setMessage] = useState<string | null>(null);
  function submit(formData: FormData) {
    if (!network.isOnline) return setMessage(t.offline);
    setMessage(null);
    startTransition(async () => {
      try { const result = await updateRestaurantSettings(formData); if (!result.ok) { const message = extractErrorMessage(result, t.error); setMessage(message); toastError(message); return; } success(t.saved); router.refresh(); }
      catch { setMessage(t.error); toastError(t.error); }
    });
  }
  const field = 'mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-white outline-none transition placeholder:text-zinc-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/20';
  return <form action={submit} data-testid="restaurant-settings-form" className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-4 sm:p-6">
    <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-red-500/10 text-red-400"><Building2 className="size-5" /></span><div><h2 className="text-lg font-black text-white">{t.title}</h2><p className="mt-1 text-sm leading-6 text-zinc-500">{t.sub}</p></div></div>
    {!network.isOnline && <p data-testid="restaurant-settings-offline" role="alert" className="mt-4 flex items-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200"><AlertTriangle className="size-4" />{t.offline}</p>}
    {message && <p role="alert" className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{message}</p>}
    <fieldset className="mt-6"><legend className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-200"><Building2 className="size-4 text-red-400" />{t.identity}</legend><div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.name}><input data-testid="restaurant-settings-name" id="restaurant-name" name="name" required minLength={2} maxLength={100} defaultValue={restaurant.name} className={field} /></Field>
      <Field label={t.phone}><input id="restaurant-phone" name="phone" type="tel" maxLength={20} defaultValue={restaurant.phone ?? ''} className={field} dir="ltr" /></Field>
      <Field label={t.address} wide><span className="relative block"><MapPin className="pointer-events-none absolute start-4 top-6 size-4 text-zinc-600" /><input id="restaurant-address" name="address" required minLength={2} maxLength={200} defaultValue={formatAddress(restaurant.address, '')} className={`${field} ps-11`} /></span></Field>
      <Field label={t.description} wide><textarea id="restaurant-description" name="description" maxLength={500} rows={4} defaultValue={restaurant.description ?? ''} className={`${field} h-auto min-h-28 py-3`} /></Field>
    </div></fieldset>
    <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-3">
      <label className="flex min-h-14 cursor-pointer items-center gap-3"><input data-testid="restaurant-settings-pickup" type="checkbox" name="pickup_enabled" defaultChecked={restaurant.pickup_enabled !== false} className="peer sr-only" /><span aria-hidden="true" className="relative h-7 w-12 shrink-0 rounded-full bg-zinc-700 transition peer-checked:bg-amber-400"><span className="absolute left-1 top-1 size-5 rounded-full bg-white transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" /></span><Store className="size-5 shrink-0 text-amber-300" /><span><strong className="block text-sm text-white">{t.pickup}</strong><span className="mt-0.5 block text-xs leading-5 text-zinc-500">{t.pickupHint}</span></span></label>
      <Field label={t.pickupInstructions}><textarea data-testid="restaurant-settings-pickup-instructions" id="restaurant-pickup-instructions" name="pickup_instructions" maxLength={500} rows={3} defaultValue={restaurant.pickup_instructions ?? ''} placeholder={t.pickupPlaceholder} className={`${field} h-auto min-h-24 py-3`} /></Field>
    </div>
    <fieldset className="mt-6 border-t border-white/10 pt-6"><legend className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-200"><BadgeEuro className="size-4 text-amber-300" />{t.commercial}</legend><div className="grid gap-4 sm:grid-cols-2">
      <Field label={`${t.deliveryFee} (€)`}><input data-testid="restaurant-settings-delivery-fee" id="restaurant-delivery-fee" name="delivery_fee" type="number" step="0.01" min="0" max="100" required defaultValue={Number(restaurant.delivery_fee ?? 0)} className={field} /></Field>
      <Field label={`${t.minimumOrder} (€)`}><input data-testid="restaurant-settings-min-order" id="restaurant-min-order" name="min_order_amount" type="number" step="0.01" min="0" max="9999" required defaultValue={Number(restaurant.min_order_amount ?? restaurant.minimum_order ?? 0)} className={field} /></Field>
    </div></fieldset>
    <label className="mt-5 flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3"><input data-testid="restaurant-settings-active" type="checkbox" name="is_active" defaultChecked={restaurant.is_active !== false} className="peer sr-only" /><span aria-hidden="true" className="relative h-7 w-12 shrink-0 rounded-full bg-zinc-700 transition peer-checked:bg-emerald-500"><span className="absolute left-1 top-1 size-5 rounded-full bg-white transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" /></span><span><strong className="block text-sm text-white">{t.active}</strong><span className="mt-0.5 block text-xs leading-5 text-zinc-500">{t.activeHint}</span></span></label>
    <button data-testid="restaurant-settings-save" disabled={pending || !network.isOnline} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 font-extrabold text-white shadow-lg shadow-red-950/30 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? t.saving : t.save}</button>
  </form>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={`block text-sm font-semibold text-zinc-300 ${wide ? 'sm:col-span-2' : ''}`}>{label}{children}</label>; }
