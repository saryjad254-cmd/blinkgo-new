'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, CheckCircle, AlertCircle, Loader2, RefreshCw, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';

// Render this page only on the client to avoid hydration mismatches
// (it uses useSearchParams, browser history, etc.)
const VerifyContent = dynamic(() => Promise.resolve(VerifyContentInner), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-brand-red-500 animate-spin" />
    </div>
  ),
});

const COPY: Record<string, any> = {
  de: {
    title: 'E-Mail bestätigen',
    subtitle: 'Wir haben einen 6-stelligen Code an deine E-Mail gesendet',
    enterCode: 'Bestätigungscode eingeben',
    codePh: '000000',
    verify: 'Bestätigen',
    verifying: 'Wird überprüft…',
    resend: 'Code erneut senden',
    resendIn: 'Erneut senden in {n}s',
    noCode: 'Code nicht erhalten?',
    checkSpam: 'Prüfe deinen Spam-/Werbung-Ordner. Die E-Mail kommt von BlinkGo. Du kannst auch unten auf "Code anzeigen" klicken.',
    wrongCode: 'Falscher Code. Bitte versuche es erneut.',
    expiredCode: 'Code abgelaufen. Bitte fordere einen neuen an.',
    success: 'E-Mail erfolgreich bestätigt!',
    successDesc: 'Du wirst weitergeleitet…',
    devHint: 'Dev-Modus: Code wird in der Konsole angezeigt',
    back: 'Zurück zur Anmeldung',
    needHelp: 'Brauchst du Hilfe?',
    contactSupport: 'Support kontaktieren',
  },
  ar: {
    title: 'تأكيد البريد الإلكتروني',
    subtitle: 'أرسلنا رمزاً مكوناً من 6 أرقام إلى بريدك',
    enterCode: 'أدخل رمز التأكيد',
    codePh: '000000',
    verify: 'تأكيد',
    verifying: 'جاري التحقق…',
    resend: 'إعادة إرسال الرمز',
    resendIn: 'إعادة الإرسال خلال {n} ثانية',
    noCode: 'لم يصلك الرمز؟',
    checkSpam: 'تحقق من مجلد البريد العشوائي (Spam). الإيميل من BlinkGo. أو اضغط على "إظهار الرمز" أدناه.',
    wrongCode: 'رمز خاطئ. حاول مرة أخرى.',
    expiredCode: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.',
    success: 'تم تأكيد البريد الإلكتروني بنجاح!',
    successDesc: 'جاري التحويل…',
    devHint: 'وضع التطوير: الرمز يظهر في الكونسول',
    back: 'العودة لتسجيل الدخول',
    needHelp: 'تحتاج مساعدة؟',
    contactSupport: 'تواصل مع الدعم',
  },
  en: {
    title: 'Verify your email',
    subtitle: 'We sent a 6-digit code to your email',
    enterCode: 'Enter verification code',
    codePh: '000000',
    verify: 'Verify',
    verifying: 'Verifying…',
    resend: 'Resend code',
    resendIn: 'Resend in {n}s',
    noCode: "Didn't receive the code?",
    checkSpam: 'Check your spam/junk folder. Email is from BlinkGo. Or click "Show code" below.',
    wrongCode: 'Wrong code. Please try again.',
    expiredCode: 'Code expired. Please request a new one.',
    success: 'Email verified successfully!',
    successDesc: 'Redirecting…',
    devHint: 'Dev mode: code shown in console',
    back: 'Back to login',
    needHelp: 'Need help?',
    contactSupport: 'Contact support',
  },
};

function VerifyContentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, setLocale } = useI18n();
  const curLocale = locale || 'de';
  const t = COPY[curLocale] || COPY.de;
  const email = searchParams.get('email') || '';
  const dir = curLocale === 'ar' ? 'rtl' : 'ltr';
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight;

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  // Focus first input on mount (client-side only, avoids hydration mismatch)
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Fallback: if email fails to deliver, user can request the code here.
  // In production with real SMTP, this should ideally not be needed.
  // We do NOT auto-show or auto-fill the code on page load - the user
  // should always check their email first. This endpoint is only
  // accessible after the user explicitly clicks "I didn't receive the code".
  const fetchOtp = async () => {
    if (!email) return;
    try {
      const res = await fetch(`/api/auth/get-otp?email=${encodeURIComponent(email)}`, { method: 'GET' });
      const data = await res.json();
      if (res.ok && data.ok && data.otp) {
        setOtpHint(data.otp);
        // Don't auto-fill - just store it for display
      } else {
        setOtpHint(null);
      }
    } catch (e) {
      // ignore
    }
  };

  // Show the OTP hint only after user explicitly clicks the link
  const [showOtpFallback, setShowOtpFallback] = useState(false);
  const handleShowOtp = async () => {
    setShowOtpFallback(true);
    await fetchOtp();
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError(null);

    // Auto-focus next
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || '';
    }
    setCode(newCode);
    if (pasted.length === 6) {
      inputRefs.current[5]?.focus();
    }
  };

  const verifyCode = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setError(t.wrongCode);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: fullCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error?.includes('expired') || data.error?.includes('abgelaufen')) {
          setError(t.expiredCode);
        } else {
          setError(t.wrongCode);
        }
        return;
      }
      setSuccess(true);
      // Pass the verified email + a friendly flag to /login so the user is
      // pre-filled and shown a success banner before they reach the dashboard.
      // Auto-sign-in is not possible here because the registration password
      // is not retained in client state (security best practice).
      setTimeout(() => {
        const params = new URLSearchParams({ email, verified: '1' });
        router.push(`/login?${params.toString()}`);
      }, 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResendCooldown(60);
        setOtpHint(null);
        // Try to fetch the new code (in no-SMTP mode)
        setTimeout(() => {
          fetchOtp();
        }, 500);
      }
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden" dir={dir}>
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-red-500/15 blur-[100px]" />
        <div className="absolute bottom-0 end-0 w-[400px] h-[400px] rounded-full bg-brand-yellow-500/15 blur-[100px]" />
      </div>

      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-red-600 via-accent-500 to-brand-red-600 z-50" />

      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-red-500 to-brand-yellow-500 flex items-center justify-center shadow-speed-md group-hover:scale-105 transition-transform">
            <span className="text-white font-extrabold text-lg">B</span>
          </div>
          <span className="font-black italic uppercase tracking-tighter text-text text-lg">
            <span className="text-text">Blink</span>
            <span className="text-brand-red-500">Go</span>
          </span>
        </Link>

        <div className="w-full max-w-md card-glass p-6 sm:p-8">
          {success ? (
            <div className="text-center py-8">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-success/20 blur-xl" />
                <div className="relative w-full h-full rounded-full bg-success/10 border-2 border-success/30 flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-success" strokeWidth={2.5} />
                </div>
              </div>
              <h1 className="text-2xl font-extrabold text-text mb-2">{t.success}</h1>
              <p className="text-text-secondary text-sm mb-6">{t.successDesc}</p>
              <button
                onClick={() => {
                  const params = new URLSearchParams({ email, verified: '1' });
                  router.push(`/login?${params.toString()}`);
                }}
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-brand-red-500 to-brand-red-600 hover:from-brand-red-600 hover:to-brand-red-700 text-white font-extrabold text-sm shadow-speed-glow active:scale-95 transition-all"
              >
                {curLocale === 'ar' ? 'تسجيل الدخول الآن' : curLocale === 'en' ? 'Sign in now' : 'Jetzt anmelden'}
                <Arrow className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full bg-brand-red-500/20 blur-xl" />
                  <div className="relative w-full h-full rounded-full bg-brand-red-500/10 border-2 border-brand-red-500/30 flex items-center justify-center">
                    <Mail className="w-8 h-8 text-brand" strokeWidth={2} />
                  </div>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-text mb-2">{t.title}</h1>
                <p className="text-text-secondary text-sm">
                  {t.subtitle}
                  {email && (
                    <span className="block text-text font-bold mt-1" dir="ltr">{email}</span>
                  )}
                </p>
                {email && (
                  <p className="text-xs text-text-muted mt-2">
                    {curLocale === 'ar' ? (
                      <>إيميل خاطئ؟ <Link href="/register" className="text-brand-red-500 hover:underline font-bold">غيّر الإيميل</Link></>
                    ) : curLocale === 'en' ? (
                      <>Wrong email? <Link href="/register" className="text-brand-red-500 hover:underline font-bold">Change it</Link></>
                    ) : (
                      <>Falsche E-Mail? <Link href="/register" className="text-brand-red-500 hover:underline font-bold">Hier ändern</Link></>
                    )}
                  </p>
                )}
              </div>

              {/* OTP Input */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 text-center">
                  {t.enterCode}
                </label>
                <div className="flex items-center justify-center gap-2 sm:gap-3" dir="ltr" onPaste={handlePaste}>
                  {code.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      disabled={loading}
                      suppressHydrationWarning
                      className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-extrabold rounded-xl bg-ink-700 border-2 border-edge text-text caret-brand-500 focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all disabled:opacity-50 [&:-webkit-autofill]:bg-ink-700 [&:-webkit-autofill]:[-webkit-text-fill-color:#FFFFFF]"
                      style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
                    />
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 flex items-start gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              {/* Verify button */}
              <button
                onClick={verifyCode}
                disabled={loading || code.join('').length !== 6}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-brand-red-500 to-brand-red-600 hover:from-brand-red-600 hover:to-brand-red-700 text-white font-extrabold text-sm shadow-speed-glow active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.verifying}
                  </>
                ) : (
                  <>
                    {t.verify}
                    <Arrow className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Resend */}
              <div className="mt-6 text-center">
                <p className="text-xs text-text-muted mb-2">{t.noCode}</p>
                <p className="text-xs text-text-muted mb-3">{t.checkSpam}</p>
                <button
                  onClick={resendCode}
                  disabled={resendCooldown > 0}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-red-500 hover:text-brand-red-400 transition-colors disabled:text-text-muted disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {resendCooldown > 0 ? t.resendIn.replace('{n}', String(resendCooldown)) : t.resend}
                </button>
              </div>

              {/* Fallback link: user clicks if email didn't arrive */}
              {!showOtpFallback && !otpHint && (
                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={handleShowOtp}
                    className="text-xs text-text-muted hover:text-text underline underline-offset-4 transition-colors"
                  >
                    {curLocale === 'ar'
                      ? 'لم يصلني الرمز؟ اضغط هنا'
                      : curLocale === 'en'
                      ? "Didn't get the code? Click here"
                      : 'Code nicht erhalten? Hier klicken'}
                  </button>
                </div>
              )}

              {/* Fallback shown when user clicks: display the code so they can copy it */}
              {showOtpFallback && otpHint && (
                <div className="mt-5 p-4 rounded-2xl bg-warning/10 border-2 border-warning/30 text-center">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-warning mb-1.5">
                    {curLocale === 'ar' ? 'رمز التحقق' : curLocale === 'en' ? 'Verification code' : 'Bestätigungscode'}
                  </p>
                  <p
                    className="text-3xl font-black text-text tracking-[0.4em] tabular-nums select-all"
                    dir="ltr"
                  >
                    {otpHint}
                  </p>
                  <p className="text-[10px] text-text-muted mt-2">
                    {curLocale === 'ar'
                      ? 'إذا لم يصلك الإيميل، انسخ الرمز من هنا.'
                      : curLocale === 'en'
                      ? "If the email didn't arrive, copy the code from here."
                      : 'Falls die E-Mail nicht angekommen ist, Code hier kopieren.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <Link href="/login" className="mt-6 text-sm text-text-muted hover:text-text transition-colors">
          ← {t.back}
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-ink-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-red-500 animate-spin" />
      </div>
    }>
      <VerifyContentInner />
    </Suspense>
  );
}