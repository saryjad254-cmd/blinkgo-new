import { notFound } from 'next/navigation';
import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Utensils from 'lucide-react/dist/esm/icons/utensils';
import { requireRestaurantId } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { ProductForm } from '@/components/restaurant/ProductForm';
import { getServerTranslations } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { restaurantId }, { locale }] = await Promise.all([params, requireRestaurantId(), getServerTranslations()]);
  const supabase = createServiceClient();
  const { data: product } = await supabase.from('products').select('id,name,description,price,discount_price,category,is_available,preparation_time,track_stock,stock,product_kind,legal_name,net_quantity,net_quantity_unit,ingredients_text,allergens,additives,allergen_information_reviewed,nutrition,country_of_origin,producer_name,producer_address,storage_instructions,usage_instructions,alcohol_percentage,minimum_age,legal_information_complete').eq('id', id).eq('restaurant_id', restaurantId).maybeSingle();
  if (!product) notFound();
  const copy = locale === 'ar'
    ? { eyebrow: 'إدارة المنيو', title: `تعديل ${product.name}`, sub: 'حدّث التشغيل فورًا؛ التغييرات تنعكس على تجربة الزبون.', back: 'المنيو' }
    : locale === 'en'
      ? { eyebrow: 'Menu operations', title: `Edit ${product.name}`, sub: 'Update live operations; changes are reflected in the customer experience.', back: 'Menu' }
      : { eyebrow: 'Menü-Betrieb', title: `${product.name} bearbeiten`, sub: 'Live-Betrieb aktualisieren; Änderungen erscheinen sofort für Kunden.', back: 'Speisekarte' };
  return <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-3xl">
      <Link href="/restaurant/menu" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-zinc-400 hover:bg-white/5 hover:text-white"><ArrowLeft className={`size-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />{copy.back}</Link>
      <header className="mb-6 overflow-hidden rounded-[2rem] border border-red-500/20 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.2),transparent_42%),linear-gradient(145deg,#181818,#0c0c0c)] p-5 sm:p-7">
        <div className="flex items-center gap-4"><div className="flex size-14 items-center justify-center rounded-2xl bg-red-600 shadow-lg shadow-red-950/40"><Utensils className="size-7" /></div><div><p className="text-xs font-black uppercase tracking-[.22em] text-amber-300">{copy.eyebrow}</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{copy.title}</h1><p className="mt-2 text-sm text-zinc-400">{copy.sub}</p></div></div>
      </header>
      <ProductForm initial={{ ...product, price: Number(product.price), discount_price: product.discount_price == null ? null : Number(product.discount_price), preparation_time: Number(product.preparation_time ?? 15), stock: product.stock == null ? null : Number(product.stock), net_quantity: product.net_quantity == null ? null : Number(product.net_quantity), alcohol_percentage: product.alcohol_percentage == null ? null : Number(product.alcohol_percentage), nutrition: (product.nutrition ?? {}) as Record<string, number> }} locale={locale} />
    </div>
  </main>;
}
