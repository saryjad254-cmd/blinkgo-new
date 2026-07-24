'use client';

import { useEffect, useState } from 'react';
import { useT, useI18n } from '@/lib/i18n/I18nProvider';
import { CreditCard, Loader2, AlertTriangle, FlaskConical } from 'lucide-react';
import { formatCurrency } from '@/lib/i18n/format';

interface Props {
  orderId: string;
  amount: number;
  onSuccess?: () => void;
}

type Status = 'checking' | 'ready' | 'dev' | 'unconfigured';

// Per-locale error messages for the payment flow.
// All user-facing errors must respect the chosen language.
const ERROR_LABELS: Record<string, {
  checking: string;
  unconfiguredTitle: string;
  unconfiguredBody: () => string;
  stripeMissingKey: string;
  stripeNotConfigured: string;
  stripeJsLoadFailed: string;
  paymentFailed: string;
  paymentStartFailed: string;
  unknown: string;
  payNow: (amount: string) => string;
  processing: string;
}> = {
  de: {
    checking: 'Stripe wird geladen…',
    unconfiguredTitle: 'Stripe nicht konfiguriert',
    unconfiguredBody: () =>
      `Zahlungen sind vorübergehend nicht verfügbar. Bitte kontaktiere den Support.`,
    stripeMissingKey: 'Stripe Publishable Key fehlt',
    stripeNotConfigured: 'Stripe ist noch nicht konfiguriert. Bitte Admin kontaktieren.',
    stripeJsLoadFailed: 'Stripe.js konnte nicht geladen werden',
    paymentFailed: 'Zahlung fehlgeschlagen',
    paymentStartFailed: 'Zahlung konnte nicht gestartet werden',
    unknown: 'Unbekannter Fehler',
    payNow: (a) => `Jetzt ${a} € bezahlen`,
    processing: 'Wird verarbeitet…',
  },
  ar: {
    checking: 'جاري تحميل Stripe…',
    unconfiguredTitle: 'Stripe غير مُهيّأ',
    unconfiguredBody: () =>
      `الدفع غير متاح مؤقتاً. يرجى التواصل مع الدعم.`,
    stripeMissingKey: 'مفتاح Stripe العام مفقود',
    stripeNotConfigured: 'Stripe غير مُهيّأ. يرجى التواصل مع الأدمن.',
    stripeJsLoadFailed: 'تعذّر تحميل Stripe.js',
    paymentFailed: 'فشل الدفع',
    paymentStartFailed: 'تعذّر بدء الدفع',
    unknown: 'خطأ غير معروف',
    payNow: (a) => `ادفع الآن ${a} €`,
    processing: 'جاري المعالجة…',
  },
  en: {
    checking: 'Loading Stripe…',
    unconfiguredTitle: 'Stripe is not configured',
    unconfiguredBody: () =>
      `Payments are temporarily unavailable. Please contact support.`,
    stripeMissingKey: 'Stripe publishable key is missing',
    stripeNotConfigured: 'Stripe is not configured yet. Please contact the admin.',
    stripeJsLoadFailed: 'Could not load Stripe.js',
    paymentFailed: 'Payment failed',
    paymentStartFailed: 'Could not start the payment',
    unknown: 'Unknown error',
    payNow: (a) => `Pay ${a} € now`,
    processing: 'Processing…',
  },
};

export function StripeCheckout({ orderId, amount, onSuccess }: Props) {
  const t = useT();
  const { locale } = useI18n();
  const E = ERROR_LABELS[locale] || ERROR_LABELS.de;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('checking');
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    fetch('/api/stripe/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.mode === 'stripe') setStatus('ready');
        else if (d.mode === 'dev') setStatus('dev');
        else setStatus('unconfigured');
      })
      .catch(() => setStatus('unconfigured'));
  }, []);

  async function handlePay() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();

      if (!data.ok) {
        if (data.needsKeys) {
          setError(
            data.devPaymentAvailable
              ? (locale === 'ar'
                  ? 'Stripe غير مُهيّأ. وضع التطوير متاح أدناه.'
                  : locale === 'en'
                  ? 'Stripe is not configured yet. DEV MODE is offered below.'
                  : 'Stripe ist noch nicht konfiguriert. DEV MODE wird unten angeboten.')
              : E.stripeNotConfigured
          );
        } else {
          setError(data.error || E.paymentStartFailed);
        }
        setLoading(false);
        return;
      }

      // Dev-mode success path
      if (data.mode === 'dev' && data.mock) {
        setPaid(true);
        onSuccess?.();
        setLoading(false);
        return;
      }

      // Real Stripe path
      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        setError(E.stripeMissingKey);
        setLoading(false);
        return;
      }

      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(publishableKey);
      if (!stripe) {
        setError(E.stripeJsLoadFailed);
        setLoading(false);
        return;
      }

      const result = await stripe.confirmPayment({
        clientSecret: data.clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });

      if (result.error) {
        setError(result.error.message || E.paymentFailed);
      } else {
        onSuccess?.();
      }
    } catch (e: any) {
      setError(e.message || E.unknown);
    } finally {
      setLoading(false);
    }
  }

  if (status === 'checking') {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        {E.checking}
      </div>
    );
  }

  // ─── DEV MODE (no Stripe keys, ENABLE_DEV_PAYMENT=true) ───
  if (status === 'dev') {
    if (paid) {
      return (
        <div className="bg-success/10 border border-success/30 rounded-md p-3">
          <p className="text-sm font-semibold text-success">
            {t.dev.simulatedSuccess}
          </p>
        </div>
      );
    }
    return (
      <div className="bg-warning/10 border-2 border-warning/40 rounded-md p-3 space-y-3">
        <div className="flex items-start gap-2">
          <FlaskConical className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-warning flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-warning/20 rounded text-xs uppercase tracking-wide">
                {t.dev.badge}
              </span>
              {t.dev.simulatedTitle}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {t.dev.simulatedDesc}
            </p>
            <p className="text-xs text-text-muted mt-1 italic">
              {t.dev.whatHappens}
            </p>
          </div>
        </div>
        <button
          onClick={handlePay}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-warning text-bg-base font-bold rounded-md shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {t.dev.simulating}
            </>
          ) : (
            <>
              <FlaskConical className="w-5 h-5" />
              {t.dev.simulate} ({formatCurrency(amount, locale)})
            </>
          )}
        </button>
        <p className="text-xs text-warning/80 text-center">{t.dev.warning}</p>
        {error ? (
          <div className="flex items-center gap-2 p-2 bg-danger/10 border border-danger/30 rounded">
            <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        ) : null}
      </div>
    );
  }

  // ─── UNCONFIGURED (no Stripe, no dev mode) ───
  if (status === 'unconfigured') {
    return (
      <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning">{E.unconfiguredTitle}</p>
            <p className="text-xs text-text-muted mt-1">
              {E.unconfiguredBody()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── READY (real Stripe) ───
  return (
    <div>
      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-speed-gradient text-white font-bold rounded-md shadow-speed hover:shadow-speed-lg hover:-translate-y-0.5 transition-all disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {E.processing}
          </>
        ) : (
          <>
            <CreditCard className="w-5 h-5" />
            {E.payNow(amount.toFixed(2))}
          </>
        )}
      </button>
      {error ? (
        <div className="mt-3 flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-md">
          <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
