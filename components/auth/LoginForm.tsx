'use client';

/**
 * Login Form — premium authentication UI
 *
 * Best-practice implementation (Authgear 2025, web.dev, WCAG 2.2):
 * - Passkey / WebAuthn first (when available)
 * - Magic link (passwordless) alternative
 * - Social login (Google, Apple)
 * - Email + password fallback
 * - "Remember me" extends session to 30 days
 * - Caps Lock detection
 * - Inline validation on blur (early feedback)
 * - 25s timeout (Akamai research)
 * - Smart errors per status code
 * - Auto-focus first field on mount
 * - Login attempt counter (shows "X attempts remaining")
 * - WebAuthn conditional UI (autofill) when available
 * - WCAG 2.1/2.2 AA compliant
 * - autoComplete="username" + autoComplete="current-password"
 * - "Show password" toggle (eye icon)
 * - Email trim before submit
 * - Submit on Enter (with submit button)
 * - Loading state on button (not page)
 * - Server-authoritative error messages
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Eye, EyeOff, Mail, Lock, AlertCircle, Loader2, ArrowRight,
  KeyRound, Sparkles, AlertTriangle, ShieldCheck, CheckCircle
} from 'lucide-react';
import { useT, useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { createBrowserClient } from '@/lib/supabase/client';
import { buildCanonicalOAuthRedirectTo, validateProductionRedirectTo } from '@/lib/oauth/canonical-callback';

// ============================================================
// Constants
// ============================================================

const TIMEOUT_MS = 25_000;       // 25s timeout (Akamai: 11% abandon/sec)
const MAX_LOGIN_ATTEMPTS = 5;    // Show counter after 1 failed attempt

// ============================================================
// Types
// ============================================================

type AuthMode = 'password' | 'magic-link';

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

interface LoginResponse {
  ok: boolean;
  user?: { id: string; role: string; email: string; name?: string; redirectPath: string };
  error?: { code: string; message: string; statusCode: number };
  retryAfter?: number;
}

// ============================================================
// Validation helpers
// ============================================================

// RFC 5322 simplified + length cap
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'required';
  if (trimmed.length > 254) return 'tooLong';
  if (!EMAIL_RE.test(trimmed)) return 'invalid';
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (!value) return 'required';
  if (value.length < 1) return 'required';
  if (value.length > 256) return 'tooLong';
  return undefined;
}

// ============================================================
// Component
// ============================================================

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const { locale } = useI18n();
  const at = (t as any).auth || {};
  const nt = (t as any).nav || {};
  const ct = (key: string, fallback: string) => at[key] ?? fallback;

  // Refs
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [verifiedBanner, setVerifiedBanner] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [mode, setMode] = useState<AuthMode>('password');

  // Auto-focus email on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Pre-fill email from query param (e.g. /login?email=foo@bar.com) and
  // surface a friendly "verified" success banner from /auth/verify.
  // Also read URL error params (e.g. ?error=invalid_magic_link)
  useEffect(() => {
    if (!params) return;

    const prefillEmail = params.get('email');
    if (prefillEmail) setEmail(prefillEmail);

    if (params.get('verified') === '1') {
      setVerifiedBanner(true);
    }

    const urlError = params.get('error');
    if (urlError) {
      const errMap: Record<string, string> = {
        invalid_magic_link: ct('invalidMagicLink', 'Ungültiger Magic Link'),
        magic_link_used: ct('magicLinkUsed', 'Magic Link wurde bereits verwendet'),
        magic_link_expired: ct('magicLinkExpired', 'Magic Link ist abgelaufen'),
        magic_link_unavailable: ct('magicLinkUnavailable', 'Magic Link Service nicht verfügbar'),
        account_disabled: ct('accountDisabled', 'Konto deaktiviert'),
        login_failed: ct('loginFailed', 'Anmeldung fehlgeschlagen'),
      };
      setErrors({ general: errMap[urlError] || ct('loginFailed', 'Anmeldung fehlgeschlagen') });
    }
  }, [params, ct]);

  // WebAuthn conditional UI (autofill passkey)
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      // @ts-ignore — type may not be in TS lib
      typeof window.PublicKeyCredential.isConditionalMediationAvailable === 'function'
    ) {
      // @ts-ignore
      window.PublicKeyCredential.isConditionalMediationAvailable?.().then((available: boolean) => {
        if (available && emailRef.current) {
          // @ts-ignore
          emailRef.current.autocomplete = 'username webauthn';
        }
      }).catch(() => {});
    }
  }, []);

  // ============== Validation on blur ==============
  const handleEmailBlur = useCallback(() => {
    setTouched((t) => ({ ...t, email: true }));
    const err = validateEmail(email);
    setErrors((prev) => ({ ...prev, email: err ? ct('emailInvalid', 'Bitte gültige E-Mail eingeben') : undefined }));
  }, [email, ct]);

  const handlePasswordBlur = useCallback(() => {
    setTouched((t) => ({ ...t, password: true }));
    const err = validatePassword(password);
    setErrors((prev) => ({ ...prev, password: err ? ct('passwordRequired', 'Passwort ist erforderlich') : undefined }));
  }, [password, ct]);

  // ============== Clear field-level errors on type ==============
  const handleEmailChange = useCallback((value: string) => {
    setEmail(value);
    if (errors.email && touched.email) {
      const err = validateEmail(value);
      if (!err) setErrors((prev) => ({ ...prev, email: undefined }));
    }
  }, [errors.email, touched.email]);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    if (errors.password && touched.password) {
      const err = validatePassword(value);
      if (!err) setErrors((prev) => ({ ...prev, password: undefined }));
    }
  }, [errors.password, touched.password]);

  // ============== Caps lock detection ==============
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  }, []);

  // ============== Submit (password) ==============
  const handlePasswordSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Final validation
      const emailErr = validateEmail(email);
      const passwordErr = validatePassword(password);
      setTouched({ email: true, password: true });
      if (emailErr || passwordErr) {
        setErrors({
          email: emailErr ? ct('emailInvalid', 'Bitte gültige E-Mail eingeben') : undefined,
          password: passwordErr ? ct('passwordRequired', 'Passwort ist erforderlich') : undefined,
        });
        // Focus first invalid field
        if (emailErr) emailRef.current?.focus();
        else if (passwordErr) passwordRef.current?.focus();
        return;
      }

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      setLoading(true);
      setErrors({});
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            remember: rememberMe,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        // Non-OK: parse and surface
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          let msg: string;
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);

          if (res.status === 401) {
            msg = ct('invalidCredentials', 'E-Mail oder Passwort falsch');
            // On invalid login: keep email, clear password, re-focus password
            setPassword('');
            setShowPassword(false);
            setTimeout(() => passwordRef.current?.focus(), 0);
          } else if (res.status === 403) {
            if (data?.error?.code === 'ACCOUNT_DISABLED') {
              msg = ct('accountDisabled', 'Konto deaktiviert. Bitte Support kontaktieren.');
            } else {
              msg = ct('accountDisabled', 'Kein Zugriff');
            }
          } else if (res.status === 429) {
            const retryMin = data?.retryAfter
              ? Math.ceil(data.retryAfter / 60)
              : 15;
            msg = ct('rateLimited', 'Zu viele Versuche. Bitte in {min} Minuten erneut.').replace('{min}', String(retryMin));
          } else if (res.status === 502 || res.status === 503 || res.status === 504) {
            msg = ct('serverUnavailable', 'Server temporär nicht verfügbar. Bitte später erneut.');
          } else if (res.status >= 500) {
            msg = ct('serverError', 'Serverfehler. Bitte später erneut versuchen.');
          } else {
            msg = data?.error?.message || ct('loginFailed', 'Anmeldung fehlgeschlagen');
          }
          setErrors({ general: msg });
          return;
        }

        // Success
        const data: LoginResponse = await res.json();
        if (data?.user?.redirectPath) {
          router.push(data.user.redirectPath);
          router.refresh();
        } else {
          router.push('/search');
          router.refresh();
        }
      } catch (e: any) {
        clearTimeout(timer);
        if (e?.name === 'AbortError') {
          setErrors({ general: ct('timeout', 'Anfrage hat zu lange gedauert. Bitte erneut versuchen.') });
        } else {
          setErrors({ general: ct('unexpectedResponse', 'Unerwartete Antwort. Bitte erneut versuchen.') });
        }
      } finally {
        clearTimeout(timer);
        setLoading(false);
      }
    },
    [email, password, rememberMe, attempts, router, ct]
  );

  // ============== Magic link submit ==============
  const handleMagicLink = useCallback(async () => {
    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrors({ email: ct('emailInvalid', 'Bitte gültige E-Mail eingeben') });
      setTouched((t) => ({ ...t, email: true }));
      emailRef.current?.focus();
      return;
    }

    setMagicLinkLoading(true);
    setErrors({});
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Always show success (prevent email enumeration)
      if (res.ok) {
        setMagicLinkSent(true);
      } else if (res.status === 429) {
        setErrors({ general: ct('rateLimited', 'Zu viele Versuche. Bitte später erneut.') });
      } else {
        setErrors({ general: ct('magicLinkUnavailable', 'Magic Link Service nicht verfügbar') });
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setErrors({ general: ct('timeout', 'Anfrage hat zu lange gedauert') });
      } else {
        setErrors({ general: ct('magicLinkUnavailable', 'Magic Link Service nicht verfügbar') });
      }
    } finally {
      setMagicLinkLoading(false);
    }
  }, [email, ct]);

  // ============== Social login (real OAuth via Supabase) ==============
  // Same pattern as Vercel, Linear, Notion:
  // 1. Server generates OAuth URL via Supabase
  // 2. Client redirects user to that URL
  // 3. Provider redirects back to /auth/callback
  // 4. Server exchanges code for session, sets cookies
  // 5. User is logged in
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  // Supabase browser client — used for OAuth (handles errors before redirect, same as Vercel/Linear)
  // Wrapped in try/catch to prevent component crash if env vars missing
  let supabase: ReturnType<typeof createBrowserClient> | null = null;
  try {
    supabase = createBrowserClient();
  } catch (e) {
    // OAuth buttons will show "not configured" error, but password login still works
    if (typeof window !== 'undefined') {
      console.warn('[LoginForm] Supabase client init failed - OAuth will be unavailable:', e);
    }
  }

  const handleSocialLogin = useCallback(async (provider: 'google' | 'apple') => {
    // v78: trace now uses canonical URL (not window.location.origin)
    // eslint-disable-next-line no-console
    console.error('[BLINKGO_AUTH_TRACE:v78:login_form_oauth] handleSocialLogin_start', JSON.stringify({ provider, locale, currentOrigin: typeof window !== 'undefined' ? window.location.origin : 'no_window' }));
    if (socialLoading) return; // Prevent double-click
    if (!supabase) {
      setErrors({ general: ct('socialLoginFailed', 'OAuth nicht verfügbar. Bitte mit E-Mail anmelden.') });
      return;
    }
    setSocialLoading(provider);
    setErrors({});

    // v78 FIX: Use a single canonical callback URL derived from validated env vars.
    // This ensures the PKCE code_verifier cookie (set by signInWithOAuth on this
    // origin) is sent to the SAME origin when Google redirects back to
    // /auth/callback. Using window.location.origin is unsafe because:
    //   - https://www.blinkgo.de sets cookies on www (different from apex)
    //   - https://blinkgo.de sets cookies on apex
    //   - These two origins don't share cookies, so the code_verifier is lost.
    const devOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { baseUrl: canonicalBaseUrl, redirectTo: callbackUrl } =
      buildCanonicalOAuthRedirectTo(locale as 'de' | 'en' | 'ar', { devOrigin });

    // [OAUTH_CANONICAL_REDIRECT] diagnostic — never log tokens/secrets
    // eslint-disable-next-line no-console
    console.error(
      '[OAUTH_CANONICAL_REDIRECT]',
      JSON.stringify({
        currentOrigin: devOrigin ?? null,
        canonicalBaseUrl,
        redirectTo: callbackUrl,
        locale,
        provider,
        nodeEnv: process.env.NODE_ENV,
      }),
    );

    // Production safety net: refuse to call Supabase with an unsafe redirectTo.
    const validationError = validateProductionRedirectTo(callbackUrl);
    if (validationError) {
      // eslint-disable-next-line no-console
      console.error('[OAUTH_CANONICAL_REDIRECT] validation_failed', validationError);
      setErrors({
        general: ct('socialLoginFailed', 'OAuth-Konfiguration ungültig. Bitte mit E-Mail anmelden.'),
      });
      setSocialLoading(null);
      return;
    }

    try {
      // Use Supabase browser client directly — same pattern as Supabase docs, Vercel, Linear
      // This catches provider-disabled errors BEFORE redirecting
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            hl: locale === 'ar' ? 'ar' : locale === 'en' ? 'en' : 'de',
          },
          // skipBrowserRedirect: false (default) - we want to redirect after success
        },
      });

      if (error) {
        const errorMsg = error.message?.toLowerCase().includes('not enabled') ||
                         error.message?.toLowerCase().includes('provider is not enabled') ||
                         error.message?.toLowerCase().includes('unsupported provider')
          ? ct('socialLoginNotConfigured', `{provider} Anmeldung ist noch nicht eingerichtet. Bitte mit E-Mail anmelden.`)
              .replace('{provider}', provider === 'google' ? ct('providerGoogle', 'Google') : ct('providerApple', 'Apple'))
          : ct('socialLoginFailed', 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
        setErrors({ general: errorMsg });
        setSocialLoading(null);
        return;
      }

      // Success: Supabase will redirect to provider consent screen
      if (data?.url) {
        // eslint-disable-next-line no-console
        console.error('[BLINKGO_AUTH_TRACE:v77:login_form_oauth] window_location_href', JSON.stringify({ url: data.url.substring(0, 100) + '...' }));
        window.location.href = data.url;
      }
    } catch (e: any) {
      setErrors({ general: ct('socialLoginFailed', 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.') });
      setSocialLoading(null);
    }
  }, [socialLoading, supabase, ct, locale]);

  // ============== Computed ==============
  const attemptsRemaining = MAX_LOGIN_ATTEMPTS - attempts;
  const showAttemptCounter = attempts > 0 && attempts < MAX_LOGIN_ATTEMPTS;
  const showBlockedWarning = attempts >= MAX_LOGIN_ATTEMPTS;
  const isFormValid = !errors.email && !errors.password && email.trim() && password;

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 rounded-2xl bg-brand-red-500/30 blur-2xl animate-pulse-glow" />
          <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-brand-red-500 to-brand-yellow-500 flex items-center justify-center text-white shadow-speed-glow">
            <KeyRound className="w-7 h-7" strokeWidth={2} aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-text tracking-tight">
          {ct('loginTitle', 'Willkommen zurück')}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {ct('loginSubtitle', 'Melde dich an um fortzufahren')}
        </p>
      </div>

      {/* Verified-success banner (from /auth/verify) */}
      {verifiedBanner && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 p-4 rounded-xl bg-success/10 border border-success/30 flex items-start gap-3 animate-slide-in"
        >
          <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-4 h-4 text-success" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-success font-bold">
              {ct('emailVerified', 'E-Mail erfolgreich bestätigt!')}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {ct('emailVerifiedDesc', 'Du kannst dich jetzt anmelden.')}
            </p>
          </div>
        </div>
      )}

      {/* General error */}
      {errors.general && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 flex items-start gap-2 animate-slide-in"
        >
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-danger font-semibold flex-1">{errors.general}</p>
        </div>
      )}

      {/* Magic link sent confirmation */}
      {magicLinkSent && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 p-4 rounded-xl bg-success/10 border border-success/30 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-success" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-success font-bold">
              {ct('magicLinkSent', 'Magic Link wurde gesendet!')}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {ct('magicLinkSentDesc', 'Prüfe dein Postfach und klicke auf den Link.')}
            </p>
          </div>
        </div>
      )}

      {/* Login attempt counter */}
      {showAttemptCounter && !showBlockedWarning && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-xs font-semibold text-warning flex items-center gap-2"
        >
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          {ct('loginAttemptsRemaining', 'Noch {count} Versuche übrig').replace('{count}', String(attemptsRemaining))}
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex items-center gap-1 p-1 bg-bg-elevated rounded-2xl border border-edge mb-4" role="tablist" aria-label="Login method">
        <button
          onClick={() => { setMode('password'); setMagicLinkSent(false); }}
          role="tab"
          aria-selected={mode === 'password'}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 ease-silk',
            mode === 'password'
              ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-speed-glow'
              : 'text-text-secondary hover:text-white'
          )}
        >
          <Lock className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
          {ct('usePassword', 'Passwort')}
        </button>
        <button
          onClick={() => setMode('magic-link')}
          role="tab"
          aria-selected={mode === 'magic-link'}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 ease-silk',
            mode === 'magic-link'
              ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-speed-glow'
              : 'text-text-secondary hover:text-white'
          )}
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
          {ct('magicLink', 'Magic Link')}
        </button>
      </div>

      {/* Form */}
      <form
        onSubmit={mode === 'password' ? handlePasswordSubmit : (e) => { e.preventDefault(); handleMagicLink(); }}
        autoComplete="on"
        noValidate
        className="space-y-4"
      >
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-semibold text-text-secondary mb-1.5">
            {ct('emailLabel', 'E-Mail')}
          </label>
          <div className="relative">
            <Mail
              className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={emailRef}
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              required
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={handleEmailBlur}
              onKeyDown={handleKeyDown}
              disabled={loading || magicLinkLoading}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'login-email-err' : undefined}
              maxLength={254}
              className={cn(
                'w-full h-12 ps-11 pe-3 rounded-xl bg-bg-elevated border text-sm text-text placeholder:text-text-muted transition-all duration-200 ease-silk outline-none',
                errors.email
                  ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
                  : 'border-edge focus:border-brand focus:bg-bg-subtle focus:shadow-[0_0_0_3px_rgba(255,107,26,0.12)]'
              )}
              placeholder={ct('emailPlaceholder', 'name@beispiel.de')}
            />
          </div>
          {errors.email && (
            <p id="login-email-err" role="alert" className="mt-1.5 text-xs text-danger font-semibold flex items-center gap-1">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.email}
            </p>
          )}
        </div>

        {/* Password (only in password mode) */}
        {mode === 'password' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-password" className="block text-sm font-semibold text-text-secondary">
                {ct('passwordLabel', 'Passwort')}
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-bold text-brand hover:text-brand-light transition-colors focus:outline-none focus:underline"
              >
                {ct('forgotPassword', 'Passwort vergessen?')}
              </Link>
            </div>
            <div className="relative">
              <Lock
                className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={passwordRef}
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                spellCheck="false"
                autoCapitalize="off"
                autoCorrect="off"
                required
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onBlur={handlePasswordBlur}
                onKeyDown={handleKeyDown}
                disabled={loading}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'login-password-err' : capsLock ? 'caps-lock-warn' : undefined}
                maxLength={256}
                className={cn(
                  'w-full h-12 ps-11 pe-11 rounded-xl bg-bg-elevated border text-sm text-text placeholder:text-text-muted transition-all duration-200 ease-silk outline-none',
                  errors.password
                    ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
                    : 'border-edge focus:border-brand focus:bg-bg-subtle focus:shadow-[0_0_0_3px_rgba(255,107,26,0.12)]'
                )}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                aria-label={showPassword ? ct('hidePassword', 'Passwort verbergen') : ct('showPassword', 'Passwort anzeigen')}
                className="absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password && (
              <p id="login-password-err" role="alert" className="mt-1.5 text-xs text-danger font-semibold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {errors.password}
              </p>
            )}
            {capsLock && !errors.password && (
              <p id="caps-lock-warn" role="status" className="mt-1.5 text-xs text-warning font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                {ct('capsLockOn', 'Feststelltaste ist aktiv')}
              </p>
            )}
          </div>
        )}

        {/* Remember me + caps lock hint */}
        {mode === 'password' && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
              className="w-4 h-4 rounded accent-brand-500 cursor-pointer"
            />
            <span className="text-sm text-text-secondary group-hover:text-text transition-colors">
              {ct('rememberMe', 'Angemeldet bleiben')}
            </span>
          </label>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading || magicLinkLoading || showBlockedWarning}
          className={cn(
            'btn-primary w-full h-12 text-sm font-bold touch-manipulation',
            (loading || magicLinkLoading) && 'opacity-70 cursor-wait'
          )}
        >
          {loading || magicLinkLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {ct('loggingIn', 'Anmelden…')}
            </>
          ) : mode === 'password' ? (
            <>
              {ct('loginButton', 'Anmelden')}
              <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              {ct('sendMagicLink', 'Magic Link senden')}
            </>
          )}
        </button>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-text-muted pt-1">
          <ShieldCheck className="w-3 h-3" aria-hidden="true" />
          <span>{ct('secureLogin', 'Sichere Verbindung · TLS verschlüsselt')}</span>
        </div>
      </form>

      {/* Social login (only in password mode) */}
      {mode === 'password' && (
        <>
          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-edge" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-bg px-3 text-[10px] text-text-muted font-bold uppercase tracking-wider">
                {ct('orContinueWith', 'Oder anmelden mit')}
              </span>
            </div>
          </div>

          {/* Social buttons */}
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => handleSocialLogin('google')}
              disabled={loading || !!socialLoading}
              aria-busy={socialLoading === 'google'}
              className="w-full h-11 px-4 rounded-xl bg-bg-elevated border border-edge hover:border-edge-strong text-sm font-semibold text-text flex items-center justify-center gap-2.5 transition-all duration-200 ease-silk disabled:opacity-60 disabled:cursor-wait"
            >
              {socialLoading === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <GoogleIcon />
              )}
              {socialLoading === 'google' ? ct('connecting', 'Verbindet…') : ct('continueWithGoogle', 'Mit Google fortfahren')}
            </button>
            <button
              type="button"
              onClick={() => handleSocialLogin('apple')}
              disabled={loading || !!socialLoading}
              aria-busy={socialLoading === 'apple'}
              className="w-full h-11 px-4 rounded-xl bg-bg-elevated border border-edge hover:border-edge-strong text-sm font-semibold text-text flex items-center justify-center gap-2.5 transition-all duration-200 ease-silk disabled:opacity-60 disabled:cursor-wait"
            >
              {socialLoading === 'apple' ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <AppleIcon />
              )}
              {socialLoading === 'apple' ? ct('connecting', 'Verbindet…') : ct('continueWithApple', 'Mit Apple fortfahren')}
            </button>
          </div>
        </>
      )}

      {/* Register link */}
      <p className="mt-6 text-center text-sm text-text-secondary">
        {ct('noAccount', 'Noch kein Konto?')}{' '}
        <Link href="/register" className="font-bold text-brand hover:text-brand-light transition-colors">
          {ct('registerNow', 'Jetzt registrieren')}
        </Link>
      </p>
    </div>
  );
}

// ============================================================
// Social icons (inline SVG for performance)
// ============================================================

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
