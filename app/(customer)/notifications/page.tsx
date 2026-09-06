'use client';

import { PageHeader } from '@/components/shared/PageHeader';
import { NotificationsFullCenter } from '@/components/notifications/NotificationsFullCenter';
import { useI18n } from '@/lib/i18n/I18nProvider';

const T = {
  de: { title: 'Benachrichtigungen', subtitle: 'Bleib auf dem Laufenden' },
  ar: { title: 'الإشعارات', subtitle: 'ابق على اطلاع' },
  en: { title: 'Notifications', subtitle: 'Stay up to date' },
} as const;

export default function NotificationsPage() {
  const { locale: currentLocale } = useI18n();
  const locale: 'de' | 'ar' | 'en' = currentLocale === 'ar' || currentLocale === 'en' ? currentLocale : 'de';
  const t = T[locale];

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} back backHref="/home" />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <NotificationsFullCenter locale={locale} scope="customer" />
      </div>
    </>
  );
}
