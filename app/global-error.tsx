'use client';

/**
 * Global error boundary — the last-resort UI shown when an error escapes every
 * nested boundary (or the root layout itself fails). Because it REPLACES the
 * root layout, no provider context (including I18nProvider) is available here,
 * so the locale is read from the same `blinkgo-locale` cookie the provider uses
 * and the copy comes from the shared locale dictionaries — no hardcoded
 * per-language ternaries.
 *
 * The locale is applied after mount: this component is server-rendered too, and
 * reading document.cookie during the first render would cause a hydration
 * mismatch. The dictionaries are already part of the shared client bundle
 * (I18nProvider imports all three), so this adds no meaningful payload.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { BlinkButton, BlinkLogo } from '@/components/brand';
import de from '@/lib/i18n/locales/de';
import ar from '@/lib/i18n/locales/ar';
import en from '@/lib/i18n/locales/en';

type AppLocale = 'de' | 'ar' | 'en';
const DICTS = { de, ar, en } as const;
const DEFAULT_LOCALE: AppLocale = 'de';

function readLocaleFromCookie(): AppLocale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const m = document.cookie.match(/(?:^|;\s*)blinkgo-locale=(ar|de|en)\b/);
  return (m?.[1] as AppLocale) || DEFAULT_LOCALE;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocale(readLocaleFromCookie());
  }, []);

  useEffect(() => {
    // Keep the digest visible in production logs so the underlying failure is
    // still diagnosable — this boundary presents the error, it never hides it.
    console.error('[GlobalError]', error?.digest ? `digest=${error.digest}` : '', error);
  }, [error]);

  const t = (DICTS[locale] ?? DICTS[DEFAULT_LOCALE]).errors as Record<string, string>;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body className={`bg-bg text-text-primary ${locale === 'ar' ? 'font-cairo' : 'font-inter'}`}>
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-bg via-bg-subtle to-bg-elevated">
          <BlinkLogo size="lg" variant="mark" className="mb-6" />
          <div className="w-16 h-16 rounded-2xl bg-brand-red/15 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-brand-red" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary mb-2 text-center">
            {t.globalTitle}
          </h1>
          <p className="text-text-secondary mb-6 max-w-md text-center">
            {t.globalDescription}
          </p>
          <BlinkButton variant="primary" size="lg" icon={<RefreshCw className="w-5 h-5" />} onClick={reset}>
            {t.retry}
          </BlinkButton>
        </div>
      </body>
    </html>
  );
}
