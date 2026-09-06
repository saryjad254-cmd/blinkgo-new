'use client';

import { Suspense, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import MailCheck from 'lucide-react/dist/esm/icons/mail-check';
import { AuthAlert, AuthShell, FieldLabel, authInputClass, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/AuthShell';
import { AUTH_COPY } from '@/components/auth/auth-copy';
import { useI18n } from '@/lib/i18n/I18nProvider';

function ForgotPasswordInner() {
  const params = useSearchParams();
  const { locale } = useI18n();
  const copy = AUTH_COPY[locale];
  const [email, setEmail] = useState(params.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  function showEmailError(message: string) {
    setError(message);
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return showEmailError(copy.forgot.required);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return showEmailError(copy.forgot.invalidEmail);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message || copy.forgot.failed);
        return;
      }
      setSuccess(true);
    } catch {
      setError(copy.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell eyebrow={copy.forgot.eyebrow} title={success ? copy.forgot.success : copy.forgot.title} subtitle={success ? copy.forgot.successBody : copy.forgot.subtitle}>
      {success ? (
        <div>
          <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"><MailCheck className="h-8 w-8" aria-hidden="true" /></div>
          <AuthAlert tone="success">{copy.forgot.successBody}</AuthAlert>
          <Link href="/login" className={authSecondaryButtonClass}>{copy.common.backToLogin}</Link>
        </div>
      ) : (
        <>
          {error && <AuthAlert>{error}</AuthAlert>}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <label className="block"><FieldLabel>{copy.login.email}</FieldLabel><input ref={emailRef} className={authInputClass} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required value={email} onChange={(event) => { setEmail(event.target.value); if (error) setError(null); }} placeholder="name@example.com" disabled={loading} aria-invalid={Boolean(error)} aria-describedby={error ? 'forgot-password-email-error' : undefined} />{error && <span id="forgot-password-email-error" className="mt-2 block text-sm font-medium text-red-300">{error}</span>}</label>
            <button className={authPrimaryButtonClass} type="submit" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? copy.common.loading : copy.forgot.submit}</button>
          </form>
          <Link href="/login" className="mt-6 inline-flex min-h-11 w-full items-center justify-center text-sm font-bold text-white/55 transition hover:text-white">{copy.common.backToLogin}</Link>
        </>
      )}
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return <Suspense fallback={<div className="min-h-dvh bg-[#08090B]" />}><ForgotPasswordInner /></Suspense>;
}
