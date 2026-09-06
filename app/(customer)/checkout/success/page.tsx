'use client';

/**
 * Checkout Success Page — Phase 7G-A
 * ──────────────────────────────────────────────────
 * Handles the return from Stripe payment (3DS / redirect-based methods).
 *
 * Flow:
 *   1. Stripe redirects here with ?payment_intent=pi_xxx&payment_intent_client_secret=...
 *   2. We poll /api/checkout/confirm?draft_id=... until the order is created
 *   3. Once the order is created, we clear the cart and redirect to /orders/[id]
 *
 * Polling is necessary because the webhook may take a few hundred ms to fire
 * after Stripe's redirect.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import { createBrowserClient } from '@/lib/supabase/client';
import { useCart } from '@/lib/cart-store';
import { useTranslations } from '@/lib/i18n/I18nProvider';

type Status = 'polling' | 'order_created' | 'pending' | 'paid' | 'failed' | 'canceled' | 'requires_action' | 'awaiting_payment_method' | 'expired' | 'timeout';

const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 1500;

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const translate = useTranslations();
  const clearCart = useCart((s) => s.clear);

  const [status, setStatus] = useState<Status>('polling');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    const paymentIntent = searchParams.get('payment_intent');
    const draftId = sessionStorage.getItem('blinkgo_last_draft_id');
    if (!paymentIntent || !draftId) {
      // No payment intent or draft id — back to home
      router.replace('/');
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      pollCountRef.current += 1;
      try {
        const supabase = createBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await fetch(`/api/checkout/confirm?draft_id=${encodeURIComponent(draftId)}`, {
          method: 'GET',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        const json = await res.json().catch(() => null);
        const result = json?.data?.status ?? json?.status;
        if (result === 'order_created' && json?.data?.order_id) {
          setStatus('order_created');
          setOrderId(json.data.order_id);
          clearCart();
          sessionStorage.removeItem('blinkgo_last_draft_id');
          setTimeout(() => {
            router.replace(`/orders/${json.data.order_id}`);
          }, 1500);
          return;
        }
        if (result === 'paid') {
          // Payment succeeded but order not yet created. Keep polling.
          setStatus('paid');
          // Don't return — keep polling
        } else if (result === 'failed') {
          setStatus('failed');
          setErrorMessage(json?.data?.message ?? 'Payment failed');
          return;
        } else if (result === 'canceled') {
          setStatus('canceled');
          setErrorMessage('Payment was canceled');
          return;
        } else if (result === 'requires_action') {
          // 3DS challenge required — Stripe.js should handle this; keep polling
          setStatus('requires_action');
        } else if (result === 'awaiting_payment_method') {
          // Customer needs to provide payment method
          setStatus('awaiting_payment_method');
          return;
        } else if (result === 'expired') {
          setStatus('expired');
          setErrorMessage('Order draft expired');
          return;
        }
        if (pollCountRef.current >= MAX_POLLS) {
          setStatus('timeout');
          return;
        }
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (error: unknown) {
        if (cancelled) return;
        if (pollCountRef.current >= MAX_POLLS) {
          setStatus('timeout');
          setErrorMessage(error instanceof Error ? error.message : 'Network error');
          return;
        }
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [searchParams, router, clearCart]);

  const title = (() => {
    if (status === 'order_created') return translate('checkout.successTitle', 'Order confirmed!');
    if (status === 'failed') return translate('checkout.paymentFailed', 'Payment failed');
    if (status === 'canceled') return translate('checkout.paymentCanceled', 'Payment canceled');
    if (status === 'expired') return translate('checkout.expired', 'Order expired');
    if (status === 'timeout') return translate('checkout.timeout', 'Timed out');
    if (status === 'requires_action') return translate('checkout.requiresAction', 'Additional verification required');
    if (status === 'awaiting_payment_method') return translate('checkout.awaitingPaymentMethod', 'Please complete payment');
    if (status === 'paid') return translate('checkout.paidProcessing', 'Payment received, creating your order…');
    return translate('checkout.processing', 'Processing payment…');
  })();

  const subtitle = (() => {
    if (status === 'order_created') return translate('checkout.successSubtitle', 'Redirecting to your order…');
    if (status === 'failed') return errorMessage ?? 'Please try again';
    if (status === 'canceled') return errorMessage ?? 'Your payment was canceled';
    if (status === 'expired') return errorMessage ?? 'The order draft expired';
    if (status === 'timeout') return translate('checkout.timeoutSubtitle', 'We are still processing your payment. Check your orders page in a moment.');
    if (status === 'requires_action') return translate('checkout.requiresActionSubtitle', 'Please complete the verification in the payment popup.');
    if (status === 'awaiting_payment_method') return translate('checkout.awaitingPaymentMethodSubtitle', 'Please enter your card details to complete the payment.');
    if (status === 'paid') return translate('checkout.paidSubtitle', 'Almost there…');
    return translate('checkout.processingSubtitle', 'Please wait while we confirm your payment.');
  })();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-3xl border border-edge bg-surface-elevated p-8 text-center space-y-4">
        {status === 'polling' && (
          <Loader2 className="w-12 h-12 mx-auto text-brand-red animate-spin" aria-hidden="true" />
        )}
        {status === 'order_created' && (
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400" aria-hidden="true" />
        )}
        {(status === 'failed' || status === 'expired' || status === 'timeout') && (
          <AlertCircle className="w-12 h-12 mx-auto text-amber-400" aria-hidden="true" />
        )}
        <h1 className="text-2xl font-extrabold text-white">{title}</h1>
        <p className="text-text-secondary text-sm">{subtitle}</p>
        {status === 'order_created' && orderId && (
          <Link
            href={`/orders/${orderId}`}
            className="inline-block mt-2 px-6 h-12 leading-[3rem] rounded-2xl font-bold text-white bg-gradient-to-br from-brand-red to-brand-red-hover hover:from-brand-red-hover hover:to-brand-red-active"
          >
            {translate('checkout.viewOrder', 'View order')}
          </Link>
        )}
        {(status === 'failed' || status === 'expired' || status === 'timeout') && (
          <Link
            href="/cart"
            className="inline-block mt-2 px-6 h-12 leading-[3rem] rounded-2xl font-bold text-text-secondary border border-edge hover:bg-surface"
          >
            {translate('checkout.backToCart', 'Back to cart')}
          </Link>
        )}
      </div>
    </div>
  );
}
