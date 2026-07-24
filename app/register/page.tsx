'use client';

import { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, User, ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/api/error-helper';

const COPY: Record<string, any> = {
  de: {
    title: 'Konto erstellen',
    subtitle: 'Werde Teil von BlinkGo und bestelle in Sekunden',
    name: 'Name *',
    namePh: 'Vor- und Nachname',
    email: 'E-Mail *',
    emailPh: 'deine@email.de',
    phone: 'Telefon (optional)',
    phonePh: '+49 176 ...',
    password: 'Passwort *',
    passwordPh: 'Mindestens 8 Zeichen',
    confirmPassword: 'Passwort bestätigen *',
    confirmPasswordPh: 'Passwort wiederholen',
    submit: 'Konto erstellen',
    loading: 'Wird erstellt…',
    haveAccount: 'Schon ein Konto?',
    login: 'Anmelden',
    back: '← Zurück zum Login',
    errRequired: 'Bitte alle Pflichtfelder ausfüllen',
    errShortPwd: 'Passwort muss mindestens 8 Zeichen haben',
    errMismatch: 'Passwörter stimmen nicht überein',
    errInvalidEmail: 'Bitte gültige E-Mail eingeben',
    errFailed: 'Registrierung fehlgeschlagen',
    success: 'Konto erstellt! Wir leiten dich zur Code-Eingabe weiter…',
  },
  ar: {
    title: 'إنشاء حساب',
    subtitle: 'انضم لـ BlinkGo واطلب في ثوان',
    name: 'الاسم *',
    namePh: 'الاسم الكامل',
    email: 'البريد الإلكتروني *',
    emailPh: 'بريدك@email.com',
    phone: 'الهاتف (اختياري)',
    phonePh: '+964 770 ...',
    password: 'كلمة المرور *',
    passwordPh: '٨ أحرف على الأقل',
    confirmPassword: 'تأكيد كلمة المرور *',
    confirmPasswordPh: 'أعد كلمة المرور',
    submit: 'إنشاء الحساب',
    loading: 'جاري الإنشاء…',
    haveAccount: 'عندك حساب؟',
    login: 'تسجيل الدخول',
    back: '→ العودة إلى تسجيل الدخول',
    errRequired: 'يرجى ملء جميع الحقول المطلوبة',
    errShortPwd: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
    errMismatch: 'كلمات المرور غير متطابقة',
    errInvalidEmail: 'يرجى إدخال بريد إلكتروني صالح',
    errFailed: 'فشل التسجيل',
    success: 'تم إنشاء الحساب! سنوجهك لإدخال رمز التأكيد…',
  },
  en: {
    title: 'Create account',
    subtitle: 'Join BlinkGo and order in seconds',
    name: 'Name *',
    namePh: 'First and last name',
    email: 'Email *',
    emailPh: 'your@email.com',
    phone: 'Phone (optional)',
    phonePh: '+1 555 ...',
    password: 'Password *',
    passwordPh: 'At least 8 characters',
    confirmPassword: 'Confirm password *',
    confirmPasswordPh: 'Repeat password',
    submit: 'Create account',
    loading: 'Creating…',
    haveAccount: 'Already have an account?',
    login: 'Sign in',
    back: '→ Back to login',
    errRequired: 'Please fill all required fields',
    errShortPwd: 'Password must be at least 8 characters',
    errMismatch: 'Passwords do not match',
    errInvalidEmail: 'Please enter a valid email',
    errFailed: 'Registration failed',
    success: 'Account created! Taking you to the verification step…',
  },
};

function RegisterFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, setLocale } = useI18n();
  const t = COPY[locale] ?? COPY.de;

  // Re-sync locale if the URL has ?lang= (emails + OAuth land here)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlLang = searchParams.get('lang');
    if ((urlLang === 'ar' || urlLang === 'en' || urlLang === 'de') && urlLang !== locale) {
      setLocale(urlLang);
    }
  }, [searchParams, locale, setLocale]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password || !confirmPassword) {
      setError(t.errRequired);
      return;
    }
    if (!emailValid) {
      setError(t.errInvalidEmail);
      return;
    }
    if (password.length < 8) {
      setError(t.errShortPwd);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.errMismatch);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password, role: 'customer' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(extractErrorMessage(data, t.errFailed));
      }
      setSuccess(true);
      // Auto-redirect to the OTP verification page (production-grade flow)
      // Email is passed via query param so the verify page can pre-fill it
      const target = `/auth/verify?email=${encodeURIComponent(email)}`;
      setTimeout(() => router.push(target), 700);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-bg flex items-center justify-center py-12 px-4"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 group">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-brand-yellow via-brand-yellow-hover to-brand-yellow-active flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(245,184,25,0.5)] transition-transform group-hover:scale-105 overflow-hidden">
            <div className="absolute top-0 start-0 w-full h-0.5 bg-brand-red/40" />
            <div className="absolute top-1/2 start-0 w-full h-0.5 bg-brand-red/30" />
            <span className="font-black italic text-brand-black text-sm">B</span>
          </div>
          <span className="font-extrabold text-xl text-white">BlinkGo</span>
        </Link>

        <div className="rounded-3xl bg-surface-elevated border border-edge overflow-hidden">
          <div className="h-1.5 bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active" />
          <div className="p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1">{t.title}</h1>
            <p className="text-sm text-text-secondary mb-6">{t.subtitle}</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2 animate-fade-in">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-400">{t.success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                  {t.name}
                </label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                    className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                    placeholder={t.namePh}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                  {t.email}
                </label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                    className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted caret-brand-500 focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                    placeholder={t.emailPh}
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                  {t.phone}
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                    className="w-full px-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted caret-brand-500 focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                    placeholder={t.phonePh}
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                  {t.password}
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                  {t.confirmPassword}
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                    className="w-full ps-10 pe-3 py-3 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                    placeholder={t.confirmPasswordPh}
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
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" strokeWidth={2.5} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-text-secondary">
          <p>
            {t.haveAccount}{' '}
            <Link href="/login" className="text-brand-red-500 hover:text-brand-red-400 font-extrabold">
              {t.login}
            </Link>
          </p>
          <p className="mt-3 text-xs text-text-muted">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 font-bold text-text-secondary hover:text-brand-red-500 transition-colors underline-offset-4 hover:underline"
            >
              {t.back}
            </Link>
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
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RegisterFormInner />
    </Suspense>
  );
}
