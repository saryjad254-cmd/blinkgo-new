import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Headphones from 'lucide-react/dist/esm/icons/headphones';
import { requireRole } from '@/lib/rbac';
import { SupportClient } from '@/components/support/SupportClient';
import { getServerTranslations } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function RestaurantSupportPage() {
  const [, { locale }] = await Promise.all([requireRole(['restaurant', 'admin', 'super_admin']), getServerTranslations()]);
  const copy = locale === 'ar' ? { back: 'لوحة المطعم', eyebrow: 'مساعدة التشغيل', title: 'دعم المطعم', sub: 'تواصل مع فريق BlinkGo وتابع كل محادثة حتى الحل.' } : locale === 'en' ? { back: 'Restaurant dashboard', eyebrow: 'Operations help', title: 'Restaurant support', sub: 'Contact the BlinkGo team and track every conversation through resolution.' } : { back: 'Restaurant-Dashboard', eyebrow: 'Betriebshilfe', title: 'Restaurant-Support', sub: 'Kontaktiere das BlinkGo-Team und verfolge jede Anfrage bis zur Lösung.' };
  return <main data-testid="restaurant-support-center" dir={locale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl">
    <Link href="/restaurant/dashboard" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-zinc-400 hover:bg-white/5 hover:text-white"><ArrowLeft className={`size-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />{copy.back}</Link>
    <header className="overflow-hidden rounded-[2rem] border border-red-500/20 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.22),transparent_42%),linear-gradient(145deg,#181818,#0c0c0c)] p-5 sm:p-7"><p className="text-xs font-black uppercase tracking-[.22em] text-amber-300">{copy.eyebrow}</p><div className="mt-2 flex items-center gap-4"><span className="grid size-14 place-items-center rounded-2xl bg-red-600 shadow-lg shadow-red-950/40"><Headphones className="size-7" /></span><div><h1 className="text-3xl font-black">{copy.title}</h1><p className="mt-1 text-sm text-zinc-400">{copy.sub}</p></div></div></header>
    <SupportClient userRole="restaurant" showTitle={false} />
  </div></main>;
}
