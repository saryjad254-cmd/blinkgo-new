import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Bell from 'lucide-react/dist/esm/icons/bell';
import BadgeCheck from 'lucide-react/dist/esm/icons/badge-check';
import Headphones from 'lucide-react/dist/esm/icons/headphones';
import MessageSquareText from 'lucide-react/dist/esm/icons/message-square-text';
import Settings from 'lucide-react/dist/esm/icons/settings';
import Star from 'lucide-react/dist/esm/icons/star';
import { requireRestaurantId } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { RestaurantSettingsForm } from '@/components/restaurant/RestaurantSettingsForm';
import { WorkingHoursForm } from '@/components/restaurant/WorkingHoursForm';
import { SpecialHoursForm } from '@/components/restaurant/SpecialHoursForm';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import { isRestaurantOpenAt, type RestaurantSpecialHour } from '@/lib/restaurant-hours';
import type { Restaurant } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SettingsRecord = Restaurant & { minimum_order?: number | null; opening_hours?: unknown };

export default async function SettingsPage() {
  const [{ restaurantId }, { locale }] = await Promise.all([requireRestaurantId(), getServerTranslations()]);
  const service = createServiceClient();
  const [{ data }, { data: specialHours }] = await Promise.all([
    service.from('restaurants').select('id,owner_id,name,description,address,phone,is_active,is_verified,rating,review_count,delivery_fee,min_order_amount,pickup_enabled,pickup_instructions,opening_hours,updated_at').eq('id', restaurantId).maybeSingle(),
    service.from('restaurant_special_hours').select('id,service_date,is_closed,open_time,close_time,reason').eq('restaurant_id', restaurantId).gte('service_date', new Date().toISOString().slice(0, 10)).order('service_date', { ascending: true }).limit(100),
  ]);
  const restaurant = data as SettingsRecord | null;
  const copy = locale === 'ar'
    ? { back: 'لوحة المطعم', eyebrow: 'مركز التحكم', title: 'إعدادات المطعم', sub: 'أدر معلومات المتجر، الأسعار وساعات العمل من مصدر واحد.', open: 'مفتوح حسب الجدول', closed: 'مغلق حسب الجدول', rating: 'التقييم', reviews: 'التقييمات', verified: 'حساب موثّق', unverified: 'بانتظار التوثيق', notifications: 'الإشعارات', support: 'الدعم', missing: 'لم يتم العثور على المطعم.', updated: 'آخر تحديث' }
    : locale === 'en'
      ? { back: 'Restaurant dashboard', eyebrow: 'Control center', title: 'Restaurant settings', sub: 'Manage storefront information, pricing and opening hours from one source.', open: 'Open by schedule', closed: 'Closed by schedule', rating: 'Rating', reviews: 'Reviews', verified: 'Verified account', unverified: 'Verification pending', notifications: 'Notifications', support: 'Support', missing: 'Restaurant not found.', updated: 'Last updated' }
      : { back: 'Restaurant-Dashboard', eyebrow: 'Kontrollzentrum', title: 'Restaurant-Einstellungen', sub: 'Store-Informationen, Preise und Öffnungszeiten aus einer Quelle verwalten.', open: 'Laut Plan geöffnet', closed: 'Laut Plan geschlossen', rating: 'Bewertung', reviews: 'Bewertungen', verified: 'Verifiziertes Konto', unverified: 'Verifizierung ausstehend', notifications: 'Benachrichtigungen', support: 'Support', missing: 'Restaurant nicht gefunden.', updated: 'Zuletzt aktualisiert' };

  if (!restaurant) return <main className="grid min-h-[70vh] place-items-center bg-[#080808] p-6 text-center text-white"><div><Settings className="mx-auto size-12 text-zinc-700" /><h1 className="mt-4 text-xl font-black">{copy.missing}</h1><Link href="/restaurant/dashboard" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-red-600 px-4 font-bold">{copy.back}</Link></div></main>;
  const typedSpecialHours = (specialHours ?? []) as RestaurantSpecialHour[];
  const openNow = restaurant.is_active !== false && isRestaurantOpenAt(restaurant.opening_hours, new Date(), typedSpecialHours);
  const dateLocale = locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE';
  return <main data-testid="restaurant-settings-center" dir={locale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Link href="/restaurant/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-zinc-400 hover:bg-white/5 hover:text-white"><ArrowLeft className={`size-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />{copy.back}</Link><div className="flex gap-2"><Link href="/restaurant/notifications" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold"><Bell className="size-4" />{copy.notifications}</Link><Link href="/restaurant/support" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold"><Headphones className="size-4" />{copy.support}</Link></div></div>
      <header className="overflow-hidden rounded-[2rem] border border-red-500/20 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.22),transparent_42%),linear-gradient(145deg,#181818,#0c0c0c)] p-5 sm:p-7"><p className="text-xs font-black uppercase tracking-[.22em] text-amber-300">{copy.eyebrow}</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black sm:text-4xl">{copy.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{copy.sub}</p></div><span className={`rounded-full border px-3 py-2 text-xs font-black ${openNow ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/25 bg-amber-400/10 text-amber-300'}`}>{openNow ? copy.open : copy.closed}</span></div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric icon={<Star className="size-5 fill-amber-300 text-amber-300" />} value={Number(restaurant.rating ?? 0).toFixed(1)} label={copy.rating} /><Metric icon={<MessageSquareText className="size-5 text-sky-300" />} value={String(restaurant.review_count ?? 0)} label={copy.reviews} /><Metric icon={<BadgeCheck className={`size-5 ${restaurant.is_verified ? 'text-emerald-300' : 'text-zinc-600'}`} />} value={restaurant.is_verified ? '✓' : '—'} label={restaurant.is_verified ? copy.verified : copy.unverified} /><Metric icon={<Settings className="size-5 text-red-400" />} value={restaurant.updated_at ? new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium' }).format(new Date(restaurant.updated_at)) : '—'} label={copy.updated} /></div>
      </header>
      <div className="mt-5 space-y-5"><RestaurantSettingsForm restaurant={restaurant} locale={locale} /><WorkingHoursForm initial={restaurant.opening_hours} /><SpecialHoursForm initial={typedSpecialHours} /></div>
    </div>
  </main>;
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="flex items-center justify-between gap-2">{icon}<strong className="truncate text-lg font-black">{value}</strong></div><p className="mt-2 truncate text-xs font-bold text-zinc-500">{label}</p></div>; }
