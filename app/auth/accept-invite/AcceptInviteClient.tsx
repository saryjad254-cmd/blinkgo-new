'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import KeyRound from 'lucide-react/dist/esm/icons/key-round';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { AuthAlert, AuthShell, authInputClass, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/AuthShell';
import { createBrowserClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/I18nProvider';

type Status = 'checking' | 'ready' | 'saving' | 'success' | 'invalid';

const COPY = {
  de: { eyebrow: 'Sichere Einladung', title: 'BlinkGo-Konto aktivieren', subtitle: 'Lege dein persönliches Passwort fest. BlinkGo-Mitarbeiter können es weder sehen noch abrufen.', checking: 'Einladung wird sicher geprüft…', password: 'Neues Passwort', confirm: 'Passwort wiederholen', hint: 'Mindestens 12 Zeichen, mit Groß-/Kleinbuchstaben, Zahl und Sonderzeichen.', submit: 'Konto sicher aktivieren', mismatch: 'Die Passwörter stimmen nicht überein.', weak: 'Das Passwort erfüllt die Sicherheitsanforderungen noch nicht.', failed: 'Die Aktivierung konnte nicht abgeschlossen werden. Bitte fordere eine neue Einladung an.', invalid: 'Diese Einladung ist ungültig oder abgelaufen.', back: 'Zur Anmeldung', success: 'Dein Passwort wurde gespeichert. Du kannst dich jetzt anmelden.' },
  en: { eyebrow: 'Secure invitation', title: 'Activate your BlinkGo account', subtitle: 'Choose your personal password. BlinkGo staff can never see or retrieve it.', checking: 'Securely checking invitation…', password: 'New password', confirm: 'Repeat password', hint: 'At least 12 characters with upper/lowercase letters, a number and a symbol.', submit: 'Activate account securely', mismatch: 'The passwords do not match.', weak: 'The password does not yet meet the security requirements.', failed: 'Activation could not be completed. Request a new invitation.', invalid: 'This invitation is invalid or has expired.', back: 'Go to sign in', success: 'Your password has been saved. You can now sign in.' },
  ar: { eyebrow: 'دعوة آمنة', title: 'فعّل حسابك في BlinkGo', subtitle: 'اختر كلمة مرورك الشخصية. لا يستطيع موظفو BlinkGo رؤيتها أو استعادتها.', checking: 'جارٍ التحقق الآمن من الدعوة…', password: 'كلمة المرور الجديدة', confirm: 'تأكيد كلمة المرور', hint: '12 محرفًا على الأقل، مع أحرف كبيرة وصغيرة ورقم ورمز.', submit: 'تفعيل الحساب بأمان', mismatch: 'كلمتا المرور غير متطابقتين.', weak: 'كلمة المرور لا تستوفي متطلبات الأمان بعد.', failed: 'تعذر إكمال التفعيل. اطلب دعوة جديدة.', invalid: 'هذه الدعوة غير صالحة أو انتهت صلاحيتها.', back: 'الذهاب إلى تسجيل الدخول', success: 'تم حفظ كلمة مرورك. يمكنك تسجيل الدخول الآن.' },
} as const;

const strongPassword = (value: string) => value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

export function AcceptInviteClient() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const supabase = useMemo(() => createBrowserClient(), []);
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    const timeout = window.setTimeout(() => { if (live) setStatus('invalid'); }, 5000);
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (live && data.session) setStatus('ready');
    };
    void check();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live && session) setStatus('ready');
    });
    return () => { live = false; window.clearTimeout(timeout); listener.subscription.unsubscribe(); };
  }, [supabase]);

  async function activate(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    if (password !== confirm) return setMessage(copy.mismatch);
    if (!strongPassword(password)) return setMessage(copy.weak);
    setStatus('saving');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setStatus('ready'); setMessage(copy.failed); return; }
    await supabase.auth.signOut({ scope: 'local' });
    setStatus('success');
  }

  return (
    <AuthShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle}>
      {status === 'checking' && <div className="flex min-h-40 items-center justify-center gap-3 text-white/70"><Loader2 className="size-5 animate-spin" aria-hidden="true" /><span>{copy.checking}</span></div>}
      {status === 'invalid' && <div className="space-y-5"><AuthAlert tone="error">{copy.invalid}</AuthAlert><Link href="/login" className={authSecondaryButtonClass}>{copy.back}</Link></div>}
      {status === 'success' && <div className="space-y-5"><AuthAlert tone="success"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-5" aria-hidden="true" />{copy.success}</span></AuthAlert><Link href="/login" className={authPrimaryButtonClass}>{copy.back}</Link></div>}
      {(status === 'ready' || status === 'saving') && (
        <form onSubmit={activate} className="space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-bold">{copy.password}</span><input className={authInputClass} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} disabled={status === 'saving'} /></label>
          <label className="block"><span className="mb-2 block text-sm font-bold">{copy.confirm}</span><input className={authInputClass} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={12} disabled={status === 'saving'} /></label>
          <p className="text-xs leading-5 text-white/55">{copy.hint}</p>
          {message && <AuthAlert tone="error">{message}</AuthAlert>}
          <button type="submit" disabled={status === 'saving'} className={authPrimaryButtonClass}>{status === 'saving' ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <KeyRound className="size-5" aria-hidden="true" />}{copy.submit}</button>
        </form>
      )}
    </AuthShell>
  );
}
