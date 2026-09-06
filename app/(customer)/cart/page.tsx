'use client';

/**
 * Cart Page — Phase 7E production-certified.
 *
 * Architecture:
 *   1. zustand `useCart` is the single source of truth for line items
 *      (Phase 7C.1 canonical CartKey for line identity).
 *   2. Server-authoritative totals come from `/api/cart/quote`. The client
 *      NEVER computes subtotal, delivery, service, or grand total — every
 *      cent is re-derived server-side from canonical product+modifier data.
 *   3. Coupon validation routes through `/api/coupons/validate` (server-side
 *      authoritative — client never computes discounts).
 *   4. This page only opens the legally distinct checkout review step.
 *   5. Analytics events go to `/api/analytics/cart` (privacy-friendly).
 *   6. Notes are sanitized via `sanitizeText` before sending to the server.
 *
 * What this page does NOT do:
 *   - Compute its own totals (security/UX anti-pattern)
 *   - Trust client prices (they are display-only after server validation)
 *   - Store cart in URL or localStorage directly (zustand persist handles it)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Minus from 'lucide-react/dist/esm/icons/minus';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Store from 'lucide-react/dist/esm/icons/store';
import Bike from 'lucide-react/dist/esm/icons/bike';
import X from 'lucide-react/dist/esm/icons/x';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Wallet from 'lucide-react/dist/esm/icons/wallet';
import Banknote from 'lucide-react/dist/esm/icons/banknote';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Image from 'next/image';
import { useCart } from '@/lib/cart-store';
import { createBrowserClient } from '@/lib/supabase/client';
import { hasAnalyticsConsent } from '@/lib/privacy/consent';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient } from '@/components/shared/EmptyStateClient';
import { useToast } from '@/components/ui/Toast';
import { useT, useI18n, useTranslations } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';
import { sanitizeText } from '@/lib/foundation/validation';
import { checkDeliveryZone, BLINKGO_DELIVERY_RADIUS_KM } from '@/lib/delivery-zone';
import { AddressWithMap } from '@/components/shared/AddressWithMap';
import { TipSelector } from '@/components/cart/TipSelector';
import { PromoCodeInput } from '@/components/cart/PromoCodeInput';
import { ScheduleOrderPicker } from '@/components/cart/ScheduleOrderPicker';
import { SavedAddressChips, type SavedAddress } from '@/components/cart/SavedAddressChips';
import { AddressInput } from '@/components/maps/AddressInput';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { cn } from '@/lib/cn';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

const MAX_NOTES_LEN = 300;

// ── Server quote response type ─────────────────────
interface QuoteLine {
  config_key: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  line_subtotal: number;
  quantity: number;
  issues: string[];
}
interface QuoteResponse {
  ok: boolean;
  issues: Array<{ kind: string; message: string; line?: string }>;
  restaurant?: {
    id: string;
    name: string;
    type?: 'restaurant' | 'market' | 'pharmacy';
    is_paused: boolean;
    is_hidden: boolean;
    is_active: boolean;
    min_order_amount: number;
    delivery_fee: number;
    pickup_enabled?: boolean;
    pickup_instructions?: string | null;
    address?: string | null;
  };
  fulfillment_type?: 'delivery' | 'pickup';
  lines: QuoteLine[];
  subtotal: number;
  delivery_fee: number;
  delivery_fee_base?: number;
  delivery_fee_surge?: number;
  delivery_fee_multiplier?: number;
  delivery_fee_surge_active?: boolean;
  service_fee: number;
  tip: number;
  discount: number;
  points_discount: number;
  total: number;
  coupon: { code: string; type: string; value: number; min_order_amount: number | null; max_discount: number | null; discount: number } | null;
  min_order_amount: number;
  min_order_ok: boolean;
  delivery_zone_ok: boolean;
  delivery_distance_km: number | null;
  server_key_issued_at: string;
  can_place_order: boolean;
}

export default function CartPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const { locale } = useI18n();
  const translate = useTranslations();
  const online = useOnlineStatus();

  // ── zustand cart state (Phase 7C.1) ─────────────
  const items = useCart((s) => s.items ?? []);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const setSubstitutionPreference = useCart((s) => s.setSubstitutionPreference);
  const tip = useCart((s) => s.tip ?? 0);
  const setTip = useCart((s) => s.setTip);
  const deliveryPreferences = useCart((s) => s.delivery_preferences);
  const setDeliveryPreferences = useCart((s) => s.setDeliveryPreferences);
  const storedAddress = useCart((s) => s.delivery_address);
  const setCartAddress = useCart((s) => s.setAddress);
  const storedPaymentMethod = useCart((s) => s.payment_method ?? 'cash');
  const setStoredPaymentMethod = useCart((s) => s.setPaymentMethod);
  const storedScheduledFor = useCart((s) => s.scheduled_for);
  const setStoredScheduledFor = useCart((s) => s.setScheduledFor);
  const storedCouponCode = useCart((s) => s.coupon_code);
  const setStoredCouponCode = useCart((s) => s.setCouponCode);
  const fulfillmentType = useCart((s) => s.fulfillment_type ?? 'delivery');
  const setFulfillmentType = useCart((s) => s.setFulfillmentType);

  // ── Local UI state ──────────────────────────────
  const [address, setAddress] = useState('');
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);
  const [addressVerified, setAddressVerified] = useState(false);
  const paymentMethod = storedPaymentMethod;
  const setPaymentMethod = setStoredPaymentMethod;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponOverride, setCouponOverride] = useState<{ code: string; discount: number; type: string } | null | undefined>(undefined);
  const appliedCoupon = useMemo(
    () => couponOverride !== undefined
      ? couponOverride
      : storedCouponCode ? { code: storedCouponCode, discount: 0, type: 'unknown' } : null,
    [couponOverride, storedCouponCode],
  );
  const scheduledFor = storedScheduledFor ? new Date(storedScheduledFor) : null;
  const setScheduledFor = (value: Date | null) => setStoredScheduledFor(value?.toISOString() ?? null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

  // ── Server-computed quote (Phase 7E) ─────────────
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const submitInFlightRef = useRef(false);
  const quoteRequestSequenceRef = useRef(0);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const didRestoreAddressRef = useRef(false);

  // Restore the verified address after persisted cart hydration or when the
  // customer returns from checkout. Never overwrite an address they started
  // editing in the current visit.
  useEffect(() => {
    if (didRestoreAddressRef.current || !storedAddress || address.trim()) return;
    didRestoreAddressRef.current = true;
    setAddress(storedAddress.address ?? storedAddress.street ?? '');
    setAddressLat(storedAddress.lat);
    setAddressLng(storedAddress.lng);
    setAddressVerified(Number.isFinite(storedAddress.lat) && Number.isFinite(storedAddress.lng));
  }, [address, storedAddress]);

  // ── Derived (display) — never the source of truth ─
  const deliveryFee = quote?.delivery_fee ?? 0;
  const deliveryBaseFee = quote?.delivery_fee_base ?? deliveryFee;
  const deliverySurge = quote?.delivery_fee_surge ?? 0;
  const serviceFee = quote?.service_fee ?? 0;
  const subtotal = quote?.subtotal ?? 0;
  const discount = quote?.discount ?? 0;
  const total = quote?.total ?? 0;

  // ── Restaurant info (from server) ───────────────
  const restaurant = quote?.restaurant ?? null;
  const isRetailCart = restaurant?.type === 'market' || restaurant?.type === 'pharmacy';

  useEffect(() => {
    if (!isRetailCart) return;
    for (const item of items) {
      if (!item.configuration.substitution_preference) {
        setSubstitutionPreference(item.config_key, 'refund_item');
      }
    }
  }, [isRetailCart, items, setSubstitutionPreference]);
  const restaurantName = items[0]?.restaurant_name ?? t.nav?.restaurants ?? '';
  const restaurantId = items[0]?.restaurant_id ?? null;

  // Saved addresses are part of the checkout flow, not a placeholder.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/addresses', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return [];
        const payload = await response.json();
        const rows = payload?.data?.addresses ?? payload?.addresses ?? [];
        if (!Array.isArray(rows)) return [];
        return rows.map((row: Record<string, unknown>): SavedAddress => {
          const label = String(row.label ?? 'Home');
          const normalized = label.toLowerCase();
          const kind: SavedAddress['kind'] = normalized.includes('work') || normalized.includes('arbeit')
            ? 'work'
            : normalized.includes('home') || normalized.includes('zuhause')
              ? 'home'
              : 'other';
          return {
            id: String(row.id),
            kind,
            label,
            street: String(row.address ?? ''),
            city: '',
            postal: row.postal_code ? String(row.postal_code) : undefined,
            lat: typeof row.latitude === 'number' ? row.latitude : Number(row.latitude) || undefined,
            lng: typeof row.longitude === 'number' ? row.longitude : Number(row.longitude) || undefined,
          };
        });
      })
      .then((addresses) => {
        if (!cancelled) setSavedAddresses(addresses);
      })
      .catch(() => {
        // Manual address entry remains available.
      });
    return () => { cancelled = true; };
  }, []);

  const checkoutBlockers = useMemo(() => {
    const messages: string[] = [];
    const copy = locale === 'ar'
      ? {
          address: 'أدخل عنوان التوصيل واختره من النتائج.',
          verify: 'تحقق من العنوان لتحديد موقع التوصيل بدقة.',
          checking: 'جارٍ التحقق من الأسعار وتوفر المطعم…',
          quote: 'تعذر التحقق من السلة. أعد المحاولة قبل إتمام الطلب.',
          min: (amount: string) => `أضف منتجات بقيمة ${amount} للوصول إلى الحد الأدنى للطلب.`,
          zone: 'هذا العنوان خارج نطاق التوصيل الحالي.',
          paused: 'المطعم متوقف مؤقتًا عن استقبال الطلبات.',
          closed: 'المطعم غير متاح للطلب الآن.',
          items: 'راجع الخيارات المطلوبة للمنتجات في السلة.',
        }
      : locale === 'de'
        ? {
            address: 'Lieferadresse eingeben und aus den Ergebnissen auswählen.',
            verify: 'Adresse bestätigen, damit wir den Lieferort genau kennen.',
            checking: 'Preise und Restaurant-Verfügbarkeit werden geprüft…',
            quote: 'Der Warenkorb konnte nicht geprüft werden. Bitte erneut versuchen.',
            min: (amount: string) => `Noch ${amount} bis zum Mindestbestellwert hinzufügen.`,
            zone: 'Diese Adresse liegt außerhalb des aktuellen Liefergebiets.',
            paused: 'Das Restaurant nimmt vorübergehend keine Bestellungen an.',
            closed: 'Das Restaurant ist derzeit nicht bestellbar.',
            items: 'Bitte die erforderlichen Produktoptionen im Warenkorb prüfen.',
          }
        : {
            address: 'Enter a delivery address and select it from the results.',
            verify: 'Verify the address so we can locate the delivery precisely.',
            checking: 'Checking prices and restaurant availability…',
            quote: 'We could not verify the cart. Try again before checkout.',
            min: (amount: string) => `Add ${amount} more to reach the minimum order.`,
            zone: 'This address is outside the current delivery area.',
            paused: 'The restaurant is temporarily not accepting orders.',
            closed: 'The restaurant is not available for ordering right now.',
            items: 'Review the required product options in the cart.',
          };

    if (fulfillmentType === 'delivery' && !address.trim()) messages.push(copy.address);
    else if (fulfillmentType === 'delivery' && (addressLat == null || addressLng == null || !addressVerified)) messages.push(copy.verify);
    if (quoteLoading || (!quote && !quoteError)) messages.push(copy.checking);
    if (quoteError) messages.push(copy.quote);
    if (quote && !quote.min_order_ok) messages.push(copy.min(formatEUR(Math.max(0, quote.min_order_amount - quote.subtotal))));
    if (fulfillmentType === 'delivery' && quote && !quote.delivery_zone_ok && addressLat != null && addressLng != null) messages.push(copy.zone);
    if (restaurant?.is_paused) messages.push(copy.paused);
    if (restaurant?.is_hidden || (restaurant && !restaurant.is_active)) messages.push(copy.closed);
    if (
      quote &&
      !quote.can_place_order &&
      quote.min_order_ok &&
      quote.delivery_zone_ok &&
      !restaurant?.is_paused &&
      !restaurant?.is_hidden &&
      restaurant?.is_active
    ) messages.push(copy.items);
    return messages;
  }, [address, addressLat, addressLng, addressVerified, fulfillmentType, locale, quote, quoteError, quoteLoading, restaurant]);

  const canCheckout = items.length > 0 && checkoutBlockers.length === 0 && quote?.can_place_order === true && online;

  // ── Fetch server quote whenever cart changes ─────
  const fetchQuote = useCallback(async () => {
    if (!restaurantId || items.length === 0) {
      quoteAbortRef.current?.abort();
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const requestSequence = ++quoteRequestSequenceRef.current;
    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    setQuoteLoading(true);
    setQuoteError(null);
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
        tip: Number(tip) || 0,
        coupon_code: appliedCoupon?.code,
        delivery_address: addressLat != null && addressLng != null
          ? { lat: addressLat, lng: addressLng, address }
          : undefined,
      };
      const res = await fetch('/api/cart/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (requestSequence !== quoteRequestSequenceRef.current) return;
      if (!res.ok) {
        setQuoteError(t.errors?.generic ?? 'Konnte Warenkorb nicht prüfen');
        return;
      }
      const data: QuoteResponse = await res.json();
      setQuote(data);
      // Track cart_refreshed event with metadata
      trackEvent('cart_refreshed', {
        item_count: data.lines?.length ?? 0,
        subtotal: data.subtotal,
        can_place_order: data.can_place_order,
        issue_count: data.issues?.length ?? 0,
      });
    } catch (caught: unknown) {
      if (requestSequence !== quoteRequestSequenceRef.current) return;
      if (caught instanceof DOMException && caught.name === 'AbortError' && quoteAbortRef.current !== controller) return;
      setQuote(null);
      setQuoteError(t.errors?.networkError ?? (locale === 'ar' ? 'تعذر الاتصال بخدمة التسعير.' : locale === 'en' ? 'Could not reach the pricing service.' : 'Der Preisservice ist nicht erreichbar.'));
      trackEvent('cart_invalidated', { error: 'network' });
    } finally {
      clearTimeout(timeout);
      if (requestSequence === quoteRequestSequenceRef.current) setQuoteLoading(false);
    }
  }, [restaurantId, items, tip, appliedCoupon, addressLat, addressLng, address, fulfillmentType, t.errors, locale]);

  useEffect(() => () => quoteAbortRef.current?.abort(), []);

  // Re-fetch quote on any cart change (debounced via dependency)
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchQuote();
    }, items.length === 0 ? 0 : 300);
    return () => clearTimeout(timer);
  }, [fetchQuote, items.length]);

  // ── Track cart_viewed on mount (when items present) ─
  useEffect(() => {
    if (items.length > 0) {
      trackEvent('cart_viewed', { item_count: items.length, subtotal: items.reduce((s, i) => s + i.product_price * i.quantity, 0) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Online/offline guard ────────────────────────
  useEffect(() => {
    if (!online && items.length > 0) {
      toast({ type: 'info', message: t.errors?.networkError ?? 'Offline — preise werden lokal berechnet' });
    }
  }, [online, items.length, t.errors, toast]);

  // ── Notes sanitization ──────────────────────────
  function onNotesChange(v: string) {
    setDeliveryPreferences({ instructions: sanitizeText(v, MAX_NOTES_LEN) });
  }

  // ── Quantity handler (analytics + clamp) ────────
  function changeQuantity(configKey: string, newQty: number) {
    const clamped = Math.max(1, Math.min(99, Math.floor(newQty)));
    setQuantity(configKey, clamped);
    trackEvent('quantity_changed', { quantity: clamped });
  }

  // ── Remove handler ──────────────────────────────
  function removeItem(configKey: string) {
    remove(configKey);
    trackEvent('item_removed', {});
  }

  // ── Coupon validation (server-authoritative) ─────
  async function applyCoupon(codeOverride?: string) {
    const code = (codeOverride ?? '').trim().toUpperCase();
    if (!code) return;
    if (!restaurantId) {
      toast({ type: 'error', message: 'Keine Bestellung im Warenkorb' });
      throw new Error('No cart');
    }
    try {
      // Fetch auth session (coupons/validate requires customer auth)
      const supabase = createBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        const msg = t.errors?.sessionExpired ?? 'Bitte melde dich an, um einen Gutschein einzulösen';
        toast({ type: 'error', message: msg });
        trackEvent('coupon_rejected', { kind: 'unauthenticated' });
        throw new Error(msg);
      }
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code, order_amount: subtotal, restaurant_id: restaurantId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = extractErrorMessage(data, t.errors?.invalidCoupon ?? 'Ungültiger Code');
        toast({ type: 'error', message: msg });
        trackEvent('coupon_rejected', { kind: 'invalid' });
        throw new Error(msg);
      }
      const data = await res.json();
      const valid = data?.valid ?? data?.data?.valid;
      if (!valid) {
        const msg = (data?.error?.message) ?? (t.errors?.invalidCoupon ?? 'Ungültiger Code');
        toast({ type: 'error', message: msg });
        trackEvent('coupon_rejected', { kind: 'invalid' });
        throw new Error(msg);
      }
      // server already validated; just store the code for the next /cart/quote
      setCouponOverride({ code, discount: 0, type: 'unknown' });
      setStoredCouponCode(code);
      toast({ type: 'success', message: `${t.customer?.codeCopied ?? 'Code'}: ${code}` });
      trackEvent('coupon_applied', {});
    } catch (error: unknown) {
      if (error instanceof Error && error.message !== 'Ungültiger Code') {
        toast({ type: 'error', message: error.message });
      }
      throw error;
    }
  }

  // ── Submit order (redirect to /checkout) ────────
  // Phase 7F: the cart page no longer places the order directly.
  // It validates the basics (address, zone, online) and then redirects
  // to /checkout, which creates a server-authoritative Order Draft and
  // lets the customer review server-validated totals before confirming.
  async function submitOrder() {
    if (submitInFlightRef.current) return;

    if (items.length === 0) return;

    if (fulfillmentType === 'delivery' && !address.trim()) {
      setError(t.errors?.addressRequired ?? 'Adresse erforderlich');
      return;
    }
    if (fulfillmentType === 'delivery' && (addressLat == null || addressLng == null || !addressVerified)) {
      setError(t.customer?.addressNotVerified ?? 'Bitte verifizieren Sie Ihre Adresse');
      return;
    }
    if (!online) {
      setError(t.errors?.networkError ?? 'Du bist offline. Bitte stelle eine Verbindung her.');
      return;
    }

    // Client-side delivery zone check (gate to /checkout; server re-checks)
    if (fulfillmentType === 'delivery' && addressLat != null && addressLng != null) {
      const zone = checkDeliveryZone(addressLat, addressLng);
      if (!zone.ok) {
        setError(
          translate('errors.tooFar', 'Delivery address is too far from the restaurant.') ??
            `Die Lieferadresse liegt ${zone.distanceKm.toFixed(1)} km vom BlinkGo Service Center (Wesseling) entfernt. Maximale Entfernung: ${BLINKGO_DELIVERY_RADIUS_KM} km.`
        );
        return;
      }
    }

    // Server-validated gate
    if (quote && !quote.can_place_order) {
      setError(quote.issues?.[0]?.message ?? 'Bestellung kann nicht aufgegeben werden');
      return;
    }

    // All client-side checks passed — redirect to /checkout.
    // The checkout page will create a server-authoritative Order Draft
    // and present server-validated totals for the customer to review.
    trackEvent('checkout_started', { item_count: items.length, subtotal: quote?.subtotal ?? subtotal });
    if (fulfillmentType === 'delivery') setCartAddress({
      address: address.trim(),
      street: address.trim(),
      city: '',
      postal_code: address.match(/\b\d{5}\b/)?.[0] ?? '',
      lat: addressLat!,
      lng: addressLng!,
    });
    submitInFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    // Use a small delay so the user sees the loading state, then navigate
    setTimeout(() => {
      router.push('/checkout');
    }, 200);
  }

  // ── Empty cart state ────────────────────────────
  if (items.length === 0) {
    return (
      <>
        <PageHeader title={t.nav?.cart ?? 'Cart'} back backHref="/home" />
        <div className="max-w-2xl mx-auto px-4 py-10 sm:py-20">
          <EmptyStateClient
            iconName="ShoppingBag"
            title={t.customer?.emptyCart ?? 'Your cart is empty'}
            description={t.customer?.emptyCartDesc ?? 'Browse restaurants and add items to get started'}
            action={{
              label: t.customer?.browseRestaurants ?? (locale === 'ar' ? 'تصفح المطاعم' : locale === 'en' ? 'Browse restaurants' : 'Restaurants durchsuchen'),
              href: '/restaurants',
            }}
            action2={{
              label: t.customer?.searchPlaceholder ?? 'Search',
              href: '/search',
            }}
          />
          <div className="mt-10 sm:mt-14">
            <h3 className="text-sm font-bold text-text-secondary mb-4 px-1 text-center">
              {translate('customer.popularCuisines', locale === 'ar' ? 'مطابخ شائعة' : locale === 'en' ? 'Popular cuisines' : 'Beliebte Küchen')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {(locale === 'ar'
                ? ['برغر', 'بيتزا', 'سوشي', 'نباتي', 'سلطة', 'هندي', 'مكسيكي', 'فطور']
                : locale === 'en'
                ? ['Burger', 'Pizza', 'Sushi', 'Vegan', 'Salad', 'Indian', 'Mexican', 'Breakfast']
                : ['Burger', 'Pizza', 'Sushi', 'Vegan', 'Salat', 'Indisch', 'Mexikanisch', 'Frühstück']
              ).map((c) => (
                <Link
                  key={c}
                  href={`/search?cuisine=${encodeURIComponent(c)}`}
                  className="inline-flex items-center h-10 px-4 rounded-full bg-surface-elevated text-sm font-bold text-text-secondary border border-edge hover:border-brand-red-500 hover:text-text transition-all"
                >
                  {c}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Main render ──────────────────────────────────
  return (
    <>
      <PageHeader title={t.nav?.cart ?? 'Cart'} subtitle={restaurantName} back backHref="/home" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-32" role="main" aria-label="Cart">
        {/* ── Restaurant-paused/hidden banner ──────── */}
        {restaurant && (restaurant.is_paused || restaurant.is_hidden || !restaurant.is_active) && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200">
              {restaurant.is_paused
                ? t.restaurantDetail?.paused ?? 'Restaurant is paused'
                : restaurant.is_hidden
                ? t.restaurantDetail?.hidden ?? 'Restaurant is hidden'
                : t.restaurantDetail?.unavailable ?? 'Restaurant is unavailable'}
            </p>
          </div>
        )}

        {/* ── Quote loading / error ────────────────── */}
        {quoteLoading && !quote && (
          <div className="rounded-2xl border border-edge bg-surface-elevated p-4 flex items-center gap-3" aria-live="polite">
            <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
            <p className="text-sm text-text-secondary">{translate('cart.quoteLoading', 'Aktualisiere Preise…')}</p>
          </div>
        )}
        {quoteError && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{quoteError}</p>
          </div>
        )}

        {/* ── Items ─────────────────────────────────── */}
        <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          <div className="px-4 py-3.5 border-b border-edge flex items-center justify-between">
            <h3 className="font-extrabold text-white text-sm">
              {t.customer?.items} <span className="text-text-muted font-normal">({items.length})</span>
            </h3>
            <span className="text-xs text-brand-red-500 font-bold tabular-nums" aria-live="polite">
              {formatEUR(subtotal)}
            </span>
          </div>

          <div className="divide-y divide-edge">
            {items.map((item) => (
              <div key={item.config_key} data-testid="cart-line" className="flex flex-wrap items-center gap-3 p-4">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.product_name}
                    width={56}
                    height={56}
                    sizes="56px"
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-red-500/15 to-brand-yellow-500/10 border border-brand-red-500/20 flex items-center justify-center text-brand flex-shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate text-sm">{item.product_name}</p>
                  {item.config_summary && (
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-2" dir="auto">
                      {locale === 'ar'
                        ? item.config_summary.replace(/pieces?/gi, 'قطع').replace(/piece/gi, 'قطعة')
                        : locale === 'de'
                          ? item.config_summary.replace(/pieces?/gi, 'Stück')
                          : item.config_summary}
                    </p>
                  )}
                  <p className="text-xs text-text-muted mt-0.5 tabular-nums">{formatEUR(Number(item.product_price))}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={() => changeQuantity(item.config_key, item.quantity - 1)}
                      aria-label={t.common?.decrease ?? 'Decrease quantity'}
                      className="w-9 h-9 rounded-lg bg-surface border border-edge hover:border-brand-red-500 hover:bg-brand-red-500/10 text-white flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-brand-red-500/50"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center text-sm font-extrabold text-white tabular-nums" aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => changeQuantity(item.config_key, item.quantity + 1)}
                      aria-label={t.common?.increase ?? 'Increase quantity'}
                      className="w-9 h-9 rounded-lg bg-surface border border-edge hover:border-brand-red-500 hover:bg-brand-red-500/10 text-white flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-brand-red-500/50"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className="font-extrabold text-white text-sm tabular-nums" aria-live="polite">
                    {formatEUR(Number(item.product_price) * item.quantity)}
                  </span>
                  <button
                    onClick={() => removeItem(item.config_key)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all focus:outline-none focus:ring-2 focus:ring-danger/50"
                    aria-label={t.common?.delete ?? 'Remove'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {isRetailCart && (
                  <div data-testid="substitution-preference" className="w-full rounded-xl border border-emerald-500/15 bg-emerald-500/[.06] p-3">
                    <p className="mb-2 text-xs font-extrabold text-emerald-200">
                      {locale === 'ar' ? 'إذا نفد هذا المنتج' : locale === 'en' ? 'If this item is out of stock' : 'Falls dieser Artikel ausverkauft ist'}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {([
                        ['best_match', locale === 'ar' ? 'أفضل بديل مشابه' : locale === 'en' ? 'Best similar substitute' : 'Besten ähnlichen Ersatz'],
                        ['contact_me', locale === 'ar' ? 'تواصل معي أولًا' : locale === 'en' ? 'Contact me first' : 'Zuerst kontaktieren'],
                        ['refund_item', locale === 'ar' ? 'أعد ثمن المنتج' : locale === 'en' ? 'Refund this item' : 'Artikel erstatten'],
                      ] as const).map(([value, label]) => {
                        const selected = (item.configuration.substitution_preference ?? 'refund_item') === value;
                        return <button key={value} type="button" aria-pressed={selected} onClick={() => setSubstitutionPreference(item.config_key, value)} className={cn('min-h-11 rounded-xl border px-3 text-xs font-bold transition', selected ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-black/20 text-zinc-400 hover:text-white')}>{label}</button>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Schedule + Address ───────────────────── */}
        <div className="space-y-3">
          <ScheduleOrderPicker
            scheduledFor={scheduledFor}
            onChange={setScheduledFor}
            t={{
              title: t.customer?.scheduleTitle,
              asap: t.customer?.scheduleAsap,
              asapSub: t.customer?.scheduleAsapSub,
              schedule: t.customer?.schedulePickTime,
              scheduleSub: t.customer?.schedulePickTimeSub,
              inMinutes: (n: number) => `${n} ${t.customer?.etaMinutes ?? 'Min.'}`,
              inHour: t.customer?.schedule1h ?? '',
              tomorrow: t.customer?.scheduleTomorrow,
              pickTime: t.customer?.scheduleTitle,
              minute: t.customer?.etaMinutes ?? 'Min.',
              hour: '',
            }}
          />

          <section className="rounded-2xl border border-edge bg-surface-elevated p-4" aria-labelledby="fulfilment-heading">
            <h3 id="fulfilment-heading" className="text-sm font-bold text-white">
              {locale === 'ar' ? 'كيف تريد استلام طلبك؟' : locale === 'de' ? 'Wie möchtest du bestellen?' : 'How would you like your order?'}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button type="button" aria-pressed={fulfillmentType === 'delivery'} onClick={() => setFulfillmentType('delivery')} className={cn('min-h-20 rounded-2xl border p-3 text-start transition focus:outline-none focus:ring-2 focus:ring-brand-red/60', fulfillmentType === 'delivery' ? 'border-brand-red bg-brand-red/15 text-white' : 'border-edge bg-black/20 text-text-secondary')}>
                <Bike className="h-5 w-5" aria-hidden /><span className="mt-2 block text-sm font-extrabold">{locale === 'ar' ? 'توصيل' : locale === 'de' ? 'Lieferung' : 'Delivery'}</span>
              </button>
              <button type="button" aria-pressed={fulfillmentType === 'pickup'} onClick={() => setFulfillmentType('pickup')} disabled={restaurant?.pickup_enabled === false} className={cn('min-h-20 rounded-2xl border p-3 text-start transition focus:outline-none focus:ring-2 focus:ring-brand-yellow/60 disabled:cursor-not-allowed disabled:opacity-50', fulfillmentType === 'pickup' ? 'border-brand-yellow bg-brand-yellow/15 text-white' : 'border-edge bg-black/20 text-text-secondary')}>
                <Store className="h-5 w-5" aria-hidden /><span className="mt-2 block text-sm font-extrabold">{locale === 'ar' ? 'استلام من المطعم' : locale === 'de' ? 'Selbstabholung' : 'Pickup'}</span>
              </button>
            </div>
            {fulfillmentType === 'pickup' ? <p className="mt-3 rounded-xl bg-brand-yellow/10 p-3 text-xs leading-5 text-brand-yellow">{restaurant?.pickup_instructions || (locale === 'ar' ? 'سنرسل لك رمز الاستلام. لا حاجة لإدخال عنوان ولن تُحسب رسوم توصيل.' : locale === 'de' ? 'Du erhältst einen Abholcode. Keine Adresse und keine Liefergebühr nötig.' : 'You will receive a pickup code. No address or delivery fee is required.')}</p> : null}
          </section>

          {fulfillmentType === 'delivery' ? <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-live-gradient flex items-center justify-center shadow-glow-info flex-shrink-0">
                <MapPin className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white text-sm">{t.customer?.deliveryAddress ?? t.customer?.selectAddress}</h3>
                <p className="text-xs text-text-secondary mt-0.5">{t.customer?.savedAddressesHint ?? ''}</p>
              </div>
            </div>

            {savedAddresses.length > 0 && (
              <div className="mb-3">
                <SavedAddressChips
                  addresses={savedAddresses}
                  selectedId={selectedAddressId}
                  onSelect={(addr) => {
                    setSelectedAddressId(addr.id);
                    const fullAddress = [addr.street, addr.city].filter(Boolean).join(', ');
                    setAddress(fullAddress);
                    setAddressLat(addr.lat ?? null);
                    setAddressLng(addr.lng ?? null);
                    setAddressVerified(addr.lat != null && addr.lng != null);
                    if (addr.lat != null && addr.lng != null) {
                      setCartAddress({
                        address: fullAddress,
                        street: addr.street,
                        city: addr.city,
                        postal_code: addr.postal ?? '',
                        lat: addr.lat,
                        lng: addr.lng,
                      });
                    }
                  }}
                  onAddNew={() => {
                    setSelectedAddressId(null);
                    setAddress('');
                    setAddressLat(null);
                    setAddressLng(null);
                    setAddressVerified(false);
                  }}
                  t={{
                    home: t.customer?.addressHome,
                    work: t.customer?.addressWork,
                    other: t.customer?.addressOther,
                    addNew: t.customer?.addNewAddress,
                    savedAddresses: t.customer?.savedAddresses,
                  }}
                />
              </div>
            )}

            <AddressInput
              value={address}
              lat={addressLat}
              lng={addressLng}
              onInputChange={(value) => {
                setAddress(value);
                setAddressLat(null);
                setAddressLng(null);
                setAddressVerified(false);
                setSelectedAddressId(null);
              }}
              onChange={(sel) => {
                setAddress(sel.address);
                setAddressLat(sel.lat);
                setAddressLng(sel.lng);
                setCartAddress({
                  address: sel.address,
                  street: sel.address,
                  city: '',
                  postal_code: sel.address.match(/\b\d{5}\b/)?.[0] ?? '',
                  lat: sel.lat,
                  lng: sel.lng,
                });
                setAddressVerified(true);
                setSelectedAddressId(null);
              }}
              placeholder={t.customer?.deliveryAddress}
            />

            {address.trim() && !addressVerified ? (
              <div className="mt-3">
                <AddressWithMap
                  address={address}
                  lat={addressLat}
                  lng={addressLng}
                  variant="customer"
                  compact
                  showNavigation={false}
                />
              </div>
            ) : null}

            <div className="mt-4 space-y-3 border-t border-edge pt-4" data-testid="delivery-preferences">
              <fieldset>
                <legend className="text-sm font-semibold text-text-primary">
                  {locale === 'ar' ? 'طريقة التسليم' : locale === 'de' ? 'Übergabe' : 'Handoff'}
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['hand_to_me', 'leave_at_door'] as const).map((handoff) => <button key={handoff} type="button" aria-pressed={deliveryPreferences.handoff === handoff} onClick={() => setDeliveryPreferences({ handoff })} className={cn('min-h-12 rounded-xl border px-3 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/60', deliveryPreferences.handoff === handoff ? 'border-brand-red bg-brand-red/15 text-white' : 'border-edge bg-black/20 text-text-secondary')}>
                    {handoff === 'hand_to_me' ? (locale === 'ar' ? 'سلّمني باليد' : locale === 'de' ? 'Persönlich übergeben' : 'Hand to me') : (locale === 'ar' ? 'اتركه عند الباب' : locale === 'de' ? 'Vor der Tür abstellen' : 'Leave at door')}
                  </button>)}
                </div>
              </fieldset>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-semibold text-text-secondary"><span>{locale === 'ar' ? 'اسم المستلم' : locale === 'de' ? 'Empfänger' : 'Recipient'}</span><input value={deliveryPreferences.recipient_name} onChange={(event) => setDeliveryPreferences({ recipient_name: event.target.value })} maxLength={80} autoComplete="name" className="mt-1 min-h-11 w-full rounded-xl border border-edge bg-ink-700 px-3 text-sm text-white outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20" /></label>
                <label className="text-xs font-semibold text-text-secondary"><span>{locale === 'ar' ? 'الاسم على الجرس' : locale === 'de' ? 'Name an der Klingel' : 'Name on bell'}</span><input value={deliveryPreferences.bell_name} onChange={(event) => setDeliveryPreferences({ bell_name: event.target.value })} maxLength={80} className="mt-1 min-h-11 w-full rounded-xl border border-edge bg-ink-700 px-3 text-sm text-white outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20" /></label>
                <label className="text-xs font-semibold text-text-secondary"><span>{locale === 'ar' ? 'الطابق' : locale === 'de' ? 'Etage' : 'Floor'}</span><input value={deliveryPreferences.floor} onChange={(event) => setDeliveryPreferences({ floor: event.target.value })} maxLength={20} inputMode="text" className="mt-1 min-h-11 w-full rounded-xl border border-edge bg-ink-700 px-3 text-sm text-white outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20" /></label>
              </div>
              <label htmlFor="cart-notes" className="text-sm font-semibold text-text-primary block mb-1.5">
                {t.customer?.notes ?? 'Notiz an Fahrer'}
              </label>
              <textarea
                id="cart-notes"
                value={deliveryPreferences.instructions}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder={t.customer?.notesPlaceholder ?? 'Hinweise für den Fahrer (optional)'}
                maxLength={MAX_NOTES_LEN}
                rows={2}
                aria-describedby="cart-notes-hint"
                className="w-full px-3 py-2 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted text-sm focus:border-cyan focus:ring-2 focus:ring-cyan/20 focus:outline-none transition-all resize-none"
              />
              <p id="cart-notes-hint" className="text-[10px] text-text-muted mt-1" aria-live="polite">
                {deliveryPreferences.instructions.length}/{MAX_NOTES_LEN}
              </p>
            </div>
          </div> : null}
        </div>

        {/* ── Promo code ───────────────────────────── */}
        <PromoCodeInput
          applied={appliedCoupon}
          onApply={async (code) => {
            await applyCoupon(code);
          }}
          onClear={() => {
            setCouponOverride(null);
            setStoredCouponCode(null);
          }}
          subtotal={subtotal}
          t={{
            title: t.customer?.promoTitle,
            placeholder: t.customer?.couponPlaceholder,
            apply: t.customer?.apply,
            applied: t.customer?.promoApplied,
            remove: t.customer?.promoRemove,
            invalid: t.customer?.promoInvalid,
            expired: t.customer?.promoExpired,
            minOrder: (m: string) => `${t.customer?.promoMinOrder ?? ''}: ${m}`,
            discount: t.customer?.promoAppliedDiscount,
            free: t.customer?.promoFreeDelivery,
          }}
        />

        {/* ── Tip ───────────────────────────────────── */}
        <TipSelector
          tip={tip}
          subtotal={subtotal}
          onChange={(v) => {
            const clamped = Math.max(0, Math.min(500, Number(v) || 0));
            setTip(clamped);
            trackEvent('tip_changed', {});
          }}
          t={{
            title: t.customer?.tipTitle,
            subtitle: t.customer?.tipSubtitle,
            none: t.customer?.tipNone,
            custom: t.customer?.tipCustom,
            note: t.customer?.tipNote,
          }}
        />

        {/* ── Payment ───────────────────────────────── */}
        <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-premium-gradient flex items-center justify-center shadow-glow-violet flex-shrink-0">
              <Wallet className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">{t.customer?.payMethod}</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {paymentMethod === 'cash'
                  ? translate('customer.payCashDesc', 'Bezahle bei Lieferung')
                  : paymentMethod === 'stripe'
                  ? translate('customer.payOnlineDesc', 'Sichere Online-Zahlung')
                  : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaymentMethod('cash')}
              aria-pressed={paymentMethod === 'cash'}
              className={cn(
                'h-14 rounded-xl flex items-center justify-center gap-2.5 border-2 transition-all duration-200 ease-silk active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-400/50',
                paymentMethod === 'cash'
                  ? 'bg-tip-gradient text-white border-emerald-400/60 shadow-glow-success'
                  : 'bg-surface text-text-secondary border-edge hover:bg-surface-light hover:text-white hover:border-edge-strong',
              )}
            >
              <Banknote className="w-5 h-5" />
              <span className="text-sm font-extrabold">{t.customer?.payCash}</span>
            </button>

            <button
              onClick={() => setPaymentMethod('stripe')}
              aria-pressed={paymentMethod === 'stripe'}
              className={cn(
                'h-14 rounded-xl flex items-center justify-center gap-2.5 border-2 transition-all duration-200 ease-silk active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-400/50',
                paymentMethod === 'stripe'
                  ? 'bg-live-gradient text-white border-cyan-400/60 shadow-glow-info'
                  : 'bg-surface text-text-secondary border-edge hover:bg-surface-light hover:text-white hover:border-edge-strong',
              )}
            >
              <Wallet className="w-5 h-5" />
              <span className="text-sm font-extrabold">{t.customer?.payOnline}</span>
            </button>
          </div>
        </div>

        {/* ── Totals (server-computed) ──────────────── */}
        <div className="rounded-2xl bg-surface-elevated border border-edge p-4 space-y-2 text-sm" aria-live="polite">
          <div className="flex justify-between text-text-secondary">
            <span>{t.customer?.subtotal}</span>
            <span className="font-bold text-white tabular-nums">{formatEUR(subtotal)}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>{fulfillmentType === 'pickup' ? (locale === 'ar' ? 'الاستلام' : locale === 'de' ? 'Abholung' : 'Pickup') : t.customer?.delivery}</span>
            <span className="font-bold text-white tabular-nums">
              {deliveryBaseFee === 0 ? (t.customer?.free ?? 'Gratis') : formatEUR(deliveryBaseFee)}
            </span>
          </div>
          {quote?.delivery_fee_surge_active && deliverySurge > 0 && <div className="flex justify-between text-amber-300">
            <span>{locale === 'ar' ? 'تعديل رسوم وقت الذروة' : locale === 'de' ? 'Auslastungszuschlag' : 'Peak-time delivery adjustment'} · ×{quote.delivery_fee_multiplier?.toFixed(2)}</span>
            <span className="font-bold tabular-nums">+ {formatEUR(deliverySurge)}</span>
          </div>}
          <div className="flex justify-between text-text-secondary">
            <span>{t.customer?.serviceFee}</span>
            <span className="font-bold text-white tabular-nums">{formatEUR(serviceFee)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>{t.customer?.discount}</span>
              <span className="font-bold tabular-nums">- {formatEUR(discount)}</span>
            </div>
          )}
          {tip > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>{t.customer?.tip}</span>
              <span className="font-bold tabular-nums">{formatEUR(tip)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-white font-extrabold pt-3 mt-2 border-t border-edge">
            <span className="text-base">{t.customer?.total}</span>
            <span className="bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active bg-clip-text text-transparent text-2xl tabular-nums">
              {formatEUR(total)}
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 flex items-start gap-2" role="alert">
            <X className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger font-medium">{error}</p>
          </div>
        )}

        {checkoutBlockers.length > 0 && (
          <div
            id="checkout-blockers"
            className="rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 p-4"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-yellow" aria-hidden />
              <div>
                <p className="text-sm font-extrabold text-text-primary">
                  {locale === 'ar' ? 'قبل إتمام الطلب' : locale === 'de' ? 'Vor dem Bezahlen' : 'Before checkout'}
                </p>
                <ul className="mt-2 space-y-1 text-sm leading-5 text-text-secondary">
                  {checkoutBlockers.map((message) => <li key={message}>• {message}</li>)}
                </ul>
                {quoteError && (
                  <button
                    type="button"
                    onClick={() => void fetchQuote()}
                    disabled={quoteLoading || !online}
                    className="mt-3 min-h-11 rounded-xl border border-brand-yellow/40 bg-brand-yellow/10 px-4 text-sm font-extrabold text-brand-yellow transition hover:bg-brand-yellow/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {quoteLoading
                      ? (locale === 'ar' ? 'جارٍ التحقق…' : locale === 'en' ? 'Checking…' : 'Wird geprüft…')
                      : (locale === 'ar' ? 'إعادة التحقق من السلة' : locale === 'en' ? 'Retry cart check' : 'Warenkorb erneut prüfen')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Continue to the distinct checkout review step ── */}
        <button
          onClick={submitOrder}
          disabled={submitting || !canCheckout}
          aria-busy={submitting}
          aria-describedby={checkoutBlockers.length > 0 ? 'checkout-blockers' : undefined}
          className={cn(
            'w-full h-14 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2',
            'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-glow',
            'hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]',
            'transition-all duration-200 ease-silk',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
            'focus:outline-none focus:ring-4 focus:ring-brand-red-500/40',
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>
                {locale === 'ar' ? 'جارٍ فتح الدفع…' : locale === 'en' ? 'Opening checkout…' : 'Kasse wird geöffnet…'}
              </span>
            </>
          ) : (
            <>
              <span>{locale === 'ar' ? 'متابعة إلى الدفع' : locale === 'en' ? 'Continue to checkout' : 'Weiter zur Kasse'}</span>
              <span className="opacity-50 mx-0.5">·</span>
              <span className="tabular-nums">{formatEUR(total)}</span>
              <ChevronRight className="w-5 h-5 rtl:rotate-180" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-text-muted">
          {locale === 'ar'
            ? 'لن يتم إنشاء الطلب بعد. ستراجع السعر والمنتجات قبل الالتزام بالدفع.'
            : locale === 'en'
              ? 'No order is placed yet. You will review the items and total before committing to pay.'
              : 'Noch keine Bestellung. Sie prüfen Artikel und Gesamtpreis vor der zahlungspflichtigen Bestellung.'}
        </p>
      </div>
    </>
  );
}

// ── Cart analytics — privacy-friendly ─────────────
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    if (!hasAnalyticsConsent()) return;
    if (!navigator.onLine) return;
    const payload = JSON.stringify({ event, data: data || {}, ts: Date.now() });
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon('/api/analytics/cart', payload);
      } catch {
        // Silent
      }
    }
  } catch {
    // Analytics must never break the cart page
  }
}
