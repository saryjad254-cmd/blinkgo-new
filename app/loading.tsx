import { cookies } from 'next/headers';
import { BlinkSplash } from '@/components/brand';

export default async function GlobalLoading() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get('blinkgo-locale')?.value;
  const locale: 'de' | 'ar' | 'en' = cookieValue === 'ar' ? 'ar' : cookieValue === 'en' ? 'en' : 'de';
  const message = locale === 'ar' ? 'جاري التحميل…' : locale === 'en' ? 'Loading…' : 'Wird geladen…';

  return <BlinkSplash message={message} fullScreen />;
}
