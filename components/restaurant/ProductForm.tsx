'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import BadgeEuro from 'lucide-react/dist/esm/icons/badge-euro';
import Boxes from 'lucide-react/dist/esm/icons/boxes';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Save from 'lucide-react/dist/esm/icons/save';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import { updateProduct } from '@/lib/restaurant-actions';
import type { Locale } from '@/lib/i18n/I18nProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

interface ProductInitial {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  discount_price?: number | null;
  category?: string | null;
  is_available?: boolean;
  preparation_time?: number;
  track_stock?: boolean;
  stock?: number | null;
  product_kind?: 'prepared_food' | 'prepacked_food' | 'beverage' | 'alcohol' | 'non_food';
  legal_name?: string | null;
  net_quantity?: number | null;
  net_quantity_unit?: string | null;
  ingredients_text?: string | null;
  allergens?: string[];
  additives?: string[];
  allergen_information_reviewed?: boolean;
  nutrition?: Record<string, number>;
  country_of_origin?: string | null;
  producer_name?: string | null;
  producer_address?: string | null;
  storage_instructions?: string | null;
  usage_instructions?: string | null;
  alcohol_percentage?: number | null;
  minimum_age?: 16 | 18 | null;
}

const COPY = {
  de: {
    governed: 'Produktidentität geschützt', governedBody: 'Name, Beschreibung und Kategorie werden nach Freigabe zentral verwaltet. Preis, Bestand, Verfügbarkeit und Zubereitungszeit kannst du sofort steuern.',
    price: 'Regulärer Preis', discount: 'Aktionspreis', discountHint: 'Optional und immer niedriger als der reguläre Preis.', prep: 'Zubereitungszeit', minutes: 'Minuten', available: 'Für Kunden bestellbar', availableHint: 'Ausgeschaltet bleibt das Produkt sichtbar, kann aber nicht bestellt werden.', stock: 'Bestand verfolgen', stockHint: 'BlinkGo stoppt Bestellungen automatisch bei 0.', units: 'Verfügbare Stückzahl', save: 'Änderungen speichern', saving: 'Wird gespeichert…', back: 'Zurück zur Speisekarte', offline: 'Du bist offline. Verbinde dich, um Änderungen zu speichern.', success: 'Produkt wurde aktualisiert', error: 'Änderungen konnten nicht gespeichert werden.', invalidDiscount: 'Der Aktionspreis muss niedriger als der reguläre Preis sein.', category: 'Kategorie', none: 'Ohne Kategorie', live: 'Live-Steuerung',
  },
  en: {
    governed: 'Product identity protected', governedBody: 'Name, description and category are centrally governed after approval. You can instantly control price, stock, availability and preparation time.',
    price: 'Regular price', discount: 'Sale price', discountHint: 'Optional and always lower than the regular price.', prep: 'Preparation time', minutes: 'minutes', available: 'Available to customers', availableHint: 'When off, the product stays visible but cannot be ordered.', stock: 'Track inventory', stockHint: 'BlinkGo automatically stops orders at 0.', units: 'Units available', save: 'Save changes', saving: 'Saving…', back: 'Back to menu', offline: 'You are offline. Reconnect to save changes.', success: 'Product updated', error: 'Could not save the changes.', invalidDiscount: 'Sale price must be lower than the regular price.', category: 'Category', none: 'No category', live: 'Live controls',
  },
  ar: {
    governed: 'هوية المنتج محمية', governedBody: 'الاسم والوصف والفئة تُدار مركزيًا بعد الموافقة. يمكنك التحكم فورًا بالسعر والمخزون والتوفر ووقت التحضير.',
    price: 'السعر الأساسي', discount: 'سعر العرض', discountHint: 'اختياري ويجب أن يكون أقل من السعر الأساسي.', prep: 'وقت التحضير', minutes: 'دقيقة', available: 'متاح للطلب', availableHint: 'عند إيقافه يبقى المنتج ظاهرًا لكن لا يمكن طلبه.', stock: 'تتبّع المخزون', stockHint: 'يوقف BlinkGo الطلب تلقائيًا عند وصول المخزون إلى صفر.', units: 'الكمية المتوفرة', save: 'حفظ التعديلات', saving: 'جارٍ الحفظ…', back: 'العودة إلى المنيو', offline: 'أنت غير متصل. أعد الاتصال لحفظ التغييرات.', success: 'تم تحديث المنتج', error: 'تعذر حفظ التغييرات.', invalidDiscount: 'يجب أن يكون سعر العرض أقل من السعر الأساسي.', category: 'الفئة', none: 'بدون فئة', live: 'تحكم مباشر',
  },
} as const;

export function ProductForm({ initial, locale }: { initial: ProductInitial; locale: Locale }) {
  const t = COPY[locale];
  const router = useRouter();
  const network = useOnlineStatus();
  const { success, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [trackStock, setTrackStock] = useState(initial.track_stock === true);
  const [productKind, setProductKind] = useState(initial.product_kind ?? 'prepared_food');

  async function handleSubmit(formData: FormData) {
    if (!network.isOnline) return setMessage(t.offline);
    const price = Number(formData.get('price'));
    const discountRaw = String(formData.get('discount_price') ?? '').trim();
    if (discountRaw && Number(discountRaw) >= price) return setMessage(t.invalidDiscount);
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await updateProduct(initial.id, formData);
      if (!result.ok) {
        setMessage(extractErrorMessage(result, t.error));
        toastError(t.error);
        return;
      }
      success(t.success);
      router.push('/restaurant/menu');
      router.refresh();
    } catch {
      setMessage(t.error);
      toastError(t.error);
    } finally {
      setSubmitting(false);
    }
  }

  const field = 'mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-60';
  return (
    <form action={handleSubmit} className="space-y-5" data-testid="restaurant-product-form">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-300" /><div><p className="font-bold text-amber-100">{t.governed}</p><p className="mt-1 text-sm leading-6 text-amber-100/70">{t.governedBody}</p></div></div>
      </div>

      {!network.isOnline && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"><AlertTriangle className="size-4" />{t.offline}</div>}
      {message && <p role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{message}</p>}

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><BadgeEuro className="size-5 text-red-400" /><h2 className="font-extrabold text-white">{t.live}</h2></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-zinc-300">{t.price} (€)<input data-testid="restaurant-product-price" className={field} name="price" type="number" step="0.01" min="0.01" max="9999" required defaultValue={initial.price} /></label>
          <label className="text-sm font-semibold text-zinc-300">{t.discount} (€)<input data-testid="restaurant-product-discount" className={field} name="discount_price" type="number" step="0.01" min="0.01" max="9999" defaultValue={initial.discount_price ?? ''} /><span className="mt-1 block text-xs font-normal text-zinc-500">{t.discountHint}</span></label>
          <label className="text-sm font-semibold text-zinc-300">{t.prep}<span className="relative block"><Clock3 className="pointer-events-none absolute start-4 top-6 size-4 text-zinc-500" /><input data-testid="restaurant-product-prep" className={`${field} ps-11`} name="preparation_time" type="number" min="1" max="180" required defaultValue={initial.preparation_time ?? 15} /></span><span className="mt-1 block text-xs font-normal text-zinc-500">{t.minutes}</span></label>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-sm font-semibold text-zinc-300">{t.category}</p><p className="mt-2 font-bold text-white">{initial.category || t.none}</p></div>
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
        <Toggle name="is_available" testId="restaurant-product-available" checked={initial.is_available !== false} title={t.available} description={t.availableHint} />
        <Toggle name="track_stock" testId="restaurant-product-stock-toggle" checked={trackStock} onChange={setTrackStock} title={t.stock} description={t.stockHint} icon={<Boxes className="size-5 text-amber-300" />} />
        {trackStock && <label className="block text-sm font-semibold text-zinc-300">{t.units}<input data-testid="restaurant-product-stock" className={field} name="stock" type="number" min="0" max="100000" required defaultValue={initial.stock ?? 0} /></label>}
      </section>

      <LegalProductFields initial={initial} locale={locale} field={field} productKind={productKind} onKindChange={setProductKind} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link data-testid="restaurant-product-back" href="/restaurant/menu" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 font-bold text-white hover:bg-white/10"><ArrowLeft className={`size-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />{t.back}</Link>
        <button data-testid="restaurant-product-save" disabled={submitting || !network.isOnline} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 font-extrabold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{submitting ? t.saving : t.save}</button>
      </div>
    </form>
  );
}

function LegalProductFields({ initial, locale, field, productKind, onKindChange }: { initial: ProductInitial; locale: Locale; field: string; productKind: NonNullable<ProductInitial['product_kind']>; onKindChange: (value: NonNullable<ProductInitial['product_kind']>) => void }) {
  const label = (de: string, en: string, ar: string) => locale === 'ar' ? ar : locale === 'en' ? en : de;
  const textarea = `${field} min-h-24 py-3`;
  const packaged = productKind === 'prepacked_food' || productKind === 'beverage' || productKind === 'alcohol';
  const food = productKind !== 'non_food';
  const nutrition = initial.nutrition ?? {};
  return <section data-testid="restaurant-product-legal-information" className="space-y-4 rounded-3xl border border-amber-400/20 bg-amber-400/[0.055] p-4 sm:p-5">
    <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-amber-300" /><div><h2 className="font-extrabold text-white">{label('Pflichtangaben zum Produkt', 'Mandatory product information', 'معلومات المنتج الإلزامية')}</h2><p className="mt-1 text-xs leading-5 text-zinc-400">{label('Diese Angaben werden Kunden vor dem Kauf angezeigt. BlinkGo berechnet den Grundpreis automatisch.', 'Customers see this before purchase. BlinkGo calculates the unit price automatically.', 'تظهر هذه المعلومات للزبون قبل الشراء ويحسب BlinkGo سعر الوحدة تلقائياً.')}</p></div></div>
    <label className="block text-sm font-semibold text-zinc-300">{label('Produktart', 'Product type', 'نوع المنتج')}<select data-testid="product-kind" className={field} name="product_kind" value={productKind} onChange={(event) => onKindChange(event.target.value as NonNullable<ProductInitial['product_kind']>)}><option value="prepared_food">{label('Zubereitetes Gericht', 'Prepared food', 'طعام محضّر')}</option><option value="prepacked_food">{label('Vorverpacktes Lebensmittel', 'Prepacked food', 'غذاء معبأ')}</option><option value="beverage">{label('Alkoholfreies Getränk', 'Non-alcoholic beverage', 'مشروب غير كحولي')}</option><option value="alcohol">{label('Alkohol', 'Alcohol', 'كحول')}</option><option value="non_food">{label('Non-Food-Artikel', 'Non-food item', 'منتج غير غذائي')}</option></select></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold text-zinc-300">{label('Rechtliche Bezeichnung', 'Legal name', 'الاسم القانوني')}<input className={field} name="legal_name" maxLength={200} defaultValue={initial.legal_name ?? initial.name} required={packaged} /></label>
      {packaged && <div className="grid grid-cols-[1fr_8rem] gap-2"><label className="text-sm font-semibold text-zinc-300">{label('Nettofüllmenge', 'Net quantity', 'الكمية الصافية')}<input className={field} name="net_quantity" type="number" min="0.001" step="0.001" defaultValue={initial.net_quantity ?? ''} required /></label><label className="text-sm font-semibold text-zinc-300">{label('Einheit', 'Unit', 'الوحدة')}<select className={field} name="net_quantity_unit" defaultValue={initial.net_quantity_unit ?? (productKind === 'prepacked_food' ? 'g' : 'ml')}><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="piece">Stück</option></select></label></div>}
    </div>
    {food && <><label className="block text-sm font-semibold text-zinc-300">{label('Zutaten', 'Ingredients', 'المكونات')}<textarea className={textarea} name="ingredients_text" maxLength={5000} defaultValue={initial.ingredients_text ?? ''} required={productKind === 'prepacked_food' || productKind === 'beverage'} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-300">{label('Allergene (Komma oder Zeile)', 'Allergens', 'مسببات الحساسية')}<textarea className={textarea} name="allergens" defaultValue={(initial.allergens ?? []).join(', ')} /></label><label className="text-sm font-semibold text-zinc-300">{label('Zusatzstoffe', 'Additives', 'المضافات')}<textarea className={textarea} name="additives" defaultValue={(initial.additives ?? []).join(', ')} /></label></div><Toggle name="allergen_information_reviewed" testId="product-allergen-reviewed" checked={initial.allergen_information_reviewed === true} title={label('Allergenangaben geprüft', 'Allergen information reviewed', 'تمت مراجعة معلومات الحساسية')} description={label('Bestätige dies auch, wenn keine Allergene vorhanden sind.', 'Confirm even when no allergens are present.', 'أكد ذلك حتى لو لم توجد مسببات حساسية.')} /></>}
    {productKind === 'prepacked_food' && <div><h3 className="mb-2 text-sm font-bold text-white">{label('Nährwerte je 100 g/ml', 'Nutrition per 100 g/ml', 'القيم الغذائية لكل 100 غ/مل')}</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['energy_kj','kJ'],['energy_kcal','kcal'],['fat_g',label('Fett g','Fat g','دهون غ')],['saturates_g',label('gesättigt g','Saturates g','مشبعة غ')],['carbohydrate_g',label('Kohlenhydrate g','Carbs g','كربوهيدرات غ')],['sugars_g',label('Zucker g','Sugars g','سكر غ')],['protein_g',label('Eiweiß g','Protein g','بروتين غ')],['salt_g',label('Salz g','Salt g','ملح غ')]].map(([name, text]) => <label key={name} className="text-xs font-semibold text-zinc-400">{text}<input className={field} name={name} type="number" min="0" step="0.01" required={name !== 'energy_kcal'} defaultValue={nutrition[name] ?? ''} /></label>)}</div></div>}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-300">{label('Herkunftsland', 'Country of origin', 'بلد المنشأ')}<input className={field} name="country_of_origin" defaultValue={initial.country_of_origin ?? ''} /></label><label className="text-sm font-semibold text-zinc-300">{label('Hersteller', 'Producer', 'المنتِج')}<input className={field} name="producer_name" defaultValue={initial.producer_name ?? ''} required={productKind === 'prepacked_food' || productKind === 'alcohol'} /></label></div>
    <label className="block text-sm font-semibold text-zinc-300">{label('Herstelleranschrift', 'Producer address', 'عنوان المنتج')}<textarea className={textarea} name="producer_address" defaultValue={initial.producer_address ?? ''} required={productKind === 'prepacked_food'} /></label>
    {productKind === 'alcohol' && <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-zinc-300">{label('Alkohol % vol.', 'Alcohol % vol.', 'نسبة الكحول')}<input className={field} name="alcohol_percentage" type="number" min="0.1" max="100" step="0.1" defaultValue={initial.alcohol_percentage ?? ''} required /></label><label className="text-sm font-semibold text-zinc-300">{label('Mindestalter', 'Minimum age', 'الحد الأدنى للعمر')}<select className={field} name="minimum_age" defaultValue={initial.minimum_age ?? 18}><option value="16">16</option><option value="18">18</option></select></label></div>}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-300">{label('Lagerhinweise', 'Storage instructions', 'تعليمات التخزين')}<textarea className={textarea} name="storage_instructions" defaultValue={initial.storage_instructions ?? ''} /></label><label className="text-sm font-semibold text-zinc-300">{label('Gebrauchshinweise', 'Usage instructions', 'تعليمات الاستخدام')}<textarea className={textarea} name="usage_instructions" defaultValue={initial.usage_instructions ?? ''} /></label></div>
  </section>;
}

function Toggle({ name, testId, checked, onChange, title, description, icon }: { name: string; testId: string; checked: boolean; onChange?: (value: boolean) => void; title: string; description: string; icon?: React.ReactNode }) {
  const [value, setValue] = useState(checked);
  return <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
    <input data-testid={testId} className="peer sr-only" type="checkbox" name={name} checked={value} onChange={(event) => { setValue(event.target.checked); onChange?.(event.target.checked); }} />
    {icon}
    <span className="min-w-0 flex-1"><span className="block font-bold text-white">{title}</span><span className="mt-0.5 block text-xs leading-5 text-zinc-500">{description}</span></span>
    <span aria-hidden="true" className="relative h-7 w-12 shrink-0 rounded-full bg-zinc-700 transition peer-checked:bg-red-600"><span className="absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" /></span>
  </label>;
}
