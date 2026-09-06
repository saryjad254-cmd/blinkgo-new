'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Eye from 'lucide-react/dist/esm/icons/eye';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { AuthAlert, AuthShell, FieldLabel, authInputClass, authPrimaryButtonClass } from '@/components/auth/AuthShell';
import { AUTH_COPY } from '@/components/auth/auth-copy';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/api/error-helper';
import { CUSTOMER_TERMS_VERSION, PRIVACY_NOTICE_VERSION } from '@/lib/legal/versions';

const REGISTER_LEGAL_COPY = {
  de: { phoneInvalid: 'Bitte gib eine gültige Telefonnummer ein.', legalRequired: 'Bitte bestätige die AGB und die Datenschutzhinweise.', prefix: 'Ich habe die', terms: 'AGB', connector: 'und die', privacy: 'Datenschutzhinweise', suffix: 'gelesen und akzeptiere sie.' },
  ar: { phoneInvalid: 'يرجى إدخال رقم هاتف صالح.', legalRequired: 'يرجى الموافقة على الشروط وسياسة الخصوصية.', prefix: 'قرأت', terms: 'الشروط والأحكام', connector: 'و', privacy: 'سياسة الخصوصية', suffix: 'وأوافق عليهما.' },
  en: { phoneInvalid: 'Enter a valid phone number.', legalRequired: 'Accept the Terms and Privacy Policy to continue.', prefix: 'I have read and accept the', terms: 'Terms', connector: 'and', privacy: 'Privacy Policy', suffix: '.' },
} as const;

function RegisterInner() {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = AUTH_COPY[locale];
  const legalCopy = REGISTER_LEGAL_COPY[locale];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLegalError(null);
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    if (!normalizedName || !normalizedEmail || !password || !confirmPassword) return setError(copy.register.required);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setError(copy.register.invalidEmail);
    if (normalizedPhone && !/^\+?[0-9\s\-()]{6,20}$/.test(normalizedPhone)) return setError(legalCopy.phoneInvalid);
    if (password.length < 8 || password.length > 128) return setError(copy.register.weakPassword);
    if (password !== confirmPassword) return setError(copy.register.mismatch);
    if (!acceptedTerms) {
      setLegalError(legalCopy.legalRequired);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
          role: 'customer',
          acceptedTerms: true,
          termsVersion: CUSTOMER_TERMS_VERSION,
          privacyVersion: PRIVACY_NOTICE_VERSION,
          locale,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(extractErrorMessage(payload, copy.register.failed));
      setSuccess(true);
      window.setTimeout(() => router.push(`/auth/verify?email=${encodeURIComponent(normalizedEmail)}`), 650);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : copy.register.failed);
      setLoading(false);
    }
  }

  return (
    <AuthShell eyebrow={copy.register.eyebrow} title={copy.register.title} subtitle={copy.register.subtitle} wide>
      {error && <AuthAlert>{error}</AuthAlert>}
      {success && <AuthAlert tone="success">{copy.register.success}</AuthAlert>}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><FieldLabel>{copy.register.name}</FieldLabel><input className={authInputClass} name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} disabled={loading} /></label>
          <label className="block"><FieldLabel>{copy.login.email}</FieldLabel><input className={authInputClass} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" disabled={loading} /></label>
          <label className="block"><FieldLabel optional={copy.register.optional}>{copy.register.phone}</FieldLabel><input className={authInputClass} name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+49 …" disabled={loading} /></label>
          <label className="block"><FieldLabel>{copy.login.password}</FieldLabel><PasswordInput name="password" value={password} onChange={setPassword} shown={showPassword} onToggle={() => setShowPassword((value) => !value)} disabled={loading} label={showPassword ? copy.common.hidePassword : copy.common.showPassword} /></label>
          <label className="block"><FieldLabel>{copy.register.confirm}</FieldLabel><PasswordInput name="confirm-password" value={confirmPassword} onChange={setConfirmPassword} shown={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} disabled={loading} label={showConfirmPassword ? copy.common.hidePassword : copy.common.showPassword} /></label>
        </div>
        <div className={`rounded-2xl border p-4 ${legalError ? 'border-red-400/55 bg-red-500/10' : 'border-white/12 bg-white/[0.035]'}`}>
          <div className="flex items-start gap-3">
            <input id="register-legal-acceptance" type="checkbox" checked={acceptedTerms} onChange={(event) => { setAcceptedTerms(event.target.checked); if (event.target.checked) setLegalError(null); }} disabled={loading} aria-invalid={Boolean(legalError)} aria-describedby={legalError ? 'register-legal-error' : undefined} className="mt-0.5 size-6 shrink-0 rounded-md accent-[#E10600]" />
            <label htmlFor="register-legal-acceptance" className="text-sm leading-6 text-white/72">
              {legalCopy.prefix}{' '}
              <Link href="/legal/agb" target="_blank" rel="noreferrer" className="font-bold text-[#FFC107] underline-offset-4 hover:underline">{legalCopy.terms}</Link>{' '}
              {legalCopy.connector}{' '}
              <Link href="/legal/datenschutz" target="_blank" rel="noreferrer" className="font-bold text-[#FFC107] underline-offset-4 hover:underline">{legalCopy.privacy}</Link>{' '}
              {legalCopy.suffix}
            </label>
          </div>
          {legalError && <p id="register-legal-error" role="alert" className="mt-2 text-xs font-bold text-red-300">{legalError}</p>}
        </div>
        <button className={authPrimaryButtonClass} type="submit" disabled={loading || success}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? copy.common.loading : copy.register.submit}</button>
      </form>
      <p className="mt-6 text-center text-sm text-white/50">{copy.register.haveAccount}{' '}<Link href="/login" className="inline-flex min-h-11 items-center font-extrabold text-white hover:text-[#ff3b34] hover:underline">{copy.login.submit}</Link></p>
    </AuthShell>
  );
}

function PasswordInput({ name, value, onChange, shown, onToggle, disabled, label }: { name: string; value: string; onChange: (value: string) => void; shown: boolean; onToggle: () => void; disabled: boolean; label: string }) {
  return <span className="relative block"><input className={`${authInputClass} pe-14`} name={name} type={shown ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={value} onChange={(event) => onChange(event.target.value)} placeholder="••••••••" disabled={disabled} /><button type="button" onClick={onToggle} className="absolute end-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-white/45 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#E10600]" aria-label={label}>{shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span>;
}

export default function RegisterPage() {
  return <Suspense fallback={<div className="min-h-dvh bg-[#08090B]" />}><RegisterInner /></Suspense>;
}
