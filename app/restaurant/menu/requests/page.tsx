import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import PackageSearch from 'lucide-react/dist/esm/icons/package-search';
import Plus from 'lucide-react/dist/esm/icons/plus';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import { requireRestaurantId } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { getServerTranslations } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ProductRequest = { id: string; name: string; category: string | null; suggested_price: number | string; status: 'pending' | 'approved' | 'rejected' | string; rejection_reason: string | null; created_at: string };

const COPY = {
  de: { back: 'Speisekarte', eyebrow: 'Produkt-Governance', title: 'Produktanfragen', sub: 'Ein klarer Freigabeprozess schützt Qualität, Preise und Kundenerlebnis.', add: 'Produkt beantragen', empty: 'Noch keine Anfragen', emptySub: 'Beantrage dein erstes Produkt. BlinkGo prüft die Angaben vor der Veröffentlichung.', reason: 'Hinweis der Prüfung', pending: 'In Prüfung', approved: 'Freigegeben', rejected: 'Abgelehnt', total: 'Gesamt', submitted: 'Eingereicht' },
  en: { back: 'Menu', eyebrow: 'Product governance', title: 'Product requests', sub: 'A clear approval flow protects quality, pricing and the customer experience.', add: 'Request product', empty: 'No requests yet', emptySub: 'Request your first product. BlinkGo reviews the details before publication.', reason: 'Review note', pending: 'Under review', approved: 'Approved', rejected: 'Rejected', total: 'Total', submitted: 'Submitted' },
  ar: { back: 'المنيو', eyebrow: 'حوكمة المنتجات', title: 'طلبات المنتجات', sub: 'مسار موافقة واضح يحمي الجودة والأسعار وتجربة الزبون.', add: 'طلب منتج', empty: 'لا توجد طلبات بعد', emptySub: 'اطلب أول منتج، وسيراجع BlinkGo بياناته قبل النشر.', reason: 'ملاحظة المراجعة', pending: 'قيد المراجعة', approved: 'مقبول', rejected: 'مرفوض', total: 'الإجمالي', submitted: 'تاريخ الإرسال' },
} as const;

export default async function ProductRequestsPage() {
  const [{ restaurantId }, { locale }] = await Promise.all([requireRestaurantId(), getServerTranslations()]);
  const supabase = createServiceClient();
  const { data } = await supabase.from('product_requests').select('id,name,category,suggested_price,status,rejection_reason,created_at').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
  const requests = (data ?? []) as ProductRequest[];
  const t = COPY[locale];
  const counts = { pending: requests.filter((item) => item.status === 'pending').length, approved: requests.filter((item) => item.status === 'approved').length, rejected: requests.filter((item) => item.status === 'rejected').length };

  return <main data-testid="restaurant-product-requests" dir={locale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/restaurant/menu" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-zinc-400 hover:bg-white/5 hover:text-white"><ArrowLeft className={`size-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />{t.back}</Link>
        <Link data-testid="restaurant-request-new" href="/restaurant/menu/requests/new" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-red-600 px-5 font-extrabold text-white shadow-lg shadow-red-950/30 hover:bg-red-500"><Plus className="size-5" />{t.add}</Link>
      </div>

      <header className="overflow-hidden rounded-[2rem] border border-red-500/20 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.2),transparent_42%),linear-gradient(145deg,#181818,#0c0c0c)] p-5 sm:p-7">
        <p className="text-xs font-black uppercase tracking-[.22em] text-amber-300">{t.eyebrow}</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{t.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{t.sub}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label={t.total} value={requests.length} icon={<PackageSearch className="size-5 text-white" />} /><Stat label={t.pending} value={counts.pending} icon={<Clock3 className="size-5 text-amber-300" />} /><Stat label={t.approved} value={counts.approved} icon={<CheckCircle2 className="size-5 text-emerald-400" />} /><Stat label={t.rejected} value={counts.rejected} icon={<XCircle className="size-5 text-red-400" />} /></div>
      </header>

      <section className="mt-5 space-y-3">
        {requests.length === 0 ? <div className="rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] px-5 py-14 text-center"><PackageSearch className="mx-auto size-12 text-zinc-600" /><h2 className="mt-4 text-xl font-black">{t.empty}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">{t.emptySub}</p></div> : requests.map((item) => {
          const config = item.status === 'approved' ? { label: t.approved, style: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300', Icon: CheckCircle2 } : item.status === 'rejected' ? { label: t.rejected, style: 'border-red-400/20 bg-red-400/10 text-red-300', Icon: XCircle } : { label: t.pending, style: 'border-amber-400/20 bg-amber-400/10 text-amber-300', Icon: Clock3 };
          return <article data-testid="restaurant-request-card" key={item.id} className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.025] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className="truncate text-lg font-extrabold">{item.name}</h2><p className="mt-1 text-sm text-zinc-400">{item.category || '—'} · €{Number(item.suggested_price).toFixed(2)}</p><p className="mt-2 text-xs text-zinc-600">{t.submitted}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</p></div><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black ${config.style}`}><config.Icon className="size-4" />{config.label}</span></div>{item.rejection_reason && <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"><strong>{t.reason}:</strong> {item.rejection_reason}</div>}</article>;
        })}
      </section>
    </div>
  </main>;
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="flex items-center justify-between gap-2">{icon}<strong className="text-2xl font-black">{value}</strong></div><p className="mt-2 truncate text-xs font-bold text-zinc-500">{label}</p></div>; }
