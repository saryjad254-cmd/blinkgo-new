import Link from 'next/link';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import { cookies } from 'next/headers';
import { AuthShell, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/AuthShell';

const MESSAGES = {
  de: {
    provider_disabled: ['Anmeldemethode nicht verfügbar', 'Diese Anmeldemethode ist derzeit nicht verfügbar. Nutze bitte E-Mail und Passwort.'],
    access_denied: ['Anmeldung abgebrochen', 'Du hast die Anmeldung beim Anbieter abgebrochen.'],
    default: ['Anmeldung fehlgeschlagen', 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut.'],
    eyebrow: 'Sichere Anmeldung', cta: 'Zur Anmeldung', home: 'Zur Startseite', subtitle: 'Du kannst sofort eine andere Anmeldemethode wählen.',
  },
  ar: {
    provider_disabled: ['طريقة الدخول غير متاحة', 'طريقة الدخول هذه غير متاحة حاليًا. استخدم البريد الإلكتروني وكلمة المرور.'],
    access_denied: ['تم إلغاء تسجيل الدخول', 'ألغيت تسجيل الدخول لدى مزود الخدمة.'],
    default: ['فشل تسجيل الدخول', 'تعذر إكمال تسجيل الدخول. حاول مرة أخرى.'],
    eyebrow: 'تسجيل دخول آمن', cta: 'العودة إلى الدخول', home: 'الصفحة الرئيسية', subtitle: 'يمكنك اختيار طريقة دخول أخرى الآن.',
  },
  en: {
    provider_disabled: ['Sign-in method unavailable', 'This sign-in method is currently unavailable. Please use email and password.'],
    access_denied: ['Sign-in cancelled', 'You cancelled sign-in with the provider.'],
    default: ['Sign-in failed', 'We could not complete sign-in. Please try again.'],
    eyebrow: 'Secure sign-in', cta: 'Back to sign in', home: 'Go to welcome', subtitle: 'You can choose another sign-in method right away.',
  },
} as const;

export const dynamic = 'force-dynamic';

export default async function OAuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const value = cookieStore.get('blinkgo-locale')?.value;
  const locale: keyof typeof MESSAGES = value === 'ar' || value === 'en' ? value : 'de';
  const copy = MESSAGES[locale];
  const key = params.error === 'provider_disabled' || params.error === 'access_denied' ? params.error : 'default';
  const [title, body] = copy[key];

  return (
    <AuthShell eyebrow={copy.eyebrow} title={title} subtitle={copy.subtitle}>
      <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-red-400/25 bg-red-500/10 text-red-300"><AlertTriangle className="h-8 w-8" aria-hidden="true" /></div>
      <p className="mb-7 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-white/65">{body}</p>
      <div className="space-y-3"><Link href="/login" className={authPrimaryButtonClass}>{copy.cta}</Link><Link href="/welcome" className={authSecondaryButtonClass}>{copy.home}</Link></div>
    </AuthShell>
  );
}
