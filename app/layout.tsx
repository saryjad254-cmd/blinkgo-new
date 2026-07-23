import type { Metadata, Viewport } from 'next';
import { Cairo, Inter } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { QueryProvider } from '@/components/QueryProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { I18nProvider } from '@/lib/i18n/I18nProvider';
import { CartHydrator } from '@/components/CartHydrator';
import { PushOptIn } from '@/components/notifications/PushOptIn';
import { PerformanceProvider } from '@/components/PerformanceProvider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { getServerLocale } from '@/lib/i18n/server-translations';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cairo',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
});

const METADATA_DESCRIPTION: Record<'de' | 'ar' | 'en', string> = {
  de: 'BlinkGo – Die moderne Lieferplattform für Restaurants, Kunden und Fahrer in Deutschland',
  ar: 'BlinkGo – منصة التوصيل الحديثة للمطاعم والعملاء والسائقين',
  en: 'BlinkGo – The modern delivery platform for restaurants, customers, and drivers',
};

export function generateMetadata(): Metadata {
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: 'de' | 'ar' | 'en' = getServerLocale(cookieHeader);
  return {
    title: 'BlinkGo',
    description: METADATA_DESCRIPTION[locale],
    applicationName: 'BlinkGo',
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'BlinkGo',
    },
    icons: {
      icon: [
        { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#DC2626',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const cookieValue = cookieStore.get('blinkgo-locale')?.value;
  // Also read the URL ?lang= so emails + OAuth land in the right locale
  // on the very first render (before the client picks up the cookie).
  let urlLang: string | null = null;
  try {
    const h = headers();
    const u = h.get('x-url') || h.get('referer') || '';
    if (u) {
      const idx = u.indexOf('?');
      if (idx >= 0) {
        const qs = u.slice(idx + 1);
        const lang = new URLSearchParams(qs).get('lang');
        if (lang === 'ar' || lang === 'en' || lang === 'de') urlLang = lang;
      }
    }
  } catch {}
  const locale = (urlLang || (cookieValue === 'ar' ? 'ar' : cookieValue === 'en' ? 'en' : 'de')) as 'de' | 'ar' | 'en';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} className={`${cairo.variable} ${inter.variable} dark`}>
      <head>
        <meta name="theme-color" content="#DC2626" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BlinkGo" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="192x192" href="/brand/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/brand/icon-512.png" />
        <link rel="apple-touch-icon" href="/brand/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('blinkgo-theme');var r=t==='light'?'light':t==='dark'?'dark':(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.classList.add(r);}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className={locale === 'ar' ? 'font-cairo' : 'font-inter'}>
        <ThemeProvider>
          <I18nProvider initialLocale={locale}>
            <QueryProvider>
              <CartHydrator />
              <PushOptIn />
              <PerformanceProvider />
              <ToastProvider>{children}</ToastProvider>
            </QueryProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}