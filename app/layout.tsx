import type { Metadata, Viewport } from 'next';
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
import { CookieConsentBanner } from '@/components/privacy/CookieConsentBanner';
import { AppBootCoordinator } from '@/components/startup/AppBootCoordinator';
import { PwaLifecycle } from '@/components/pwa/PwaLifecycle';
import { OfflineBanner } from '@/components/shared/OfflineBanner';

const METADATA_DESCRIPTION: Record<'de' | 'ar' | 'en', string> = {
  de: 'BlinkGo – Die moderne Lieferplattform für Restaurants, Kunden und Fahrer in Deutschland',
  ar: 'BlinkGo – منصة التوصيل الحديثة للمطاعم والعملاء والسائقين',
  en: 'BlinkGo – The modern delivery platform for restaurants, customers, and drivers',
};

function safeHttpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: 'de' | 'ar' | 'en' = getServerLocale(cookieHeader);
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'localhost:3000';
  const protocol = requestHeaders.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImageUrl = new URL('/brand/blinkgo-og.png', metadataBase).toString();
  return {
    metadataBase,
    title: 'BlinkGo',
    description: METADATA_DESCRIPTION[locale],
    applicationName: 'BlinkGo',
    openGraph: {
      title: 'BlinkGo',
      description: METADATA_DESCRIPTION[locale],
      type: 'website',
      images: [{ url: socialImageUrl, width: 1536, height: 1024, alt: 'BlinkGo delivery courier' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'BlinkGo',
      description: METADATA_DESCRIPTION[locale],
      images: [socialImageUrl],
    },
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'BlinkGo',
    },
    icons: {
      icon: [
        { url: '/brand/blinkgo-app-icon-192-v2.png', sizes: '192x192', type: 'image/png' },
        { url: '/brand/blinkgo-app-icon-512-v2.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/brand/blinkgo-app-icon-192-v2.png', sizes: '192x192', type: 'image/png' },
        { url: '/brand/blinkgo-app-icon-512-v2.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#E10600',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default async function RootLayout(
  {
    children,
  }: {
    children: React.ReactNode;
  }
) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get('blinkgo-locale')?.value;
  // Also read the URL ?lang= so emails + OAuth land in the right locale
  // on the very first render (before the client picks up the cookie).
  let urlLang: string | null = null;
  try {
    const h = await headers();
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
  const supabaseOrigin = safeHttpOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#E10600" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BlinkGo" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="192x192" href="/brand/blinkgo-app-icon-192-v2.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/brand/blinkgo-app-icon-512-v2.png" />
        <link rel="apple-touch-icon" href="/brand/blinkgo-app-icon-192-v2.png" />
        {/* PERF: preconnect/dns-prefetch — warms the DNS + TLS handshake for
            the third-party origins the app hits on first paint. Without this
            the very first Supabase / Stripe / Maps request pays the full
            DNS+TCP+TLS latency (~300-500 ms on cold 3G). crossOrigin is
            required on preconnect whenever the connection will be used for
            CORS (Supabase REST, Stripe.js). */}
        {supabaseOrigin && <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />}
        <link rel="dns-prefetch" href="https://resend.com" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('blinkgo-theme');var r=t==='light'?'light':t==='dark'?'dark':(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.classList.add(r);}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className={locale === 'ar' ? 'font-ibm-plex-arabic' : 'font-ibm-plex'}>
        <ThemeProvider>
          <I18nProvider initialLocale={locale}>
            <QueryProvider>
              <CartHydrator />
              <PushOptIn />
              <PerformanceProvider />
              <PwaLifecycle />
              <OfflineBanner />
              <ToastProvider>
                <AppBootCoordinator locale={locale}>
                  {children}
                  <CookieConsentBanner />
                </AppBootCoordinator>
              </ToastProvider>
            </QueryProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
