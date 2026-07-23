'use client';

import { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Loader2, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, KeyRound, Sparkles, ShieldCheck } from 'lucide-react';

const COPY = {
  de: {
    title: 'Neues Passwort setzen',
    subtitle: 'Wähle ein sicheres Passwort für dein Konto.',
    password: 'Neues Passwort',
    passwordPh: 'Mindestens 8 Zeichen',
    confirm: 'Passwort bestätigen',
    confirmPh: 'Passwort wiederholen',
    submit: 'Passwort speichern',
    loading: 'Wird gespeichert…',
    success: 'Passwort aktualisiert!',
    successDesc: 'Dein Passwort wurde erfolgreich geändert. Du wirst gleich weitergeleitet…',
    backToLogin: '← Zurück zur Anmeldung',
    errRequired: 'Bitte alle Felder ausfüllen',
    errMismatch: 'Passwörter stimmen nicht überein',
    errWeak: 'Passwort muss mindestens 8 Zeichen haben',
    errToken: 'Der Reset-Link ist ungültig oder abgelaufen.',
    errTokenExpired: 'Der Reset-Link ist abgelaufen. Bitte fordere einen neuen an.',
    errTokenUsed: 'Dieser Reset-Link wurde bereits verwendet.',
    expired: 'Abgelaufen',
  },
  ar: {
    title: 'تعيين كلمة مرور جديدة',
    subtitle: 'اختر كلمة مرور قوية لحسابك.',
    password: 'كلمة المرور الجديدة',
    passwordPh: '٨ أحرف على الأقل',
    confirm: 'تأكيد كلمة المرور',
    confirmPh: 'أعد إدخال كلمة المرور',
    submit: 'حفظ كلمة المرور',
    loading: 'جاري الحفظ…',
    success: 'تم تحديث كلمة المرور!',
    successDesc: 'تم تغيير كلمة مرورك بنجاح. سيتم توجيهك الآن…',
    backToLogin: '→ العودة لتسجيل الدخول',
    errRequired: 'يرجى ملء جميع الحقول',
    errMismatch: 'كلمات المرور غير متطابقة',
    errWeak: 'يجب أن تكون ٨ أحرف على الأقل',
    errToken: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية.',
    errTokenExpired: 'انتهت صلاحية الرابط. اطلب رابطاً جديداً.',
    errTokenUsed: 'تم استخدام هذا الرابط بالفعل.',
    expired: 'منتهي الصلاحية',
  },
  en: {
    title: 'Set a new password',
    subtitle: 'Choose a strong password for your account.',
    password: 'New password',
    passwordPh: 'At least 8 characters',
    confirm: 'Confirm password',
    confirmPh: 'Repeat password',
    submit: 'Save password',
    loading: 'Saving…',
    success: 'Password updated!',
    successDesc: 'Your password has been changed. You will be redirected shortly…',
    backToLogin: '← Back to login',
    errRequired: 'Please fill all fields',
    errMismatch: 'Passwords do not match',
    errWeak: 'Password must be at least 8 characters',
    errToken: 'The reset link is invalid or has expired.',
    errTokenExpired: 'The reset link has expired. Please request a new one.',
    errTokenUsed: 'This reset link has already been used.',
    expired: 'Expired',
  },
};

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'de';
    // 1) URL ?lang= (emails + OAuth land here)
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    if (urlLang === 'ar' || urlLang === 'en' || urlLang === 'de') return urlLang;
    // 2) Cookie
    const cookie = document.cookie.split('; ').find((c) => c.startsWith('blinkgo-locale='));
    const v = cookie?.split('=')[1];
    if (v === 'ar' || v === 'en' || v === 'de') return v;
    // 3) Browser language
    const browserLocale = navigator.language?.slice(0, 2);
    if (browserLocale === 'ar' || browserLocale === 'en') return browserLocale;
    return 'de';
  });
  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight;
  const ArrowBack = dir === 'rtl' ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 1) URL ?lang= (emails + OAuth land here)
    const urlLang = searchParams.get('lang');
    if (urlLang === 'ar' || urlLang === 'en' || urlLang === 'de') {
      if (urlLang !== locale) {
        setLocale(urlLang);
        document.cookie = `blinkgo-locale=${urlLang};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
        try { localStorage.setItem('blinkgo-locale', urlLang); } catch {}
      }
      return;
    }
    // 2) Cookie (only if state not already set from URL)
    const cookie = document.cookie.split('; ').find((c) => c.startsWith('blinkgo-locale='));
    const v = cookie?.split('=')[1];
    if ((v === 'ar' || v === 'en' || v === 'de') && v !== locale) {
      setLocale(v);
    } else if (!v) {
      // 3) Browser fallback
      const browserLocale = navigator.language?.slice(0, 2);
      if (browserLocale === 'ar' || browserLocale === 'en') setLocale(browserLocale);
    }
  }, [searchParams, locale]);

  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Token presence check on mount
  const tokenInvalid = !token || !email;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password || !confirm) { setError(t.errRequired); return; }
    if (password.length < 8) { setError(t.errWeak); return; }
    if (password !== confirm) { setError(t.errMismatch); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const code = data?.error?.code;
        if (code === 'TOKEN_EXPIRED') setError(t.errTokenExpired);
        else if (code === 'TOKEN_USED') setError(t.errTokenUsed);
        else if (code === 'INVALID_TOKEN') setError(t.errToken);
        else setError(data?.error?.message || t.errToken);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/login?reset=1'), 1800);
    } catch (e: any) {
      setError(e?.message || t.errToken);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden" dir={dir}>
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
            </div>
          ) : tokenInvalid ? (
            <div className="text-center py-6">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-danger/20 blur-xl" />
                <div className="relative w-full h-full rounded-full bg-danger/10 border-2 border-danger/30 flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-danger" strokeWidth={2.5} />
                </div>
              </div>
              <h1 className="text-2xl font-extrabold text-text mb-2">{t.errToken}</h1>
              <p className="text-text-secondary text-sm mb-6">{t.expired}</p>
              <Link
                href="/forgot-password"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-3xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white font-extrabold text-sm shadow-glow hover:shadow-glow-strong transition-all"
              >
                {locale === 'ar' ? 'طلب رابط جديد' : locale === 'en' ? 'Request new link' : 'Neuen Link anfordern'}
                <Arrow className="w-4 h-4 rtl:rotate-180" strokeWidth={2.5} />
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full bg-brand-red-500/20 blur-xl" />
                  <div className="relative w-full h-full rounded-full bg-brand-red-500/10 border-2 border-brand-red-500/30 flex items-center justify-center">
                    <ShieldCheck className="w-8 h-8 text-brand-red-500" strokeWidth={2} />
                  </div>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-text mb-2">{t.title}</h1>
                <p className="text-text-secondary text-sm">{t.subtitle}</p>
              </div>

              {error && (
                <div role="alert" className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 flex items-start gap-2 animate-slide-in">
                  <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-danger font-semibold flex-1">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                    {t.password}
                  </label>
                  <div className="relative">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      required
                      autoComplete="new-password"
                      style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                      className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                      placeholder={t.passwordPh}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                    {t.confirm}
                  </label>
                  <div className="relative">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                      required
                      autoComplete="new-password"
                      style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                      className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                      placeholder={t.confirmPh}
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
                      <Arrow className="w-4 h-4 rtl:rotate-180" strokeWidth={2.5} />
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-red-500 animate-spin" />
      </div>
    }>
      <ResetPasswordInner />
    </Suspense>
  );
}
