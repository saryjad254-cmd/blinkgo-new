'use client';

import { Suspense, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import MailCheck from 'lucide-react/dist/esm/icons/mail-check';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import { AuthAlert, AuthShell, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/AuthShell';
import { AUTH_COPY } from '@/components/auth/auth-copy';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { locale } = useI18n();
  const copy = AUTH_COPY[locale];
  const email = params.get('email') || '';
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((item, itemIndex) => itemIndex === index ? digit : item));
    setError(null);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] || ''));
    refs.current[Math.min(pasted.length, 6) - 1]?.focus();
  }

  async function verify() {
    const code = digits.join('');
    if (code.length !== 6 || !email) return setError(copy.verify.wrong);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        const message = extractErrorMessage(payload, '');
        setError(message.toLowerCase().includes('expir') ? copy.verify.expired : copy.verify.wrong);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push(`/login?email=${encodeURIComponent(email)}&verified=1`), 1300);
    } catch {
      setError(copy.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || !email) return;
    setError(null);
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error();
      setCooldown(60);
      setDigits(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    } catch {
      setError(copy.common.networkError);
    }
  }

  if (success) {
    return (
      <AuthShell eyebrow={copy.verify.eyebrow} title={copy.verify.success} subtitle={copy.verify.successBody}>
        <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"><MailCheck className="h-8 w-8" aria-hidden="true" /></div>
        <AuthAlert tone="success">{copy.verify.successBody}</AuthAlert>
        <Link href={`/login?email=${encodeURIComponent(email)}&verified=1`} className={authSecondaryButtonClass}>{copy.login.submit}</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={copy.verify.eyebrow} title={copy.verify.title} subtitle={copy.verify.subtitle}>
      {email ? <p className="mb-5 rounded-xl bg-white/[0.045] px-3 py-2 text-center text-sm font-semibold text-white/70" dir="ltr">{email}</p> : <AuthAlert>{copy.register.invalidEmail}</AuthAlert>}
      {error && <AuthAlert>{error}</AuthAlert>}
      <div className="mb-6">
        <div className="mb-3 text-center text-[13px] font-bold text-white/75">{copy.verify.label}</div>
        <div className="grid grid-cols-6 gap-2" dir="ltr" onPaste={onPaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => { refs.current[index] = element; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit}
              onChange={(event) => updateDigit(index, event.target.value)}
              onKeyDown={(event) => onKeyDown(index, event)}
              disabled={loading || !email}
              aria-label={`${copy.verify.label} ${index + 1}`}
              className="h-14 min-w-0 rounded-xl border border-white/12 bg-white/[0.055] text-center text-xl font-black tabular-nums text-white outline-none transition focus:border-[#E10600] focus:ring-4 focus:ring-[#E10600]/15 disabled:opacity-50 sm:h-16 sm:text-2xl"
            />
          ))}
        </div>
      </div>
      <button type="button" onClick={verify} className={authPrimaryButtonClass} disabled={loading || !email || digits.join('').length !== 6}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? copy.common.loading : copy.verify.submit}</button>
      <div className="mt-5 text-center">
        <p className="text-xs leading-5 text-white/40">{copy.verify.noCode}</p>
        <button type="button" onClick={resend} disabled={cooldown > 0 || !email} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-extrabold text-[#ff3b34] transition hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-[#E10600] disabled:cursor-not-allowed disabled:text-white/25"><RefreshCw className="h-4 w-4" aria-hidden="true" />{cooldown > 0 ? copy.verify.resendIn.replace('{n}', String(cooldown)) : copy.verify.resend}</button>
      </div>
      <Link href="/register" className="mt-3 inline-flex min-h-11 w-full items-center justify-center text-sm font-bold text-white/50 transition hover:text-white">{copy.verify.changeEmail}</Link>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return <Suspense fallback={<div className="min-h-dvh bg-[#08090B]" />}><VerifyInner /></Suspense>;
}
