import { cookies } from 'next/headers';
import { BlinkSplash } from '@/components/brand';

export default async function GlobalLoading() {
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get('blinkgo-locale')?.value;
  const locale: 'de' | 'ar' | 'en' = cookieVal === 'ar' ? 'ar' : cookieVal === 'en' ? 'en' : 'de';
  const text =
    locale === 'ar'
      ? 'جاري التحميل...'
      : locale === 'en'
      ? 'Loading...'
      : 'Wird geladen...';

  return <BlinkSplash message={text} fullScreen />;
}
