/**
 * OAuth Error Page
 * Catches OAuth errors from Supabase and shows a friendly message.
 * URL: /auth/oauth-error?error=xxx&provider=google
 */

import Link from 'next/link';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

const ERROR_MESSAGES: Record<string, Record<string, { title: string; body: string; cta: string }>> = {
  de: {
    provider_disabled: {
      title: 'Anmeldemethode nicht verfügbar',
      body: 'Diese Anmeldemethode ist derzeit nicht verfügbar. Bitte verwende eine andere Methode wie E-Mail und Passwort oder Magic Link.',
      cta: 'Andere Methode verwenden',
    },
    access_denied: {
      title: 'Zugriff verweigert',
      body: 'Du hast die Anmeldung abgebrochen. Versuche es erneut oder verwende eine andere Methode.',
      cta: 'Erneut versuchen',
    },
    exchange_failed: {
      title: 'Anmeldung fehlgeschlagen',
      body: 'Die Verbindung mit dem Anbieter ist fehlgeschlagen. Bitte versuche es erneut.',
      cta: 'Erneut versuchen',
    },
    no_code: {
      title: 'Ungültige Anfrage',
      body: 'Die Anfrage war unvollständig. Bitte versuche es erneut.',
      cta: 'Erneut versuchen',
    },
    default: {
      title: 'Anmeldung fehlgeschlagen',
      body: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut oder kontaktiere den Support.',
      cta: 'Zur Anmeldung',
    },
  },
  ar: {
    provider_disabled: {
      title: 'طريقة تسجيل الدخول غير متاحة',
      body: 'طريقة تسجيل الدخول هذه غير متاحة حالياً. يرجى استخدام طريقة أخرى مثل البريد وكلمة المرور أو الرابط السحري.',
      cta: 'استخدام طريقة أخرى',
    },
    access_denied: {
      title: 'تم رفض الوصول',
      body: 'لقد ألغيت تسجيل الدخول. حاول مرة أخرى أو استخدم طريقة أخرى.',
      cta: 'حاول مرة أخرى',
    },
    exchange_failed: {
      title: 'فشل تسجيل الدخول',
      body: 'فشل الاتصال بمزود الخدمة. يرجى المحاولة مرة أخرى.',
      cta: 'حاول مرة أخرى',
    },
    no_code: {
      title: 'طلب غير صالح',
      body: 'الطلب غير مكتمل. يرجى المحاولة مرة أخرى.',
      cta: 'حاول مرة أخرى',
    },
    default: {
      title: 'فشل تسجيل الدخول',
      body: 'حدث خطأ. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.',
      cta: 'العودة إلى تسجيل الدخول',
    },
  },
  en: {
    provider_disabled: {
      title: 'Sign-in method unavailable',
      body: 'This sign-in method is currently not available. Please use another method like email + password or magic link.',
      cta: 'Use another method',
    },
    access_denied: {
      title: 'Access denied',
      body: 'You cancelled the sign-in. Please try again or use a different method.',
      cta: 'Try again',
    },
    exchange_failed: {
      title: 'Sign-in failed',
      body: 'Could not connect to the provider. Please try again.',
      cta: 'Try again',
    },
    no_code: {
      title: 'Invalid request',
      body: 'The request was incomplete. Please try again.',
      cta: 'Try again',
    },
    default: {
      title: 'Sign-in failed',
      body: 'An error occurred. Please try again or contact support.',
      cta: 'Back to sign-in',
    },
  },
};

export const dynamic = 'force-dynamic';

export default function OAuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string; provider?: string; description?: string };
}) {
  const cookieStore = cookies();
  const localeCookie = cookieStore.get('blinkgo-locale')?.value;
  const locale: 'de' | 'ar' | 'en' = (localeCookie === 'ar' || localeCookie === 'en' || localeCookie === 'de') ? localeCookie : 'de';
  const messages = ERROR_MESSAGES[locale] || ERROR_MESSAGES.de;
  const errorKey = searchParams.error || 'default';
  const m = messages[errorKey] || messages.default;
  const provider = searchParams.provider || '';
  const isRtl = locale === 'ar';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-md w-full card-glass p-8 text-center">
        {/* Error icon */}
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 rounded-2xl bg-danger/20 blur-xl" />
          <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-danger/20 to-warning/10 border border-danger/30 flex items-center justify-center">
            <svg className="w-9 h-9 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>

        <h1 className="text-xl font-extrabold text-text mb-2">{m.title}</h1>
        <p className="text-sm text-text-secondary mb-6 leading-relaxed">{m.body}</p>

        {provider && (
          <p className="text-xs text-text-muted mb-4">
            Provider: <span className="font-mono font-bold">{provider}</span>
          </p>
        )}

        {searchParams.description && (
          <details className="text-start text-xs text-text-muted mb-6 p-3 rounded-lg bg-bg-elevated border border-edge">
            <summary className="cursor-pointer font-semibold">Details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-[10px]">{searchParams.description}</pre>
          </details>
        )}

        <div className="space-y-2">
          <Link
            href="/login"
            className="btn-primary w-full h-12 text-sm font-bold inline-flex items-center justify-center"
          >
            {m.cta}
          </Link>
          <Link
            href="/"
            className="btn-secondary w-full h-12 text-sm font-bold inline-flex items-center justify-center"
          >
            {locale === 'ar' ? 'الصفحة الرئيسية' : locale === 'en' ? 'Home' : 'Startseite'}
          </Link>
        </div>
      </div>
    </div>
  );
}
