'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import CreditCard from 'lucide-react/dist/esm/icons/credit-card';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';

interface Props {
  orderId: string;
  amount: number;
  onSuccess?: () => void;
}

type Status = 'checking' | 'ready' | 'unconfigured';

// Per-locale error messages for the payment flow.
const ERROR_LABELS: Record<string, {
  checking: string;
  unconfiguredTitle: string;
  unconfiguredBody: () => string;
  stripeMissingKey: string;
  stripeJsLoadFailed: string;
  paymentFailed: string;
  paymentStartFailed: string;
  retryingIn: (s: number) => string;
  retryingButton: string;
  payNow: (amount: string) => string;
  processing: string;
  unknown: string;
}> = {
  de: {
    checking: 'Stripe wird geladen…',
    unconfiguredTitle: 'Stripe nicht konfiguriert',
    unconfiguredBody: () => `Zahlungen sind vorübergehend nicht verfügbar. Bitte kontaktiere den Support.`,
    stripeMissingKey: 'Stripe Publishable Key fehlt',
    stripeJsLoadFailed: 'Stripe.js konnte nicht geladen werden',
    paymentFailed: 'Zahlung fehlgeschlagen',
    paymentStartFailed: 'Zahlung konnte nicht gestartet werden',
    retryingIn: (s) => `Erneuter Versuch in ${s} s…`,
    retryingButton: 'Jetzt erneut versuchen',
    payNow: (a) => `Jetzt ${a} € bezahlen`,
    processing: 'Wird verarbeitet…',
    unknown: 'Unbekannter Fehler',
  },
  ar: {
    checking: 'جاري تحميل Stripe…',
    unconfiguredTitle: 'Stripe غير مُهيّأ',
    unconfiguredBody: () => `الدفع غير متاح مؤقتاً. يرجى التواصل مع الدعم.`,
    stripeMissingKey: 'مفتاح Stripe العام مفقود',
    stripeJsLoadFailed: 'تعذّر تحميل Stripe.js',
    paymentFailed: 'فشل الدفع',
    paymentStartFailed: 'تعذّر بدء الدفع',
    retryingIn: (s) => `إعادة المحاولة خلال ${s} ثانية…`,
    retryingButton: 'حاول الآن',
    payNow: (a) => `ادفع الآن ${a} €`,
    processing: 'جاري المعالجة…',
    unknown: 'خطأ غير معروف',
  },
  en: {
    checking: 'Loading Stripe…',
    unconfiguredTitle: 'Stripe is not configured',
    unconfiguredBody: () => `Payments are temporarily unavailable. Please contact support.`,
    stripeMissingKey: 'Stripe publishable key is missing',
    stripeJsLoadFailed: 'Could not load Stripe.js',
    paymentFailed: 'Payment failed',
    paymentStartFailed: 'Could not start the payment',
    retryingIn: (s) => `Retrying in ${s} s…`,
    retryingButton: 'Retry now',
    payNow: (a) => `Pay ${a} € now`,
    processing: 'Processing…',
    unknown: 'Unknown error',
  },
};

/**
 * Maximum number of automatic retries on transient errors (network,
 * Stripe 5xx). After `MAX_RETRIES` the user must press the button again.
 */
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 800;

export function StripeCheckout({ orderId, amount, onSuccess }: Props) {
  const { locale } = useI18n();
  const E = ERROR_LABELS[locale] || ERROR_LABELS.de;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('checking');
  const [attempt, setAttempt] = useState(0);
  const [retryIn, setRetryIn] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/stripe/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.mode === 'stripe') setStatus('ready');
        else setStatus('unconfigured');
      })
      .catch(() => setStatus('unconfigured'));
  }, []);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const isTransientError = useCallback((msg: string | null | undefined): boolean => {
    if (!msg) return false;
    const m = msg.toLowerCase();
    return (
      m.includes('network') ||
      m.includes('timeout') ||
      m.includes('failed to fetch') ||
      m.includes('502') ||
      m.includes('503') ||
      m.includes('504') ||
      m.includes('try again') ||
      m.includes('temporarily')
    );
  }, []);

  async function startPayment() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || E.paymentStartFailed);
      }

      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        throw new Error(E.stripeMissingKey);
      }

      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(publishableKey);
      if (!stripe) {
        throw new Error(E.stripeJsLoadFailed);
      }

      const result = await stripe.confirmPayment({
        clientSecret: data.clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });

      if (result.error) {
        throw new Error(result.error.message || E.paymentFailed);
      }
      onSuccess?.();
      setError(null);
    } catch (e: any) {
      const msg = (e?.message as string) || E.unknown;
      setError(msg);
      // Auto-retry transient errors with exponential backoff.
      if (isTransientError(msg) && attempt < MAX_RETRIES - 1) {
        const next = attempt + 1;
        setAttempt(next);
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt);
        setRetryIn(Math.ceil(delay / 1000));
        retryTimerRef.current = setTimeout(() => {
          setRetryIn(0);
          void startPayment();
        }, delay);
      }
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

  if (status === 'unconfigured') {
    return (
      <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning">{E.unconfiguredTitle}</p>
            <p className="text-xs text-text-muted mt-1">{E.unconfiguredBody()}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={startPayment}
        disabled={loading || retryIn > 0}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-speed-gradient text-white font-bold rounded-md shadow-speed hover:shadow-speed-lg hover:-translate-y-0.5 transition-all disabled:opacity-50"
      >
        {loading || retryIn > 0 ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {retryIn > 0 ? E.retryingIn(retryIn) : E.processing}
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
          <div className="flex-1">
            <p className="text-sm text-danger">{error}</p>
            {isTransientError(error) && attempt >= MAX_RETRIES - 1 ? (
              <button
                onClick={() => {
                  setAttempt(0);
                  void startPayment();
                }}
                className="mt-1 text-xs text-danger underline"
              >
                {E.retryingButton}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
