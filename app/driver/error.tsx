'use client';

import { useEffect } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import { BlinkButton } from '@/components/brand';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';

const COPY = {
  de: { title: 'Fahrerbereich konnte nicht geladen werden', body: 'Die Verbindung wurde unterbrochen oder die Daten sind vorübergehend nicht verfügbar.', retry: 'Erneut versuchen', home: 'Zur Fahrerkarte' },
  ar: { title: 'تعذّر تحميل قسم السائق', body: 'انقطع الاتصال أو أن البيانات غير متاحة مؤقتاً.', retry: 'إعادة المحاولة', home: 'العودة إلى خريطة السائق' },
  en: { title: 'Driver area could not be loaded', body: 'The connection was interrupted or the data is temporarily unavailable.', retry: 'Try again', home: 'Back to driver map' },
} as const;

export default function DriverError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  useEffect(() => { console.error('[DriverError]', error); }, [error]);
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="w-16 h-16 rounded-2xl bg-brand-red/15 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-brand-red" />
      </div>
      <h2 className="text-xl font-extrabold text-text-primary mb-2">{copy.title}</h2>
      <p className="text-text-secondary mb-6 max-w-md">{copy.body}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <BlinkButton variant="primary" onClick={reset} icon={<RefreshCw className="w-4 h-4" />}>
          {copy.retry}
        </BlinkButton>
        <Link href="/driver/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-edge px-5 text-sm font-extrabold text-text hover:bg-bg-elevated">
          {copy.home}
        </Link>
      </div>
    </div>
  );
}
