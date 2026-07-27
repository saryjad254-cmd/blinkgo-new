import { cookies } from 'next/headers';
import { PageHeader } from '@/components/shared/PageHeader';
import { NotificationsFullCenter } from '@/components/notifications/NotificationsFullCenter';

export const dynamic = 'force-dynamic';

const T = {
  de: { title: 'Benachrichtigungen', subtitle: 'Bleib auf dem Laufenden' },
  ar: { title: 'الإشعارات', subtitle: 'ابق على اطلاع' },
  en: { title: 'Notifications', subtitle: 'Stay up to date' },
} as const;

function detectLocale(): 'de' | 'ar' | 'en' {
  const c = cookies().get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

export default function NotificationsPage() {
  const locale = detectLocale();
  const t = T[locale];

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} back />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <NotificationsFullCenter locale={locale} />
      </div>
    </>
  );
}
