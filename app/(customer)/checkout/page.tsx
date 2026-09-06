'use client';

/**
 * Checkout Page — Phase 7F production-certified.
 *
 * Architecture:
 *   1. The cart page NEVER directly places an order. It redirects to /checkout
 *      when the user clicks "Checkout".
 *   2. /checkout creates a server-authoritative Order Draft via
 *      POST /api/checkout/draft. The draft is signed with HMAC-SHA256.
 *   3. The page renders the server-validated totals — client never computes.
 *   4. The user reviews and clicks "Confirm Order" → POST /api/stripe/checkout.
 *   5. The confirm endpoint re-validates the draft, burns it, and creates the order.
 *   6. Analytics events fire to /api/analytics/checkout.
 *
 * Why a separate /checkout page?
 *   - Review step: customer can see all server-validated totals before committing
 *   - Server trust: client never sends totals to /api/orders; the draft is
 *     the single source of truth
 *   - Idempotency: the draft can be reused for retry, refresh, navigation
 *   - Audit: every "I'm about to pay" leaves a server-side trace
 *
 * Production safety:
 *   - No client-side total computation
 *   - All money is server-derived
 *   - Draft has 30-min TTL
 *   - Draft is one-time use (burned on confirm)
 *   - HMAC signature prevents client tampering
 *   - Confirm re-validates everything (anti-stale)
 *   - aria-busy on submit, aria-live on grand total
 *   - Online/offline guard
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { hasAnalyticsConsent } from '@/lib/privacy/consent';
import X from 'lucide-react/dist/esm/icons/x';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Lock from 'lucide-react/dist/esm/icons/lock';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Store from 'lucide-react/dist/esm/icons/store';
import Clock from 'lucide-react/dist/esm/icons/clock';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import { useCart } from '@/lib/cart-store';
import { createBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/PageHeader';
import { useI18n, useTranslations } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { cn } from '@/lib/cn';
import type { DeliveryPreferences } from '@/lib/delivery-preferences';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

// ── Draft types (mirror server OrderDraft) ─────────
interface DraftLine {
  config_key: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  line_subtotal: number;
  quantity: number;
  issues: string[];
  configuration?: {
    substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
  };
}
interface DraftResponse {
  draft_id: string;
  customer_id: string;
  restaurant_id: string;
  group_order_id?: string;
  fulfillment_type: 'delivery' | 'pickup';
  lines: DraftLine[];
  delivery_address: {
    address: string;
    lat: number | null;
    lng: number | null;
    door?: string;
    floor?: string;
    notes?: string;
    postal_code?: string;
    delivery_preferences?: DeliveryPreferences;
  } | null;
  payment_method: 'cash' | 'stripe';
  tip: number;
  coupon: { code: string; type: string; value: number; discount: number; min_order_amount: number | null; max_discount: number | null } | null;
  points_redeemed: number;
  subtotal: number;
  delivery_fee: number;
  delivery_fee_base?: number;
  delivery_fee_surge?: number;
  delivery_fee_multiplier?: number;
  delivery_fee_surge_active?: boolean;
  service_fee: number;
  discount: number;
  points_discount: number;
  total: number;
  min_order_amount: number;
  min_order_ok: boolean;
  delivery_zone_ok: boolean;
  delivery_distance_km: number | null;
  restaurant: { id: string; name: string; is_paused: boolean; is_hidden: boolean; is_active: boolean; is_open: boolean; address: string | null; pickup_instructions: string | null };
  currency: 'EUR';
  issued_at: string;
  expires_at: string;
  can_place_order: boolean;
  issues: Array<{ kind: string; message: string; line?: string }>;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const translate = useTranslations();
  const online = useOnlineStatus();

  // ── Cart state (read-only here; cart is the source for draft body) ──
  const items = useCart((s) => s.items ?? []);
  const tip = useCart((s) => s.tip ?? 0);
  const notes = useCart((s) => s.notes ?? '');
  const clearCart = useCart((s) => s.clear);
  const deliveryAddress = useCart((s) => s.delivery_address ?? null);
  const deliveryPreferences = useCart((s) => s.delivery_preferences);
  const storedPaymentMethod = useCart((s) => s.payment_method ?? 'cash');
  const restaurantId = items[0]?.restaurant_id ?? null;
  const fulfillmentType = useCart((s) => s.fulfillment_type ?? 'delivery');
  const groupOrderId = useCart((s) => s.group_order_id ?? null);

  // ── Local state ──────────────────────────────────
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentMethod = storedPaymentMethod;
  const storedScheduledFor = useCart((s) => s.scheduled_for);
  const storedCouponCode = useCart((s) => s.coupon_code);
  const scheduledFor = useMemo(() => storedScheduledFor ? new Date(storedScheduledFor) : null, [storedScheduledFor]);
  const couponCode = storedCouponCode ?? undefined;
  const [pointsRedeemed] = useState<number>(0);
  // Phase 7G-A: Stripe payment state
  const [stripeConfigured, setStripeConfigured] = useState<boolean>(false);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentIntentError, setPaymentIntentError] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState<boolean>(false);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<HTMLDivElement | null>(null);

  // Address from the cart store (set on cart page, not on checkout page)
  const address = deliveryAddress?.address ?? '';
  const addressLat = deliveryAddress?.lat ?? null;
  const addressLng = deliveryAddress?.lng ?? null;
  const checkoutCopy = locale === 'ar'
    ? { title: 'مراجعة الطلب', preparing: 'جارٍ تجهيز طلبك…', issuesTitle: 'ملاحظات على الطلب', reviewItems: 'مراجعة المنتجات', editCart: 'تعديل', deliveryAddress: 'عنوان التوصيل', secureNote: 'طلب موثّق من الخادم ومحمي', paymentMethod: 'طريقة الدفع', confirmOrder: 'اطلب مع الالتزام بالدفع', retry: 'إعادة المحاولة' }
    : locale === 'de'
      ? { title: 'Kasse', preparing: 'Bestellung wird vorbereitet…', issuesTitle: 'Hinweise zur Bestellung', reviewItems: 'Bestellung prüfen', editCart: 'Bearbeiten', deliveryAddress: 'Lieferadresse', secureNote: 'Server-validierte Bestellung · sicher signiert', paymentMethod: 'Zahlungsmethode', confirmOrder: 'Zahlungspflichtig bestellen', retry: 'Erneut versuchen' }
      : { title: 'Checkout', preparing: 'Preparing your order…', issuesTitle: 'Order notes', reviewItems: 'Review items', editCart: 'Edit', deliveryAddress: 'Delivery address', secureNote: 'Server-validated and securely signed', paymentMethod: 'Payment method', confirmOrder: 'Order and pay', retry: 'Try again' };

  // ── Idempotency (per draft) ──────────────────────
  const draftIdempotencyRef = useRef<{ payload: string; key: string } | null>(null);
  const submitInFlightRef = useRef(false);
  const orderCreatedRef = useRef(false);
  const draftChannelRef = useRef<BroadcastChannel | null>(null);
  const tabIdRef = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : 'tab-0');
  const draftRequestSequenceRef = useRef(0);
  const draftAbortRef = useRef<AbortController | null>(null);

  // ── Redirect to cart if empty ────────────────────
  useEffect(() => {
    if (items.length === 0 && !orderCreatedRef.current) {
      router.push('/cart');
    }
  }, [items.length, router]);

  // ── Create / refresh the draft ───────────────────
  const createOrRefreshDraft = useCallback(async () => {
    if (!restaurantId || items.length === 0) return;
    const requestSequence = ++draftRequestSequenceRef.current;
    draftAbortRef.current?.abort();
    const controller = new AbortController();
    draftAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setDraftLoading(true);
    setDraftError(null);
    try {
      const body = {
        restaurant_id: restaurantId,
        fulfillment_type: fulfillmentType,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          config_key: it.config_key,
          configuration: it.configuration,
        })),
        delivery_address: fulfillmentType === 'pickup' ? undefined : {
          address: address || 'Bitte Adresse aus dem Warenkorb verwenden',
          lat: addressLat,
          lng: addressLng,
          delivery_preferences: deliveryPreferences,
        },
        payment_method: paymentMethod,
        tip: Number(tip) || 0,
        coupon_code: couponCode,
        scheduled_for: scheduledFor?.toISOString(),
        points_redeemed: Number(pointsRedeemed) || 0,
        notes,
        group_order_id: groupOrderId ?? undefined,
      };
      const serializedBody = JSON.stringify(body);
      if (draftIdempotencyRef.current?.payload !== serializedBody) {
        draftIdempotencyRef.current = { payload: serializedBody, key: crypto.randomUUID() };
      }
      const idempotencyKey = draftIdempotencyRef.current.key;
      let res: Response | null = null;
      let responseData: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        res = await fetch('/api/checkout/draft', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey,
          },
          body: serializedBody,
          signal: controller.signal,
        });
        responseData = await res.json().catch(() => ({}));
        const errorCode = responseData && typeof responseData === 'object'
          ? (responseData as { error?: { code?: unknown } }).error?.code
          : undefined;
        if (res.status !== 409 || errorCode !== 'IDEMPOTENCY_IN_PROGRESS' || attempt === 2) break;
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 500 * (attempt + 1));
          controller.signal.addEventListener('abort', () => {
            window.clearTimeout(timer);
            reject(new DOMException('Request aborted', 'AbortError'));
          }, { once: true });
        });
      }
      if (!res) throw new Error('Draft request did not start');
      if (requestSequence !== draftRequestSequenceRef.current) return;
      if (!res.ok) {
        setDraftError(extractErrorMessage(responseData, translate('checkout.errors.draftFailed', 'Konnte Bestellung nicht vorbereiten')));
        return;
      }
      const data = responseData as { data?: { draft?: DraftResponse }; ok?: boolean; message?: string };
      if (data?.data?.draft) {
        setDraft(data.data.draft);
        trackEvent('draft_created', { draft_id: data.data.draft.draft_id, item_count: data.data.draft.lines?.length ?? 0, total: data.data.draft.total });
      } else if (data?.ok === false) {
        setDraftError(data?.message ?? 'Draft failed');
      }
    } catch (caught: unknown) {
      if (requestSequence !== draftRequestSequenceRef.current) return;
      if (caught instanceof DOMException && caught.name === 'AbortError' && draftAbortRef.current !== controller) return;
      const timedOut = caught instanceof Error && caught.name === 'AbortError';
      setDraftError(timedOut ? translate('errors.timeout', 'Zeitüberschreitung') : translate('errors.networkError', 'Netzwerkfehler'));
      trackEvent('draft_invalidated', { error: timedOut ? 'timeout' : 'network' });
    } finally {
      clearTimeout(timeout);
      if (requestSequence === draftRequestSequenceRef.current) setDraftLoading(false);
    }
  }, [restaurantId, items, tip, paymentMethod, address, addressLat, addressLng, deliveryPreferences, fulfillmentType, couponCode, scheduledFor, pointsRedeemed, notes, groupOrderId, translate]);

  useEffect(() => () => draftAbortRef.current?.abort(), []);

  // Create the draft on mount + whenever relevant state changes
  useEffect(() => {
    if (items.length === 0 || !restaurantId) return;
    const t = setTimeout(() => {
      void createOrRefreshDraft();
    }, 400);
    return () => clearTimeout(t);
  }, [items, tip, paymentMethod, couponCode, pointsRedeemed, restaurantId, createOrRefreshDraft]);

  // BroadcastChannel to share draft state across tabs
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    try {
      const ch = new BroadcastChannel('blinkgo-checkout-draft');
      ch.onmessage = (e) => {
        const msg = e.data;
        if (msg?.type === 'request-draft' && draft) {
          ch.postMessage({ type: 'draft-state', tabId: tabIdRef.current, draftId: draft.draft_id });
        } else if (msg?.type === 'draft-confirmed' && msg?.draftId === draft?.draft_id) {
          // Another tab confirmed — redirect them
          if (msg?.tabId !== tabIdRef.current && msg?.orderId) {
            router.push(`/orders/${msg.orderId}`);
          }
        } else if (msg?.type === 'draft-discarded' && msg?.draftId === draft?.draft_id) {
          // Another tab invalidated our draft — refresh
          void createOrRefreshDraft();
        }
      };
      draftChannelRef.current = ch;
      return () => { try { ch.close(); } catch {} };
    } catch { /* ignore */ }
  }, [draft, router, createOrRefreshDraft]);

  // ── Confirm the order (Phase 7G-A: Stripe flow) ──
  async function confirmOrder() {
    if (submitInFlightRef.current) return;
    if (!draft) {
      setError(translate('checkout.errors.noDraft', 'Kein Draft vorhanden'));
      return;
    }
    if (!draft.can_place_order) {
      setError(draft.issues?.[0]?.message ?? 'Bestellung kann nicht aufgegeben werden');
      return;
    }
    if (!online) {
      setError(translate('errors.networkError', 'Du bist offline. Bitte stelle eine Verbindung her.'));
      return;
    }
    submitInFlightRef.current = true;
    setConfirming(true);
    setError(null);
    trackEvent('draft_reviewed', { draft_id: draft.draft_id });
    trackEvent('payment_started', { draft_id: draft.draft_id, payment_method: paymentMethod });

    // Persist draft id for the success page to find
    try { sessionStorage.setItem('blinkgo_last_draft_id', draft.draft_id); } catch {}

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      // Card payments use Stripe; cash orders use the server-authoritative
      // order endpoint, which recalculates every price and enforces idempotency.
      if (paymentMethod === 'stripe') {
        await processStripePayment();
        return;  // processStripePayment handles redirect/cleanup
      }
      await processCashOrder();
      return;
    } catch (caught: unknown) {
      if (caught instanceof Error && caught.name === 'AbortError') {
        setError(translate('errors.timeout', 'Die Verbindung dauerte zu lange. Bitte prüfe dein Internet und versuche es erneut.'));
      } else {
        setError(extractErrorMessage(caught, translate('checkout.errors.confirmFailed', 'Fehler')));
      }
      trackEvent('draft_failed', { draft_id: draft?.draft_id, error: extractErrorMessage(caught, 'unknown') });
    } finally {
      clearTimeout(timeout);
      submitInFlightRef.current = false;
      setConfirming(false);
    }
  }

  async function processCashOrder() {
    if (!draft) return;
    let res: Response | null = null;
    let json: {
      ok?: boolean;
      data?: { order?: { id?: string } };
      error?: { code?: string; message?: string };
      message?: string;
    } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      res = await fetch('/api/checkout/cash', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ draft_id: draft.draft_id }),
      });
      json = await res.json().catch(() => null);
      if (
        res.status !== 409
        || json?.error?.code !== 'IDEMPOTENCY_IN_PROGRESS'
        || attempt === 3
      ) break;
      const retryAfter = Number(res.headers.get('Retry-After'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 2_000)
        : 350 * (attempt + 1);
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
    if (!res) throw new Error(translate('checkout.errors.confirmFailed', 'Bestellung konnte nicht erstellt werden.'));
    if (!res.ok || !json?.ok || !json?.data?.order?.id) {
      const fallback = locale === 'ar'
        ? 'تعذر إنشاء الطلب. حاول مجددًا.'
        : locale === 'de'
          ? 'Bestellung konnte nicht erstellt werden.'
          : 'Could not create the order.';
      throw new Error(extractErrorMessage(json, fallback));
    }
    const orderId = json.data.order.id as string;
    try {
      draftChannelRef.current?.postMessage({ type: 'draft-confirmed', tabId: tabIdRef.current, draftId: draft.draft_id, orderId });
    } catch {}
    orderCreatedRef.current = true;
    clearCart();
    trackEvent('order_created', { order_id: orderId, payment_method: 'cash' });
    router.push(`/orders/${orderId}`);
  }

  // ── Stripe payment flow (Phase 7G-A) ─────────────
  async function processStripePayment() {
    if (!draft) return;
    if (!stripeConfigured || !publishableKey) {
      // Stripe not configured — fail with a clear message
      throw new Error('Payments are temporarily unavailable. Please contact support.');
    }
    if (!stripeRef.current) {
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripeInstance = await loadStripe(publishableKey);
      if (!stripeInstance) throw new Error('Failed to initialize Stripe');
      stripeRef.current = stripeInstance;
    }
    const stripe = stripeRef.current;

    if (!clientSecret) {
      throw new Error(paymentIntentError ?? 'No payment intent');
    }

    // If no payment element yet, create it now (and mount)
    if (!elementsRef.current) {
      const elements = stripe.elements({
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#E10600',
            colorBackground: '#1a1a1a',
            colorText: '#ffffff',
            colorDanger: '#ef4444',
            fontFamily: 'Inter, system-ui, sans-serif',
            borderRadius: '12px',
          },
        },
      });
      const paymentElement = elements.create('payment');
      elementsRef.current = elements;
      if (paymentElementRef.current) {
        paymentElement.mount(paymentElementRef.current);
      }
    }

    // Submit the elements
    const elements = elementsRef.current;
    const { error: submitError } = await elements.submit();
    if (submitError) {
      throw new Error(submitError.message ?? 'Payment element validation failed');
    }

    // Confirm the payment
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`,
        payment_method_data: {},
      },
    });

    if (confirmError) {
      throw new Error(confirmError.message ?? 'Payment confirmation failed');
    }

    // If we get here without redirect (e.g. free confirm), navigate manually
    router.push(`/checkout/success?payment_intent=${paymentIntentId}&payment_intent_client_secret=${clientSecret}`);
  }

  // ── Create PaymentIntent when draft is ready ─────
  const createPaymentIntent = useCallback(async () => {
    if (!draft || !draft.can_place_order) return;
    if (paymentMethod !== 'stripe') return;
    if (clientSecret) return;  // already created
    try {
      const supabase = createBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ draft_id: draft.draft_id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setPaymentIntentError(json?.message ?? json?.error ?? 'Failed to create payment intent');
        return;
      }
      setClientSecret(json.data?.client_secret ?? null);
      setPaymentIntentId(json.data?.payment_intent_id ?? null);
      setPublishableKey(json.data?.publishable_key ?? null);
      setStripeConfigured(json.data?.configured ?? false);
    } catch (caught: unknown) {
      setPaymentIntentError(extractErrorMessage(caught, 'Network error'));
    }
  }, [draft, paymentMethod, clientSecret]);

  // Trigger PaymentIntent creation when draft becomes placeable
  useEffect(() => {
    if (!draft?.can_place_order || paymentMethod !== 'stripe') return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void createPaymentIntent(); });
    return () => { cancelled = true; };
  }, [draft?.can_place_order, paymentMethod, createPaymentIntent]);

  // Check Stripe config on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/stripe/status');
        const json = await res.json();
        setStripeConfigured(!!json?.configured);
        // Note: publishable key is set after PaymentIntent creation (server-side)
      } catch {
        setStripeConfigured(false);
      } finally {
        setStripeReady(true);
      }
    })();
  }, []);

  // ── Empty cart redirect ──────────────────────────
  if (items.length === 0) {
    return null;
  }

  // ── Main render ──────────────────────────────────
  return (
    <>
      <PageHeader
        title={translate('checkout.title', checkoutCopy.title)}
        subtitle={draft?.restaurant?.name ?? items[0]?.restaurant_name}
        back
      />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-32" role="main" aria-label="Checkout">
        {/* ── Restaurant state banner ─────────────── */}
        {draft && (draft.restaurant.is_paused || draft.restaurant.is_hidden || !draft.restaurant.is_active || !draft.restaurant.is_open) && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200">
              {draft.restaurant.is_paused
                ? translate('restaurantDetail.paused', 'Restaurant is paused')
                : draft.restaurant.is_hidden
                ? translate('restaurantDetail.hidden', 'Restaurant is hidden')
                : !draft.restaurant.is_active
                ? translate('restaurantDetail.unavailable', 'Restaurant is unavailable')
                : translate('restaurantDetail.closed', 'Restaurant is closed')}
            </p>
          </div>
        )}

        {/* ── Draft loading / error ────────────────── */}
        {draftLoading && !draft && (
          <div className="rounded-2xl border border-edge bg-surface-elevated p-4 flex items-center gap-3" aria-live="polite">
            <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
            <p className="text-sm text-text-secondary">{translate('checkout.preparing', checkoutCopy.preparing)}</p>
          </div>
        )}
        {draftError && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-danger">{draftError}</p>
              <button
                onClick={() => void createOrRefreshDraft()}
                className="mt-2 text-xs font-bold text-danger hover:underline focus:outline-none focus:ring-2 focus:ring-danger/50 rounded"
              >
                {translate('common.tryAgain', checkoutCopy.retry)}
              </button>
            </div>
          </div>
        )}

        {/* ── Issues (blocking) ──────────────────── */}
        {draft && draft.issues.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2" role="alert">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-amber-200 text-sm">{translate('checkout.issuesTitle', checkoutCopy.issuesTitle)}</h3>
            </div>
            <ul className="space-y-1">
              {draft.issues.map((issue, i) => (
                <li key={i} className="text-xs text-amber-100/90 flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                  <span>{locale === 'ar' && issue.message === 'Address is missing GPS coordinates' ? 'يجب تحديد موقع عنوان التوصيل على الخريطة' : issue.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Items (server-validated) ────────────── */}
        {draft && (
          <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
            <div className="px-4 py-3.5 border-b border-edge flex items-center justify-between">
              <h3 className="font-extrabold text-white text-sm">
                {translate('checkout.reviewItems', checkoutCopy.reviewItems)} <span className="text-text-muted font-normal">({draft.lines.length})</span>
              </h3>
              <Link
                href="/cart"
                className="text-xs font-bold text-brand-red-500 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-red-500/50 rounded px-2 py-1"
              >
                {translate('checkout.editCart', checkoutCopy.editCart)}
              </Link>
            </div>

            <div className="divide-y divide-edge">
              {draft.lines.map((line) => (
                <div key={line.config_key} className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-xl bg-premium-gradient flex items-center justify-center text-white font-extrabold text-sm flex-shrink-0">
                    {line.quantity}×
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate text-sm">{line.product_name}</p>
                    <p className="text-xs text-text-muted tabular-nums">
                      {formatEUR(line.unit_price)} × {line.quantity}
                    </p>
                  </div>
                  <span className="font-extrabold text-white text-sm tabular-nums" aria-live="polite">
                    {formatEUR(line.line_subtotal)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Delivery (read-only summary) ─────────── */}
        {draft && (
          <div className="rounded-2xl bg-surface-elevated border border-edge p-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-live-gradient flex items-center justify-center shadow-glow-info flex-shrink-0">
                {draft.fulfillment_type === 'pickup' ? <Store className="w-4.5 h-4.5 text-white" /> : <MapPin className="w-4.5 h-4.5 text-white" />}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white text-sm">{draft.fulfillment_type === 'pickup' ? (locale === 'ar' ? 'استلام من المطعم' : locale === 'de' ? 'Selbstabholung' : 'Customer pickup') : translate('checkout.deliveryAddress', checkoutCopy.deliveryAddress)}</h3>
                <p className="text-xs text-text-secondary mt-0.5">{draft.fulfillment_type === 'pickup' ? (draft.restaurant.address || draft.restaurant.name) : draft.delivery_address?.address}</p>
              </div>
            </div>
            {draft.delivery_distance_km != null && (
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Clock className="w-3 h-3" />
                <span>
                  {draft.delivery_distance_km.toFixed(1)} km · {draft.delivery_zone_ok
                    ? translate('checkout.zoneOk', locale === 'ar' ? 'ضمن منطقة التوصيل' : locale === 'de' ? 'Im Servicegebiet' : 'Within delivery area')
                    : translate('checkout.zoneOut', locale === 'ar' ? 'خارج منطقة التوصيل' : locale === 'de' ? 'Außerhalb' : 'Outside delivery area')}
                </span>
              </div>
            )}
            {scheduledFor && (
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Clock className="w-3 h-3" />
                <span>{scheduledFor.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Totals (server-computed) ─────────────── */}
        {draft && (
          <div className="rounded-2xl bg-surface-elevated border border-edge p-4 space-y-2 text-sm" aria-live="polite">
            <div className="flex justify-between text-text-secondary">
              <span>{translate('customer.subtotal', 'Zwischensumme')}</span>
              <span className="font-bold text-white tabular-nums">{formatEUR(draft.subtotal)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>{draft.fulfillment_type === 'pickup' ? (locale === 'ar' ? 'الاستلام' : locale === 'de' ? 'Abholung' : 'Pickup') : translate('customer.delivery', 'Lieferung')}</span>
              <span className="font-bold text-white tabular-nums">
                {(draft.delivery_fee_base ?? draft.delivery_fee) === 0 ? translate('customer.free', 'Gratis') : formatEUR(draft.delivery_fee_base ?? draft.delivery_fee)}
              </span>
            </div>
            {draft.delivery_fee_surge_active && (draft.delivery_fee_surge ?? 0) > 0 && <div className="flex justify-between text-amber-300">
              <span>{locale === 'ar' ? 'تعديل رسوم وقت الذروة' : locale === 'de' ? 'Auslastungszuschlag' : 'Peak-time delivery adjustment'} · ×{(draft.delivery_fee_multiplier ?? 1).toFixed(2)}</span>
              <span className="font-bold tabular-nums">+ {formatEUR(draft.delivery_fee_surge ?? 0)}</span>
            </div>}
            <div className="flex justify-between text-text-secondary">
              <span>{translate('customer.serviceFee', 'Servicegebühr')}</span>
              <span className="font-bold text-white tabular-nums">{formatEUR(draft.service_fee)}</span>
            </div>
            {draft.discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>{translate('customer.discount', 'Rabatt')}</span>
                <span className="font-bold tabular-nums">- {formatEUR(draft.discount)}</span>
              </div>
            )}
            {draft.points_discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>{translate('checkout.pointsDiscount', 'Punkte')}</span>
                <span className="font-bold tabular-nums">- {formatEUR(draft.points_discount)}</span>
              </div>
            )}
            {draft.tip > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>{translate('customer.tip', 'Trinkgeld')}</span>
                <span className="font-bold tabular-nums">{formatEUR(draft.tip)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-white font-extrabold pt-3 mt-2 border-t border-edge">
              <span className="text-base">{translate('customer.total', 'Gesamt')}</span>
              <span className="bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active bg-clip-text text-transparent text-2xl tabular-nums">
                {formatEUR(draft.total)}
              </span>
            </div>
            {draft.coupon && (
              <div className="flex justify-between text-xs text-text-muted pt-1">
                <span>{translate('checkout.couponApplied', 'Gutschein')}</span>
                <span className="font-mono">{draft.coupon.code}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Security / trust badges ──────────────── */}
        {draft && (
          <div className="rounded-2xl border border-edge bg-surface/50 p-3 flex items-center gap-2 text-xs text-text-muted">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{translate('checkout.secureNote', checkoutCopy.secureNote)}</span>
          </div>
        )}

        {/* ── Stripe PaymentElement (Phase 7G-A) ───── */}
        {draft && draft.can_place_order && paymentMethod === 'stripe' && (
          <div className="rounded-2xl bg-surface-elevated border border-edge p-4 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {translate('checkout.paymentMethod', checkoutCopy.paymentMethod)}
            </h3>
            {!stripeReady && (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{translate('checkout.loadingStripe', 'Zahlung wird geladen…')}</span>
              </div>
            )}
            {stripeReady && !stripeConfigured && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200">
                  {translate('checkout.stripeNotConfigured', 'Online-Zahlung ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.')}
                </p>
              </div>
            )}
            {stripeReady && stripeConfigured && (
              <>
                {paymentIntentError ? (
                  <div className="rounded-xl border border-danger/30 bg-danger/10 p-3">
                    <p className="text-sm text-danger">{paymentIntentError}</p>
                    <button
                      onClick={() => {
                        setClientSecret(null);
                        setPaymentIntentError(null);
                        void createPaymentIntent();
                      }}
                      className="text-xs text-text-secondary underline mt-1"
                    >
                      {translate('checkout.retry', 'Erneut versuchen')}
                    </button>
                  </div>
                ) : (
                  <div ref={paymentElementRef} className="min-h-[200px]" />
                )}
              </>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 flex items-start gap-2" role="alert">
            <X className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger font-medium">{error}</p>
          </div>
        )}

        {/* ── Confirm CTA ──────────────────────────── */}
        <button
          onClick={confirmOrder}
          disabled={
            !draft ||
            confirming ||
            !draft.can_place_order ||
            (draft.restaurant.is_paused ?? false) ||
            (draft.restaurant.is_hidden ?? false) ||
            !draft.restaurant.is_active ||
            !draft.restaurant.is_open ||
            (stripeReady && paymentMethod === 'stripe' && (!stripeConfigured || !clientSecret || !!paymentIntentError))
          }
          aria-busy={confirming}
          className={cn(
            'w-full h-14 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2',
            'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-glow',
            'hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]',
            'transition-all duration-200 ease-silk',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
            'focus:outline-none focus:ring-4 focus:ring-brand-red-500/40',
          )}
        >
          {confirming ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>
                {locale === 'ar' ? 'جاري التأكيد...' : locale === 'en' ? 'Confirming...' : 'Wird bestätigt...'}
              </span>
            </>
          ) : (
            <>
              <Lock className="w-5 h-5" />
              <span>
                {checkoutCopy.confirmOrder}
              </span>
              <span className="opacity-50 mx-0.5">·</span>
              <span className="tabular-nums">{draft ? formatEUR(draft.total) : '...'}</span>
            </>
          )}
        </button>

        <p className="text-center text-xs text-text-muted">
          {locale === 'ar'
            ? 'بالنقر على «اطلب مع الالتزام بالدفع» فإنك توافق على الشروط وتلتزم بالإجمالي المعروض.'
            : locale === 'en'
              ? 'By selecting “Order and pay” you accept the Terms and commit to the displayed total.'
              : 'Mit „Zahlungspflichtig bestellen“ akzeptieren Sie die AGB und verpflichten sich zur Zahlung des angezeigten Gesamtbetrags.'}
        </p>
      </div>
    </>
  );
}

// ── Checkout analytics — privacy-friendly ─────────
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    if (!hasAnalyticsConsent()) return;
    if (!navigator.onLine) return;
    const payload = JSON.stringify({ event, data: data || {}, ts: Date.now() });
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon('/api/analytics/checkout', payload);
      } catch {
        // Silent
      }
    }
  } catch {
    // Analytics must never break the checkout flow
  }
}
