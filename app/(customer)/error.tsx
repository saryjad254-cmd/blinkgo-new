'use client';

import { useEffect } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import { BlinkButton } from '@/components/brand';
import Home from 'lucide-react/dist/esm/icons/home';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/I18nProvider';

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = locale === 'ar'
    ? { title: 'تعذر تحميل الصفحة', description: 'حدث خطأ غير متوقع. بياناتك محفوظة ويمكنك المحاولة مجددًا.', retry: 'حاول مجددًا', home: 'العودة للرئيسية' }
    : locale === 'de'
      ? { title: 'Seite konnte nicht geladen werden', description: 'Ein unerwarteter Fehler ist aufgetreten. Deine Daten sind sicher.', retry: 'Erneut versuchen', home: 'Zur Startseite' }
      : { title: 'Page could not be loaded', description: 'Something unexpected happened. Your data is safe and you can try again.', retry: 'Try again', home: 'Back to home' };
  useEffect(() => {
    console.error('[CustomerError]', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-red/15 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-brand-red" />
      </div>
      <h2 className="text-xl font-extrabold text-text-primary mb-2">{copy.title}</h2>
      <p className="text-text-secondary mb-6 max-w-md">{copy.description}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <BlinkButton variant="primary" onClick={reset} icon={<RefreshCw className="w-4 h-4" />}>
          {copy.retry}
        </BlinkButton>
        <BlinkButton variant="secondary" onClick={() => router.push('/home')} icon={<Home className="w-4 h-4" />}>
          {copy.home}
        </BlinkButton>
      </div>
    </div>
  );
}
