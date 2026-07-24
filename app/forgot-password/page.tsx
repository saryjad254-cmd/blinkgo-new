'use client';

import { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Loader2, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, KeyRound, Sparkles } from 'lucide-react';

const COPY = {
  de: {
    title: 'Passwort vergessen?',
    subtitle: 'Gib deine E-Mail ein. Wir senden dir einen Link zum Zurücksetzen.',
    email: 'E-Mail',
    emailPh: 'deine@email.de',
    submit: 'Reset-Link senden',
    loading: 'Wird gesendet…',
    success: 'E-Mail gesendet!',
    successDesc: 'Wenn ein Konto mit dieser E-Mail existiert, haben wir einen Reset-Link gesendet. Schau in dein Postfach (und den Spam-Ordner).',
    backToLogin: '← Zurück zur Anmeldung',
    errRequired: 'Bitte E-Mail eingeben',
    errInvalid: 'Bitte gültige E-Mail eingeben',
    devHint: 'Dev-Modus: Reset-Link wird in der Konsole angezeigt',
  },
  ar: {
    title: 'نسيت كلمة المرور؟',
    subtitle: 'أدخل بريدك الإلكتروني. سنرسل لك رابطاً لإعادة التعيين.',
    email: 'البريد الإلكتروني',
    emailPh: 'بريدك@email.com',
    submit: 'إرسال رابط إعادة التعيين',
    loading: 'جاري الإرسال…',
    success: 'تم إرسال الرسالة!',
    successDesc: 'إذا كان هناك حساب بهذا البريد، أرسلنا رابط إعادة التعيين. تحقق من بريدك (ومجلد السبام).',
    backToLogin: '→ العودة لتسجيل الدخول',
    errRequired: 'يرجى إدخال البريد الإلكتروني',
    errInvalid: 'يرجى إدخال بريد صالح',
    devHint: 'وضع التطوير: رابط إعادة التعيين يظهر في الكونسول',
  },
  en: {
    title: 'Forgot your password?',
    subtitle: "Enter your email and we'll send you a link to reset it.",
    email: 'Email',
    emailPh: 'your@email.com',
    submit: 'Send reset link',
    loading: 'Sending…',
    success: 'Email sent!',
    successDesc: "If an account exists for that email, we've sent a reset link. Check your inbox (and spam folder).",
    backToLogin: '← Back to login',
    errRequired: 'Please enter your email',
    errInvalid: 'Please enter a valid email',
    devHint: 'Dev mode: reset link shown in console',
  },
};

function ForgotPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>(() => {
    if (typeof window !== 'undefined') {
      // 1) URL ?lang=xx (highest priority — emails + OAuth land here)
      const urlLang = new URLSearchParams(window.location.search).get('lang');
      if (urlLang === 'ar' || urlLang === 'en' || urlLang === 'de') {
        return urlLang;
      }
      // 2) Cookie
      const cookie = document.cookie.split('; ').find((c) => c.startsWith('blinkgo-locale='));
      const v = cookie?.split('=')[1];
      if (v === 'ar' || v === 'en' || v === 'de') return v;
      // 3) Browser language
      const browserLocale = navigator.language?.slice(0, 2);
      if (browserLocale === 'ar' || browserLocale === 'en') return browserLocale;
    }
    return 'de';
  });

  // Re-sync locale if the URL changes (e.g. user lands on /?lang=ar from email)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlLang = searchParams.get('lang');
    if (urlLang === 'ar' || urlLang === 'en' || urlLang === 'de') {
      if (urlLang !== locale) {
        setLocale(urlLang);
        // Persist immediately so the cookie matches what the page renders in
        document.cookie = `blinkgo-locale=${urlLang};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
        try { localStorage.setItem('blinkgo-locale', urlLang); } catch {}
      }
    }
  }, [searchParams, locale]);
  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight;
  const initialEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) { setError(t.errRequired); return; }
    if (!emailValid) { setError(t.errInvalid); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        // Even on error, the route should always return ok to avoid leaking
        // whether the email is registered. But we surface the error if any.
        setError(data?.error?.message || 'Reset failed');
        return;
      }
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden" dir={dir}>
      {/* Premium background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-brand-red-500/15 blur-[120px]" />
        <div className="absolute bottom-0 end-0 w-[500px] h-[500px] rounded-full bg-brand-yellow-500/10 blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><path d='M0 30 L60 30 M30 0 L30 60' stroke='%23F5B819' stroke-width='0.5'/></svg>")`,
        }} />
      </div>
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-red-600 via-accent-500 to-brand-red-600 z-50" />

      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-red-500 to-brand-yellow-500 flex items-center justify-center shadow-speed-md group-hover:scale-105 transition-transform">
            <span className="text-white font-extrabold text-lg">B</span>
          </div>
          <span className="font-black italic uppercase tracking-tighter text-text text-lg">
            <span className="text-text">Blink</span>
            <span className="text-brand-red-500">Go</span>
          </span>
        </Link>

        <div className="w-full max-w-md card-glass p-6 sm:p-8">
          {success ? (
            <div className="text-center py-6 animate-fade-in">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-success/20 blur-xl" />
                <div className="relative w-full h-full rounded-full bg-success/10 border-2 border-success/30 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-success" strokeWidth={2.5} />
                </div>
              </div>
              <h1 className="text-2xl font-extrabold text-text mb-2">{t.success}</h1>
              <p className="text-text-secondary text-sm leading-relaxed">{t.successDesc}</p>

              <div className="mt-6 p-3 rounded-xl bg-warning/10 border border-warning/30">
                <p className="text-xs text-warning font-bold">
                  {locale === 'ar' ? '⏱️' : locale === 'en' ? '⏱️' : '⏱️'} {locale === 'ar' ? 'الرابط صالح لمدة 30 دقيقة' : locale === 'en' ? 'The link is valid for 30 minutes' : 'Der Link ist 30 Minuten gültig'}
                </p>
              </div>

              <Link
                href="/login"
                className="inline-flex items-center gap-1 mt-6 text-sm text-text-muted hover:text-text transition-colors"
              >
                {t.backToLogin}
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full bg-brand-red-500/20 blur-xl" />
                  <div className="relative w-full h-full rounded-full bg-brand-red-500/10 border-2 border-brand-red-500/30 flex items-center justify-center">
                    <KeyRound className="w-8 h-8 text-brand" strokeWidth={2} />
                  </div>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-text mb-2">{t.title}</h1>
                <p className="text-text-secondary text-sm leading-relaxed">{t.subtitle}</p>
              </div>

              {error && (
                <div role="alert" className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 flex items-start gap-2 animate-slide-in">
                  <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-danger font-semibold flex-1">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                    {t.email}
                  </label>
                  <div className="relative">
                    <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null); }}
                      required
                      style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                      className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted caret-brand-500 focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                      placeholder={t.emailPh}
                      dir="ltr"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full h-12 rounded-3xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white font-extrabold shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="opacity-80">{t.loading}</span>
                    </>
                  ) : (
                    <>
                      {t.submit}
                      {/* FIX (v91): the icon is already direction-aware (see the
                          `Arrow` selection above), so the extra rtl:rotate-180
                          flipped it a second time and pointed it the wrong way. */}
                      <Arrow className="w-4 h-4" strokeWidth={2.5} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text transition-colors"
                >
                  {t.backToLogin}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-red-500 animate-spin" />
      </div>
    }>
      <ForgotPasswordInner />
    </Suspense>
  );
}
