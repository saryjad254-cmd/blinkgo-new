'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Eye from 'lucide-react/dist/esm/icons/eye';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import { AuthAlert, AuthShell, FieldLabel, authInputClass, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/AuthShell';
import { AUTH_COPY } from '@/components/auth/auth-copy';
import { useI18n } from '@/lib/i18n/I18nProvider';

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { locale } = useI18n();
  const copy = AUTH_COPY[locale];
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const tokenInvalid = !token || !email;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (tokenInvalid) return setError(copy.reset.invalid);
    if (!password || !confirm) return setError(copy.reset.required);
    if (password.length < 8 || password.length > 128) return setError(copy.reset.weak);
    if (password !== confirm) return setError(copy.reset.mismatch);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        const code = payload?.error?.code;
        setError(code === 'TOKEN_EXPIRED' ? copy.reset.expired : code === 'TOKEN_USED' ? copy.reset.used : code === 'RESET_TOKEN_STORE_UNAVAILABLE' ? copy.common.networkError : copy.reset.invalid);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/login?reset=1'), 1400);
    } catch {
      setError(copy.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return <AuthShell eyebrow={copy.reset.eyebrow} title={copy.reset.success} subtitle={copy.reset.successBody}><div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"><ShieldCheck className="h-8 w-8" /></div><AuthAlert tone="success">{copy.reset.successBody}</AuthAlert><Link href="/login?reset=1" className={authSecondaryButtonClass}>{copy.login.submit}</Link></AuthShell>;
  }

  return (
    <AuthShell eyebrow={copy.reset.eyebrow} title={copy.reset.title} subtitle={copy.reset.subtitle}>
      {tokenInvalid && <AuthAlert>{copy.reset.invalid}</AuthAlert>}
      {error && !tokenInvalid && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <label className="block"><FieldLabel>{copy.reset.password}</FieldLabel><PasswordInput name="password" value={password} onChange={setPassword} shown={showPassword} onToggle={() => setShowPassword((value) => !value)} disabled={loading || tokenInvalid} label={showPassword ? copy.common.hidePassword : copy.common.showPassword} /></label>
        <label className="block"><FieldLabel>{copy.reset.confirm}</FieldLabel><PasswordInput name="confirm-password" value={confirm} onChange={setConfirm} shown={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} disabled={loading || tokenInvalid} label={showConfirmPassword ? copy.common.hidePassword : copy.common.showPassword} /></label>
        <button className={authPrimaryButtonClass} type="submit" disabled={loading || tokenInvalid}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? copy.common.loading : copy.reset.submit}</button>
      </form>
      <Link href="/login" className="mt-6 inline-flex min-h-11 w-full items-center justify-center text-sm font-bold text-white/55 transition hover:text-white">{copy.common.backToLogin}</Link>
    </AuthShell>
  );
}

function PasswordInput({ name, value, onChange, shown, onToggle, disabled, label }: { name: string; value: string; onChange: (value: string) => void; shown: boolean; onToggle: () => void; disabled: boolean; label: string }) {
  return <span className="relative block"><input className={`${authInputClass} pe-14`} name={name} type={shown ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={value} onChange={(event) => onChange(event.target.value)} placeholder="••••••••" disabled={disabled} /><button type="button" onClick={onToggle} className="absolute end-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-white/45 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#E10600]" aria-label={label}>{shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="min-h-dvh bg-[#08090B]" />}><ResetPasswordInner /></Suspense>;
}
