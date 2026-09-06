'use client';

import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Bell from 'lucide-react/dist/esm/icons/bell';
import { NotificationsFullCenter } from '@/components/notifications/NotificationsFullCenter';
import { useI18n } from '@/lib/i18n/I18nProvider';

const COPY = {
  de: { title: 'Benachrichtigungen', subtitle: 'Bestellungen, Betrieb und wichtige Kontoaktivitäten', back: 'Zurück' },
  ar: { title: 'الإشعارات', subtitle: 'الطلبات والتشغيل وأنشطة الحساب المهمة', back: 'رجوع' },
  en: { title: 'Notifications', subtitle: 'Orders, operations, and important account activity', back: 'Back' },
} as const;

export function RoleNotificationsPage({ backHref, scope }: { backHref: string; scope: 'customer' | 'driver' | 'restaurant' }) {
  const { locale } = useI18n(); const copy = COPY[locale];
  return <main data-testid={`${scope}-notifications-center`} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl">
    <Link href={backHref} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-zinc-400 hover:bg-white/5 hover:text-white"><ArrowLeft className={`size-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />{copy.back}</Link>
    <header className="mb-5 overflow-hidden rounded-[2rem] border border-red-500/20 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.22),transparent_42%),linear-gradient(145deg,#181818,#0c0c0c)] p-5 sm:p-7"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-2xl bg-red-600 shadow-lg shadow-red-950/40"><Bell className="size-7" /></span><div><h1 className="text-3xl font-black">{copy.title}</h1><p className="mt-1 text-sm text-zinc-400">{copy.subtitle}</p></div></div></header>
    <NotificationsFullCenter locale={locale} scope={scope} />
  </div></main>;
}
