'use client';

import { FormEvent, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Apple from 'lucide-react/dist/esm/icons/apple';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Bike from 'lucide-react/dist/esm/icons/bike';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import Eye from 'lucide-react/dist/esm/icons/eye';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off';
import Globe2 from 'lucide-react/dist/esm/icons/globe-2';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import LockKeyhole from 'lucide-react/dist/esm/icons/lock-keyhole';
import Mail from 'lucide-react/dist/esm/icons/mail';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import Store from 'lucide-react/dist/esm/icons/store';
import UserRound from 'lucide-react/dist/esm/icons/user-round';
import { AuthAlert } from '@/components/auth/AuthShell';
import { AUTH_COPY } from '@/components/auth/auth-copy';
import { BlinkLogo } from '@/components/brand/BlinkLogo';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { isSafeRedirectUrl } from '@/lib/auth/redirect-url';
import { getRoleHomePath } from '@/lib/auth/role-routing';

type OAuthProvider = 'google' | 'apple';
type DemoRole = 'admin' | 'driver' | 'restaurant' | 'customer';

const DEMO_COPY: Record<Locale, { title: string; admin: string; driver: string; restaurant: string; customer: string }> = {
  de: { title: 'Schnellzugang zur Vorschau', admin: 'Admin', driver: 'Fahrer', restaurant: 'Restaurant', customer: 'Kunde' },
  ar: { title: 'دخول سريع للمعاينة', admin: 'الإدارة', driver: 'السائق', restaurant: 'المطعم', customer: 'الزبون' },
  en: { title: 'Quick preview access', admin: 'Admin', driver: 'Driver', restaurant: 'Restaurant', customer: 'Customer' },
};

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'de', label: 'Deutsch' },
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
];

const PAGE_COPY: Record<Locale, { welcome: string; continue: string; favorite: string; food: string; delivered: string; fast: string }> = {
  de: {
    welcome: 'Willkommen zurück!',
    continue: 'Melde dich an, um fortzufahren',
    favorite: 'Dein Lieblings',
    food: 'Essen',
    delivered: 'im Handumdrehen geliefert.',
    fast: 'Heiße Gerichte, kalte Getränke und alles, was du brauchst.',
  },
  ar: {
    welcome: 'مرحبًا بعودتك!',
    continue: 'سجّل الدخول للمتابعة',
    favorite: 'طعامك',
    food: 'المفضل',
    delivered: 'يصلك بلمح البصر.',
    fast: 'وجبات ساخنة، مشروبات باردة وكل ما تحتاجه.',
  },
  en: {
    welcome: 'Welcome Back!',
    continue: 'Sign in to continue',
    favorite: 'Your Favorite',
    food: 'Food',
    delivered: 'Delivered in a Blink!',
    fast: 'Fast: hot meals, cold drinks and everything you need.',
  },
};

const GATE_COPY: Record<Locale, { welcome: string; promise: string; signIn: string; google: string; divider: string; noAccount: string; register: string; back: string }> = {
  de: { welcome: 'Willkommen bei BlinkGo', promise: 'Deine schnelle Lieferung. Immer.', signIn: 'Anmelden', google: 'Mit Google anmelden', divider: 'oder', noAccount: 'Noch kein Konto?', register: 'Registrieren', back: 'Zurück' },
  ar: { welcome: 'مرحبًا بك في BlinkGo', promise: 'توصيلك السريع. دائمًا.', signIn: 'تسجيل الدخول', google: 'المتابعة باستخدام Google', divider: 'أو', noAccount: 'ليس لديك حساب؟', register: 'إنشاء حساب', back: 'رجوع' },
  en: { welcome: 'Welcome to BlinkGo', promise: 'Your fast delivery. Always.', signIn: 'Sign in', google: 'Continue with Google', divider: 'or', noAccount: 'No account yet?', register: 'Register', back: 'Back' },
};

const VALIDATION_COPY: Record<Locale, { emailRequired: string; emailInvalid: string; passwordRequired: string; accessDenied: string; sessionExpired: string; oauthFailed: string }> = {
  de: { emailRequired: 'Bitte gib deine E-Mail-Adresse ein.', emailInvalid: 'Bitte gib eine gültige E-Mail-Adresse ein.', passwordRequired: 'Bitte gib dein Passwort ein.', accessDenied: 'Dieses Konto hat keine Berechtigung für die angeforderte Seite.', sessionExpired: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.', oauthFailed: 'Die Anmeldung beim Anbieter konnte nicht abgeschlossen werden.' },
  ar: { emailRequired: 'يرجى إدخال عنوان بريدك الإلكتروني.', emailInvalid: 'يرجى إدخال عنوان بريد إلكتروني صالح.', passwordRequired: 'يرجى إدخال كلمة المرور.', accessDenied: 'هذا الحساب لا يملك صلاحية الوصول إلى الصفحة المطلوبة.', sessionExpired: 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.', oauthFailed: 'تعذر إكمال تسجيل الدخول بواسطة مزود الحساب.' },
  en: { emailRequired: 'Enter your email address.', emailInvalid: 'Enter a valid email address.', passwordRequired: 'Enter your password.', accessDenied: 'This account does not have access to the requested page.', sessionExpired: 'Your session expired. Please sign in again.', oauthFailed: 'Sign-in with the selected provider could not be completed.' },
};

function getQueryError(code: string, locale: Locale, fallback: string) {
  const messages = VALIDATION_COPY[locale];
  if (code === 'insufficient_permissions' || code === 'forbidden') return messages.accessDenied;
  if (code === 'session_expired' || code === 'unauthorized') return messages.sessionExpired;
  if (code === 'oauth_failed' || code === 'oauth_error' || code === 'provider_error') return messages.oauthFailed;
  return fallback;
}

const inputClass =
  'h-16 w-full rounded-[18px] border border-white/15 bg-[#111214] bg-[linear-gradient(110deg,rgba(255,255,255,.065),rgba(255,255,255,.025))] ps-14 pe-14 text-base text-white outline-none backdrop-blur-xl transition placeholder:text-white/48 hover:border-white/25 focus:border-[#f20b12] focus:ring-4 focus:ring-red-600/15 disabled:cursor-not-allowed disabled:opacity-55';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { locale, setLocale, dir } = useI18n();
  const copy = AUTH_COPY[locale];
  const pageCopy = PAGE_COPY[locale];
  const gateCopy = GATE_COPY[locale];
  const validationCopy = VALIDATION_COPY[locale];
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [demoLoading, setDemoLoading] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showCredentials, setShowCredentials] = useState(() => Boolean(
    params.get('redirect') || params.get('email') || params.get('error') || params.get('verified') || params.get('reset'),
  ));

  useEffect(() => {
    const queryError = params.get('error');
    if (!queryError) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setError(getQueryError(queryError, locale, copy.login.invalid)); });
    return () => { cancelled = true; };
  }, [params, locale, copy.login.invalid]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || oauthLoading) return;
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!normalizedEmail) nextFieldErrors.email = validationCopy.emailRequired;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) nextFieldErrors.email = validationCopy.emailInvalid;
    if (!password) nextFieldErrors.password = validationCopy.passwordRequired;
    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.email || nextFieldErrors.password) {
      window.setTimeout(() => (nextFieldErrors.email ? emailRef.current : passwordRef.current)?.focus(), 0);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: normalizedEmail, password, remember }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message || copy.login.invalid);
        return;
      }
      const requested = params.get('redirect');
      const destination = requested && isSafeRedirectUrl(requested) ? requested : getRoleHomePath(payload?.data?.role);
      router.push(destination);
    } catch {
      setError(copy.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function startOAuth(provider: OAuthProvider) {
    if (loading || oauthLoading) return;
    setError(null);
    setOauthLoading(provider);
    try {
      const requested = params.get('redirect');
      const next = requested && isSafeRedirectUrl(requested) ? requested : '/home';
      const response = await fetch(`/api/auth/oauth?provider=${provider}&next=${encodeURIComponent(next)}&locale=${locale}`, { credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      const target = payload?.data?.url;
      if (!response.ok || !payload?.ok || typeof target !== 'string') {
        throw new Error(payload?.error?.message || copy.common.networkError);
      }
      window.location.assign(target);
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : copy.common.networkError);
      setOauthLoading(null);
    }
  }

  async function quickLogin(role: DemoRole) {
    if (loading || oauthLoading || demoLoading) return;
    setError(null);
    setDemoLoading(role);
    try {
      const response = await fetch('/api/dev/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || copy.common.networkError);
      const destination = typeof payload?.data?.path === 'string' && isSafeRedirectUrl(payload.data.path)
        ? payload.data.path
        : getRoleHomePath(role);
      window.location.assign(destination);
    } catch (quickLoginError) {
      setError(quickLoginError instanceof Error ? quickLoginError.message : copy.common.networkError);
      setDemoLoading(null);
    }
  }

  if (!showCredentials) {
    return (
      <main className="min-h-dvh overflow-hidden bg-black text-white" dir={dir}>
        <div className="mx-auto flex h-dvh w-[min(100vw,46.23dvh)] min-w-[280px] flex-col overflow-hidden bg-black shadow-[0_0_100px_rgba(225,6,0,.12)] lg:hidden">
          <div className="relative aspect-[852/1366] w-full shrink-0 overflow-hidden bg-black">
            <Image src="/brand/blinkgo-welcome-hero-official.png" alt="BlinkGo delivery rider" fill priority sizes="min(100vw, 46.23vh)" className="object-cover" />
            <div className="absolute inset-x-0 top-3 z-10 flex justify-center px-5">
              <BlinkLogo variant="horizontal" size="sm" priority className="drop-shadow-[0_4px_18px_rgba(0,0,0,.9)]" />
            </div>
          </div>

          <section className="relative min-h-0 flex-1 px-[12%] text-center">
            <div className="absolute inset-x-[12%] top-[2%]">
              <h1 className="whitespace-nowrap text-[clamp(.82rem,3.8vw,1.2rem)] font-black uppercase leading-tight tracking-[0.07em]">{gateCopy.welcome}</h1>
              <p className="mt-1 text-[clamp(.82rem,3.7vw,1.08rem)] text-white/72">{gateCopy.promise}</p>
            </div>

            <button type="button" onClick={() => setShowCredentials(true)} className="absolute inset-x-[12%] top-[27%] inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-[#FFC107] via-[#ff7600] to-[#E10600] px-5 text-[clamp(1rem,4.4vw,1.35rem)] font-black text-black shadow-[0_12px_34px_rgba(225,6,0,.22)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFC107]/35 active:translate-y-px">
              {gateCopy.signIn}
            </button>

            <div className="absolute inset-x-[12%] top-[49%] flex items-center gap-4 text-[clamp(.78rem,3.4vw,1rem)] text-white/58"><span className="h-px flex-1 bg-white/25" /><span>{gateCopy.divider}</span><span className="h-px flex-1 bg-white/25" /></div>

            <button type="button" onClick={() => void startOAuth('google')} disabled={Boolean(oauthLoading)} className="absolute inset-x-[12%] top-[60%] inline-flex min-h-11 items-center justify-center gap-3 rounded-2xl border border-white/40 bg-black px-5 text-[clamp(.9rem,3.8vw,1.12rem)] font-semibold text-white transition hover:border-white/70 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/10 disabled:opacity-50">
              {oauthLoading === 'google' ? <Loader2 className="size-5 animate-spin" /> : <GoogleMark />}
              {gateCopy.google}
            </button>

            <p className="absolute inset-x-[12%] bottom-0 flex min-h-11 items-center justify-center text-[clamp(.78rem,3.4vw,1rem)] text-white/65">{gateCopy.noAccount}&nbsp;<Link href="/register" className="inline-flex min-h-11 items-center font-semibold text-[#FFC107] hover:underline">{gateCopy.register}</Link></p>
          </section>
        </div>

        <div className="relative hidden min-h-dvh lg:grid lg:grid-cols-[minmax(540px,1.08fr)_minmax(460px,.92fr)]">
          <section className="relative min-h-dvh overflow-hidden border-e border-white/10 bg-[#050505]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(225,6,0,.24),transparent_45%),linear-gradient(135deg,#030303_0%,#0b0202_52%,#030303_100%)]" />
            <div className="absolute -start-32 top-[8%] h-[46%] w-[72%] -rotate-12 rounded-full bg-[#e10600]/10 blur-3xl" aria-hidden="true" />
            <div className="relative mx-auto h-dvh w-full max-w-[790px]">
              <Image
                src="/brand/blinkgo-welcome-hero-official.png"
                alt="BlinkGo delivery rider"
                fill
                priority
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-contain object-center"
              />
            </div>
            <div className="pointer-events-none absolute inset-y-0 end-0 w-40 bg-gradient-to-r from-transparent to-black/35" aria-hidden="true" />
          </section>

          <section className="relative flex min-h-dvh items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_80%_0%,rgba(225,6,0,.12),transparent_36%),#050505] px-10 py-12 xl:px-16">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FFC107]/70 to-transparent" aria-hidden="true" />
            <div className="w-full max-w-[560px]">
              <div className="mb-10 flex items-center justify-between gap-5">
                <BlinkLogo variant="horizontal" size="lg" />
                <label className="relative inline-flex min-h-12 items-center gap-2 rounded-full border border-white/20 bg-white/[0.035] px-4 text-sm font-semibold backdrop-blur-xl transition focus-within:border-[#FFC107] focus-within:ring-4 focus-within:ring-[#FFC107]/10">
                  <Globe2 className="size-5 text-[#FFC107]" aria-hidden="true" />
                  <span className="sr-only">{copy.common.language}</span>
                  <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={copy.common.language} className="cursor-pointer appearance-none bg-transparent pe-6 text-white outline-none">
                    {LOCALES.map((option) => <option key={option.value} value={option.value} className="bg-black">{option.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute end-3 size-4 text-white/65" aria-hidden="true" />
                </label>
              </div>

              <div className="rounded-[32px] border border-white/12 bg-white/[0.035] p-8 shadow-[0_36px_100px_rgba(0,0,0,.55)] backdrop-blur-2xl xl:p-10">
                <p className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-[#FFC107]">Schnell. Zuverlässig. Für dich.</p>
                <h1 className="text-4xl font-black leading-tight tracking-[-0.04em] xl:text-5xl">{gateCopy.welcome}</h1>
                <p className="mt-4 text-lg text-white/62">{gateCopy.promise}</p>

                <button type="button" onClick={() => setShowCredentials(true)} className="mt-9 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#FFC107] via-[#ff7600] to-[#E10600] px-6 text-lg font-black text-black shadow-[0_16px_48px_rgba(225,6,0,.25)] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFC107]/35 active:translate-y-0">
                  {gateCopy.signIn}
                </button>

                <div className="my-7 flex items-center gap-4 text-sm text-white/48"><span className="h-px flex-1 bg-white/15" /><span>{gateCopy.divider}</span><span className="h-px flex-1 bg-white/15" /></div>

                <button type="button" onClick={() => void startOAuth('google')} disabled={Boolean(oauthLoading)} className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border border-white/28 bg-black/55 px-6 text-base font-bold text-white transition hover:border-white/55 hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/10 disabled:opacity-50">
                  {oauthLoading === 'google' ? <Loader2 className="size-5 animate-spin" /> : <GoogleMark />}
                  {gateCopy.google}
                </button>

                <p className="mt-7 flex min-h-11 items-center justify-center text-base text-white/62">{gateCopy.noAccount}&nbsp;<Link href="/register" className="inline-flex min-h-11 items-center font-bold text-[#FFC107] hover:underline">{gateCopy.register}</Link></p>
              </div>

              <nav aria-label="Legal" className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/42">
                <Link href="/legal/datenschutz" className="min-h-11 content-center transition hover:text-white">Datenschutz</Link>
                <Link href="/legal/agb" className="min-h-11 content-center transition hover:text-white">AGB</Link>
                <Link href="/legal/impressum" className="min-h-11 content-center transition hover:text-white">Impressum</Link>
              </nav>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-[#030405] text-white" dir={dir}>
      <div className="mx-auto grid min-h-dvh w-full max-w-[1600px] lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative min-h-[560px] overflow-hidden sm:min-h-[650px] lg:min-h-dvh">
          <Image
            src="/brand/blinkgo-discovery-hero-v2.webp"
            alt="BlinkGo delivery rider"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 58vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08)_0%,rgba(0,0,0,.06)_44%,#030405_100%)] lg:bg-[linear-gradient(90deg,rgba(0,0,0,.03)_0%,rgba(0,0,0,.12)_68%,#030405_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_40%,transparent_0%,rgba(3,4,5,.12)_38%,rgba(3,4,5,.72)_100%)]" />

          <label className="absolute end-5 top-6 z-20 inline-flex min-h-12 items-center gap-2 rounded-full border border-white/70 bg-black/35 px-4 text-sm font-semibold backdrop-blur-md transition focus-within:border-red-500 focus-within:ring-4 focus-within:ring-red-600/15 sm:end-8 sm:top-8">
            <Globe2 className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">{copy.common.language}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
              aria-label={copy.common.language}
              className="cursor-pointer appearance-none bg-transparent pe-6 text-white outline-none"
            >
              {LOCALES.map((option) => <option key={option.value} value={option.value} className="bg-black">{option.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 h-4 w-4" aria-hidden="true" />
          </label>

          <div className="absolute start-5 top-[31%] z-10 w-[52%] max-w-[390px] sm:start-9 sm:top-[28%] lg:start-10 lg:top-[26%]" dir={dir}>
            <BlinkLogo variant="horizontal" size="xl" className="mb-6" />
            <h2 className="text-[28px] font-black leading-[1.2] tracking-[-0.035em] sm:text-[38px] lg:text-[46px]">
              {pageCopy.favorite}<br />
              <span className="text-[#ffc400]">{pageCopy.food}</span>, {pageCopy.delivered}
            </h2>
            <span className="my-5 block h-1 w-14 bg-[#ed1018]" aria-hidden="true" />
            <p className="max-w-sm text-sm leading-6 text-white/65 sm:text-base">{pageCopy.fast}</p>
          </div>
        </section>

        <section className="relative z-10 -mt-16 flex items-center bg-[#030405] px-5 pb-10 pt-5 sm:px-10 lg:mt-0 lg:px-12 lg:py-14 xl:px-20">
          <div className="mx-auto w-full max-w-[580px]">
            {!params.get('redirect') && (
              <button type="button" onClick={() => setShowCredentials(false)} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-white/70 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]">
                <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />{gateCopy.back}
              </button>
            )}
            <div className="mb-8">
              <h1 className="text-4xl font-black tracking-[-0.04em] sm:text-5xl">{pageCopy.welcome} <span aria-hidden="true">👋</span></h1>
              <p className="mt-3 text-base text-white/65 sm:text-lg">{pageCopy.continue}</p>
            </div>

            {params.get('verified') === '1' && <AuthAlert tone="success">{copy.login.verified}</AuthAlert>}
            {params.get('reset') === '1' && <AuthAlert tone="success">{copy.login.reset}</AuthAlert>}
            {error && <AuthAlert>{error}</AuthAlert>}

            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <label className="relative block">
                <span className="sr-only">{copy.login.email}</span>
                <Mail className="pointer-events-none absolute start-5 top-8 z-10 h-6 w-6 -translate-y-1/2 text-white/62" aria-hidden="true" />
                <input
                  ref={emailRef}
                  id="login-email"
                  className={inputClass}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
                  }}
                  placeholder={copy.login.email}
                  disabled={loading || Boolean(oauthLoading)}
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                />
                {fieldErrors.email && <span id="login-email-error" role="alert" className="mt-1.5 block px-2 text-xs font-semibold text-red-300">{fieldErrors.email}</span>}
              </label>
              <label className="relative block">
                <span className="sr-only">{copy.login.password}</span>
                <LockKeyhole className="pointer-events-none absolute start-5 top-8 z-10 h-6 w-6 -translate-y-1/2 text-white/62" aria-hidden="true" />
                <input
                  ref={passwordRef}
                  id="login-password"
                  className={inputClass}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder={copy.login.password}
                  disabled={loading || Boolean(oauthLoading)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute end-2 top-8 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-xl text-white/55 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-600"
                  aria-label={showPassword ? copy.common.hidePassword : copy.common.showPassword}
                >
                  {showPassword ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
                </button>
                {fieldErrors.password && <span id="login-password-error" role="alert" className="mt-1.5 block px-2 text-xs font-semibold text-red-300">{fieldErrors.password}</span>}
              </label>

              <div className="flex items-center justify-between gap-4 py-1 text-sm sm:text-base">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-white/78">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-6 w-6 rounded-md border-white/20 bg-white/5 accent-[#ed1018]" />
                  {copy.login.remember}
                </label>
                <Link href={`/forgot-password?email=${encodeURIComponent(email)}`} className="inline-flex min-h-11 items-center font-medium text-[#ff191f] hover:underline">
                  {copy.login.forgot}
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading || Boolean(oauthLoading)}
                className="inline-flex min-h-16 w-full items-center justify-center gap-2 rounded-[18px] bg-[linear-gradient(100deg,#f0060d,#ff1018)] px-5 text-lg font-extrabold text-white shadow-[0_18px_48px_rgba(239,6,13,.22)] transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-red-500/25 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
              >
                {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                {loading ? copy.common.loading : copy.login.submit}
              </button>
            </form>

            <div className="my-7 flex items-center gap-4 text-sm text-white/45 sm:text-base">
              <span className="h-px flex-1 bg-white/20" />
              <span>{copy.login.divider}</span>
              <span className="h-px flex-1 bg-white/20" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <OAuthButton label="Google" loading={oauthLoading === 'google'} disabled={loading || Boolean(oauthLoading)} onClick={() => startOAuth('google')} icon={<GoogleMark />} />
              <OAuthButton label="Apple" loading={oauthLoading === 'apple'} disabled={loading || Boolean(oauthLoading)} onClick={() => startOAuth('apple')} icon={<Apple className="h-7 w-7 fill-white" />} />
            </div>

            <p className="mt-8 text-center text-base text-white/58">
              {copy.login.noAccount}{' '}
              <Link href="/register" className="inline-flex min-h-11 items-center font-semibold text-[#ff191f] hover:underline">{copy.login.register}</Link>
            </p>

            {process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true' && (
              <div className="mt-5 rounded-[20px] border border-red-500/20 bg-red-950/15 p-3.5">
                <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-white/55">
                  {DEMO_COPY[locale].title}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <DemoButton label={DEMO_COPY[locale].admin} icon={<ShieldCheck className="h-4 w-4" />} loading={demoLoading === 'admin'} disabled={Boolean(demoLoading) || loading || Boolean(oauthLoading)} onClick={() => quickLogin('admin')} />
                  <DemoButton label={DEMO_COPY[locale].driver} icon={<Bike className="h-4 w-4" />} loading={demoLoading === 'driver'} disabled={Boolean(demoLoading) || loading || Boolean(oauthLoading)} onClick={() => quickLogin('driver')} />
                  <DemoButton label={DEMO_COPY[locale].restaurant} icon={<Store className="h-4 w-4" />} loading={demoLoading === 'restaurant'} disabled={Boolean(demoLoading) || loading || Boolean(oauthLoading)} onClick={() => quickLogin('restaurant')} />
                  <DemoButton label={DEMO_COPY[locale].customer} icon={<UserRound className="h-4 w-4" />} loading={demoLoading === 'customer'} disabled={Boolean(demoLoading) || loading || Boolean(oauthLoading)} onClick={() => quickLogin('customer')} />
                </div>
              </div>
            )}
            <p className="mt-3 text-center text-xs text-white/32">
              <Link href="/legal/agb" className="inline-flex min-h-11 items-center hover:text-white">{copy.common.terms}</Link>
              <span className="mx-2">·</span>
              <Link href="/legal/datenschutz" className="inline-flex min-h-11 items-center hover:text-white">{copy.common.privacy}</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function DemoButton({ label, icon, loading, disabled, onClick }: { label: string; icon: ReactNode; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-white/78 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-45">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      <span>{label}</span>
    </button>
  );
}

function OAuthButton({ label, loading, disabled, onClick, icon }: { label: string; loading: boolean; disabled: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-16 items-center justify-center gap-3 rounded-[18px] border border-white/15 bg-white/[0.045] px-4 text-base font-semibold text-white/82 backdrop-blur-xl transition hover:border-white/30 hover:bg-white/[0.075] focus:outline-none focus:ring-4 focus:ring-white/10 disabled:cursor-not-allowed disabled:opacity-55 sm:text-lg"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      <span>{label}</span>
    </button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.37Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.4l-3.24-2.52c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.3.32-1.91v-2.6H3.05A10 10 0 0 0 2 12c0 1.62.39 3.15 1.05 4.51l3.35-2.6Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.6c.79-2.37 3-4.13 5.6-4.13Z" />
    </svg>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-dvh bg-[#030405]" />}><LoginInner /></Suspense>;
}
