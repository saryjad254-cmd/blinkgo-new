'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Copy from 'lucide-react/dist/esm/icons/copy';
import KeyRound from 'lucide-react/dist/esm/icons/key-round';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import { AuthShell, authInputClass, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/AuthShell';
import { createBrowserClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/I18nProvider';

type Mode = 'loading' | 'enroll' | 'challenge' | 'verified' | 'local' | 'error';

const COPY = {
  de: { eyebrow: 'BlinkGo Admin Security', title: 'Zwei-Faktor-Schutz', intro: 'Für Verwaltung, Finanzen und personenbezogene Daten ist ein zweiter Faktor verpflichtend.', loading: 'Sicherheitsstatus wird geprüft…', enroll: 'Authenticator verbinden', enrollBody: 'Scanne den QR-Code mit einer Authenticator-App und gib anschließend den sechsstelligen Code ein.', challenge: 'Identität bestätigen', challengeBody: 'Gib den aktuellen sechsstelligen Code aus deiner Authenticator-App ein.', code: 'Sicherheitscode', verify: 'Sicher bestätigen', verifying: 'Wird geprüft…', secret: 'Manueller Schlüssel', copied: 'Schlüssel kopiert', invalid: 'Bitte gib einen gültigen sechsstelligen Code ein.', failed: 'Der Code konnte nicht bestätigt werden. Prüfe die Uhrzeit deines Geräts und versuche es erneut.', unavailable: 'Der Sicherheitsdienst ist momentan nicht erreichbar. Der Adminbereich bleibt gesperrt.', local: 'Lokale Vorschau', localBody: 'MFA wird in der lokalen Testumgebung nicht erzwungen. In Produktion ist AAL2 standardmäßig erforderlich.', back: 'Zur Admin-Vorschau', logout: 'Abmelden', success: 'Bestätigung erfolgreich. Weiterleitung…' },
  en: { eyebrow: 'BlinkGo Admin Security', title: 'Two-factor protection', intro: 'A second factor is mandatory for administration, finance and personal data.', loading: 'Checking security status…', enroll: 'Connect authenticator', enrollBody: 'Scan the QR code with an authenticator app, then enter the six-digit code.', challenge: 'Confirm your identity', challengeBody: 'Enter the current six-digit code from your authenticator app.', code: 'Security code', verify: 'Verify securely', verifying: 'Verifying…', secret: 'Manual setup key', copied: 'Key copied', invalid: 'Enter a valid six-digit code.', failed: 'The code could not be verified. Check your device time and try again.', unavailable: 'The security service is currently unavailable. Admin access remains locked.', local: 'Local preview', localBody: 'MFA is not enforced in the local test environment. Production requires AAL2 by default.', back: 'Back to admin preview', logout: 'Sign out', success: 'Verification complete. Redirecting…' },
  ar: { eyebrow: 'أمان إدارة BlinkGo', title: 'حماية بخطوتين', intro: 'العامل الثاني إلزامي للوصول إلى الإدارة والمال والبيانات الشخصية.', loading: 'جارٍ التحقق من مستوى الأمان…', enroll: 'ربط تطبيق المصادقة', enrollBody: 'امسح رمز QR بواسطة تطبيق مصادقة، ثم أدخل الرمز المؤلف من ستة أرقام.', challenge: 'تأكيد هويتك', challengeBody: 'أدخل الرمز الحالي المؤلف من ستة أرقام من تطبيق المصادقة.', code: 'رمز الأمان', verify: 'تأكيد آمن', verifying: 'جارٍ التحقق…', secret: 'مفتاح الإعداد اليدوي', copied: 'تم نسخ المفتاح', invalid: 'أدخل رمزاً صحيحاً من ستة أرقام.', failed: 'تعذر تأكيد الرمز. تحقق من وقت جهازك وحاول مجدداً.', unavailable: 'خدمة الأمان غير متاحة حالياً، وستبقى الإدارة مقفلة.', local: 'معاينة محلية', localBody: 'لا يُفرض MFA في بيئة الاختبار المحلية. في الإنتاج يصبح مستوى AAL2 إلزامياً افتراضياً.', back: 'العودة إلى معاينة الإدارة', logout: 'تسجيل الخروج', success: 'تم التأكيد بنجاح، جارٍ التحويل…' },
} as const;

function safeRedirect(value: string | null) {
  return value && value.startsWith('/admin') && !value.startsWith('//') ? value : '/admin';
}

export function MfaClient() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const router = useRouter();
  const params = useSearchParams();
  const destination = safeRedirect(params.get('redirect'));
  const supabase = useMemo(() => createBrowserClient(), []);
  const started = useRef(false);
  const [mode, setMode] = useState<Mode>('loading');
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENFORCE_ADMIN_MFA !== 'true') {
      queueMicrotask(() => setMode('local'));
      return;
    }
    void (async () => {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || !assurance.data) return setMode('error');
      if (assurance.data.currentLevel === 'aal2') {
        setMode('verified');
        router.replace(destination);
        return;
      }
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) return setMode('error');
      const verifiedFactor = factors.data.totp.find((factor) => factor.status === 'verified');
      if (verifiedFactor) {
        setFactorId(verifiedFactor.id);
        setMode('challenge');
        return;
      }
      const enrollment = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'BlinkGo Admin' });
      if (enrollment.error) return setMode('error');
      setFactorId(enrollment.data.id);
      setQr(enrollment.data.totp.qr_code);
      setSecret(enrollment.data.totp.secret);
      setMode('enroll');
    })();
  }, [destination, router, supabase]);

  async function verify() {
    if (!/^\d{6}$/.test(code)) return setMessage(copy.invalid);
    setBusy(true); setMessage('');
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) { setBusy(false); return setMessage(copy.failed); }
    const result = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    setBusy(false);
    if (result.error) return setMessage(copy.failed);
    setMode('verified'); setMessage(copy.success);
    router.replace(destination); router.refresh();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login'); router.refresh();
  }

  return (
    <AuthShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.intro}>
      <div className="mb-6 grid size-16 place-items-center rounded-2xl border border-[#FFC107]/25 bg-gradient-to-br from-[#FFC107]/18 to-[#E10600]/18 text-[#FFC107] shadow-[0_12px_40px_rgba(225,6,0,.18)]"><ShieldCheck className="size-8" aria-hidden /></div>

      {mode === 'loading' && <p className="flex min-h-32 items-center justify-center gap-2 text-sm font-bold text-zinc-300"><Loader2 className="size-5 animate-spin" />{copy.loading}</p>}
      {mode === 'local' && <div className="rounded-2xl border border-[#ffc107]/30 bg-[#ffc107]/10 p-4"><h2 className="font-black text-[#ffc107]">{copy.local}</h2><p className="mt-2 text-sm leading-6 text-zinc-300">{copy.localBody}</p><Link href={destination} className={`${authPrimaryButtonClass} mt-4`}>{copy.back}</Link></div>}
      {mode === 'error' && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold leading-6 text-red-200" role="alert">{copy.unavailable}</div>}
      {(mode === 'enroll' || mode === 'challenge') && <div className="space-y-5">
        <div><h2 className="text-xl font-black">{mode === 'enroll' ? copy.enroll : copy.challenge}</h2><p className="mt-1 text-sm leading-6 text-zinc-400">{mode === 'enroll' ? copy.enrollBody : copy.challengeBody}</p></div>
        {mode === 'enroll' && qr && <div className="rounded-2xl bg-white p-4"><Image src={qr} alt="Authenticator QR code" width={256} height={256} unoptimized className="mx-auto aspect-square w-full max-w-64" /></div>}
        {mode === 'enroll' && secret && <div className="rounded-2xl border border-white/10 bg-black/30 p-3"><p className="text-xs font-bold text-zinc-400">{copy.secret}</p><div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs text-[#ffc107]">{secret}</code><button type="button" onClick={async () => { await navigator.clipboard.writeText(secret); setMessage(copy.copied); }} className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 hover:bg-white/10" aria-label={copy.copied}><Copy className="size-4" /></button></div></div>}
        <label className="block text-sm font-bold text-zinc-300">{copy.code}<span className="relative mt-2 block"><KeyRound className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" /><input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className={`${authInputClass} ps-12 pe-4 text-center text-xl font-black tracking-[.35em]`} /></span></label>
        {message && <p className="rounded-xl bg-white/5 p-3 text-sm font-bold text-zinc-200" role="status">{message}</p>}
        <button type="button" onClick={verify} disabled={busy} className={authPrimaryButtonClass}>{busy && <Loader2 className="size-4 animate-spin" />}{busy ? copy.verifying : copy.verify}</button>
      </div>}
      {mode === 'verified' && <p className="text-center font-bold text-emerald-400" role="status">{copy.success}</p>}
      <button type="button" onClick={logout} className={`${authSecondaryButtonClass} mt-6`}><LogOut className="size-4" />{copy.logout}</button>
    </AuthShell>
  );
}
