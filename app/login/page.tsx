import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';
import type { Locale } from '@/lib/i18n/server-translations';
import { Logo } from '@/components/ui/Logo';
import { AuthVisualPanel } from '@/components/auth/AuthVisualPanel';

const COPY: Record<Locale, { title: string; subtitle: string }> = {
  de: {
    title: 'Willkommen bei BlinkGo',
    subtitle: 'Melde dich an — wir leiten dich automatisch zum richtigen Bereich',
  },
  ar: {
    title: 'مرحباً بك في BlinkGo',
    subtitle: 'سجّل دخولك — سنوجهك تلقائياً إلى القسم المناسب',
  },
  en: {
    title: 'Welcome to BlinkGo',
    subtitle: 'Sign in — we will route you to the right area automatically',
  },
};

export const dynamic = 'force-dynamic';

function safeLang(s: string | string[] | undefined): Locale {
  const v = Array.isArray(s) ? s[0] : s;
  if (v === 'ar' || v === 'en') return v;
  return 'de';
}

export default function UnifiedLoginPage({
  searchParams,
}: {
  searchParams?: { lang?: string | string[]; error?: string | string[]; next?: string | string[] };
}) {
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const fromCookie = getServerLocale(cookieHeader);
  // Priority: URL ?lang= > cookie. This makes `?lang=ar` in the URL
  // (e.g. from an email link) land in Arabic on the very first render.
  const urlLang = searchParams?.lang;
  const urlLocale = Array.isArray(urlLang) ? urlLang[0] : urlLang;
  const locale: Locale = (urlLocale === 'ar' || urlLocale === 'en')
    ? urlLocale
    : fromCookie;
  const t = COPY[locale] ?? COPY.de;

  return (
    <div
      className="min-h-screen bg-bg flex flex-col lg:flex-row"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Left side — visual panel (hidden on mobile) */}
      <aside className="hidden lg:flex lg:w-1/2 xl:w-2/5 relative overflow-hidden bg-bg-elevated">
        <AuthVisualPanel locale={locale} />
      </aside>

      {/* Right side — form */}
      <main className="flex-1 flex flex-col items-center justify-center py-8 px-5 sm:px-8 relative">
        {/* Mobile logo */}
        <div className="lg:hidden mb-6">
          <Logo size="md" variant="full" />
        </div>

        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-7 text-center lg:text-left">
            <h1 className="text-2xl sm:text-3xl font-black text-text leading-tight tracking-tight">
              {t.title}
            </h1>
            <p className="text-sm text-text-secondary mt-2 leading-relaxed">
              {t.subtitle}
            </p>
          </div>

          {/* Login form */}
          <Suspense
            fallback={
              <div className="w-full py-12 text-center text-text-muted text-sm">
                <div className="inline-block w-8 h-8 border-2 border-brand-red-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>

          {/* Footer */}
          <p className="text-center text-xs text-text-muted mt-8">
            © {new Date().getFullYear()} BlinkGo · Made with{' '}
            <span className="text-brand-red-500">♥</span> in Berlin
          </p>
          <nav aria-label="Rechtliche Hinweise" className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
            <a href="/legal/impressum" className="hover:text-brand-red-500 underline-offset-2 hover:underline">Impressum</a>
            <span aria-hidden>·</span>
            <a href="/legal/datenschutz" className="hover:text-brand-red-500 underline-offset-2 hover:underline">Datenschutz</a>
            <span aria-hidden>·</span>
            <a href="/legal/agb" className="hover:text-brand-red-500 underline-offset-2 hover:underline">AGB</a>
            <span aria-hidden>·</span>
            <a href="/legal/widerruf" className="hover:text-brand-red-500 underline-offset-2 hover:underline">Widerruf</a>
            <span aria-hidden>·</span>
            <a href="/legal/cookies" className="hover:text-brand-red-500 underline-offset-2 hover:underline">Cookies</a>
          </nav>
        </div>
      </main>
    </div>
  );
}
