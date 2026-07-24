'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CART_TRACE_TAG = '[BLINKGO_AUTH_TRACE:v77:cart_page]';
function cartTrace(event: string, data: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.error(CART_TRACE_TAG, event, JSON.stringify(data));
}
import { Minus, Plus, Trash2, MapPin, X, Loader2, Wallet, Banknote, ChevronRight, Sparkles } from 'lucide-react';
import { useCart } from '@/lib/cart-store';
import { createBrowserClient } from '@/lib/supabase/client';
import { useRef } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient } from '@/components/shared/EmptyStateClient';
import { useToast } from '@/components/ui/Toast';
import { useT, useI18n } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';
import { haversineKm, formatDistance, effectiveRadiusMeters, isValidCoord } from '@/lib/maps/distance';
import { AddressWithMap } from '@/components/shared/AddressWithMap';
import { TipSelector } from '@/components/cart/TipSelector';
import { PromoCodeInput } from '@/components/cart/PromoCodeInput';
import { ScheduleOrderPicker } from '@/components/cart/ScheduleOrderPicker';
import { SavedAddressChips, type SavedAddress } from '@/components/cart/SavedAddressChips';
import { AddressInput } from '@/components/maps/AddressInput';
import { cn } from '@/lib/cn';

export default function CartPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const { locale } = useI18n();
  const items = useCart((s) => s.items ?? []);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const subtotal = useCart((s) => s.subtotal() ?? 0);
  const clearCart = useCart((s) => s.clear);
  const tip = useCart((s) => s.tip ?? 0);
  const setTip = useCart((s) => s.setTip);
  const notes = useCart((s) => s.notes ?? '');
  const setNotes = useCart((s) => s.setNotes);

  const [address, setAddress] = useState('');
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);
  const [addressVerified, setAddressVerified] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'stripe'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; type: string } | null>(null);
  const [, setCouponLoading] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);

  // Mock saved addresses (will be replaced with DB-backed query in real impl)
  const savedAddresses: SavedAddress[] = [];
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const deliveryFee = 3.99;
  const serviceFee = subtotal * 0.05;
  const discount = appliedCoupon?.discount ?? 0;
  const total = Math.max(0, subtotal + deliveryFee + serviceFee + tip - discount);

  const restaurantName = items[0]?.restaurant_name ?? t.nav.restaurants;

  if (items.length === 0) {
    return (
      <>
        <PageHeader title={t.nav.cart} back />
        <div className="max-w-2xl mx-auto px-4 py-6 sm:py-12">
          <EmptyStateClient
            iconName="ShoppingBag"
            title={t.customer.emptyCart}
            description={t.customer.emptyCartDesc}
            action={{
              label: t.customer.browseRestaurants,
              href: '/restaurants',
            }}
            action2={{
              label: t.customer.searchPlaceholder || (t as any).customer?.searchPlaceholder || 'Suchen',
              href: '/search',
            }}
          />
          {/* Quick suggestions */}
          <div className="mt-8 sm:mt-12">
            <h3 className="text-sm font-bold text-text-secondary mb-4 px-1">
              {(t as any).customer?.popularCuisines || 'Beliebte Küchen'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {((t as any).customer?.popularCuisineItems as string[] | undefined) || (locale === 'ar'
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

  async function applyCoupon(codeOverride?: string) {
    const code = (codeOverride ?? coupon).trim();
    if (!code) return;
    setCouponLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data, error: couponError } = await supabase
        .from('coupons')
        .select('code, type, value, min_order_amount, max_discount, is_active, start_date, end_date')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (couponError || !data) throw new Error(t.errors?.invalidCoupon ?? 'Ungültiger Code');

      const now = new Date();
      if (new Date(data.start_date) > now || new Date(data.end_date) < now) {
        throw new Error(t.errors?.expiredCoupon ?? 'Abgelaufen');
      }

      if (data.min_order_amount && subtotal < Number(data.min_order_amount)) {
        throw new Error(`${t.errors?.minOrderRequired ?? 'Mindestbestellwert'}: ${formatEUR(Number(data.min_order_amount))}`);
      }

      let discountAmount = 0;
      if (data.type === 'percentage') {
        discountAmount = (subtotal * Number(data.value)) / 100;
        if (data.max_discount) discountAmount = Math.min(discountAmount, Number(data.max_discount));
      } else if (data.type === 'fixed') {
        discountAmount = Number(data.value);
      }
      setAppliedCoupon({ code: data.code, discount: discountAmount, type: data.type });
      toast({ type: 'success', message: `${t.customer?.codeCopied ?? 'Code'}: ${data.code}` });
    } catch (e: any) {
      toast({ type: 'error', message: e.message ?? t.errors?.generic ?? 'Fehler' });
      throw e;
    } finally {
      setCouponLoading(false);
    }
  }

  // SECURITY: Idempotency key prevents duplicate orders from network retries
  // or rapid double-tap. Stored in ref so it persists across re-renders.
  const idempotencyKeyRef = useRef<string | null>(null);
  // Debounce protection: if a submit is already in flight, ignore subsequent clicks
  const submitInFlightRef = useRef(false);

  async function submitOrder() {
    // Idempotency: if a submit is already running, return immediately
    if (submitInFlightRef.current) return;

    if (!address.trim()) {
      setError(t.errors?.addressRequired ?? 'Adresse erforderlich');
      return;
    }
    if (!addressLat || !addressLng) {
      setError(
        (t as any).customer?.addressNotVerified ??
          'Bitte verifizieren Sie Ihre Adresse (Karte oder "Meinen Standort verwenden").'
      );
      return;
    }
    if (items.length === 0) return;

    // Client-side delivery distance check (immediate feedback before API call).
    // FIX (v83): previously this used a flat 5 km cap (DEFAULT_DELIVERY_RADIUS_M)
    // that was STRICTER than the server rule, blocking valid orders before the
    // API was ever called — the production "عنوان التوصيل بعيد جداً" bug.
    // Now it uses the exact same rule as /api/orders: the restaurant's own
    // delivery_radius_km when configured, else the platform fallback.
    // (Zone-based acceptance is server-side only, so this client check can
    // only ever be equal to or MORE permissive than the server — never stricter.)
    // FIX (v92): `!= null` accepted 0/0 from restaurants that were never
    // geocoded, yielding ~5688 km and blocking every valid address. When the
    // cart lacks usable restaurant coordinates (e.g. an item persisted by an
    // older cart schema), we do NOT guess and do NOT apply a fixed fallback —
    // we defer to the server's canonical checkDeliveryDistance in /api/orders,
    // which re-reads the restaurant row fresh. The client check therefore stays
    // equal to or more permissive than the server, never stricter.
    const canValidateLocally =
      isValidCoord(items[0]?.restaurant_lat, items[0]?.restaurant_lng) &&
      isValidCoord(addressLat, addressLng);
    if (canValidateLocally) {
      const km = haversineKm(
        { lat: Number(items[0].restaurant_lat), lng: Number(items[0].restaurant_lng) },
        { lat: Number(addressLat), lng: Number(addressLng) }
      );
      const maxKm = effectiveRadiusMeters({ delivery_radius_km: items[0]?.restaurant_delivery_radius_km }) / 1000;
      if (km > maxKm) {
        setError(
          (t as any).errors?.tooFar ??
            `Die Lieferadresse ist ${km.toFixed(1)} km vom Restaurant entfernt. Maximale Entfernung: ${maxKm} km.`
        );
        return;
      }
    }

    // Client-side minimum order check
    const minOrder = items[0]?.restaurant_min_order;
    if (minOrder && minOrder > 0 && subtotal < minOrder) {
      setError(
        (t as any).errors?.minOrderRequired
          ? `${(t as any).errors.minOrderRequired}: ${formatEUR(minOrder)}`
          : `Mindestbestellwert: ${formatEUR(minOrder)}`
      );
      return;
    }

    // Generate idempotency key on first submit
    if (!idempotencyKeyRef.current) {
      // crypto.randomUUID is supported in all modern browsers
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    setError(null);

    // SAFETY: Hard timeout so we never hang the UI on a slow request.
    // 25s matches typical Stripe checkout timeouts.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        cartTrace('client_redirect_to_login', { trigger: 'getUser_returned_null', target: '/login' });
        router.push('/login');
        return;
      }

      // Get session token for authenticated API call
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      // Call the server-side order endpoint (server-authoritative pricing)
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          restaurant_id: items[0].restaurant_id,
          items: items.map((it) => ({
            product_id: it.product_id,
            quantity: it.quantity,
          })),
          payment_method: paymentMethod,
          delivery_address: {
            address: address,
            lat: addressLat,
            lng: addressLng,
            notes: notes,
          },
          tip,
          coupon_code: appliedCoupon?.code,
          scheduled_for: scheduledFor?.toISOString(),
        }),
        signal: controller.signal,
      });

      const json = await res.json().catch(() => null);
      clearTimeout(timeout);

      // Network/server errors
      if (!res.ok || !json) {
        if (res.status === 429) {
          throw new Error(t.errors?.rateLimited ?? 'Zu viele Anfragen. Bitte versuche es in einer Minute erneut.');
        }
        if (res.status === 401 || res.status === 403) {
          // Session expired — redirect to login
          cartTrace('client_redirect_to_login', { trigger: 'api_401_or_403', target: '/login', api_status: res.status });
          router.push('/login');
          throw new Error(t.errors?.sessionExpired ?? 'Sitzung abgelaufen. Bitte melde dich erneut an.');
        }
        if (res.status >= 500) {
          throw new Error(t.errors?.serverError ?? 'Server-Fehler. Bitte versuche es in wenigen Minuten erneut.');
        }
        throw new Error(t.errors?.orderFailed ?? 'Bestellung fehlgeschlagen');
      }
      if (!json.ok) {
        // Get the actual error message from server
        const errMsg = json.error?.message || json.error || t.errors?.orderFailed || 'Bestellung fehlgeschlagen';
        throw new Error(typeof errMsg === 'string' ? errMsg : (t.errors?.orderFailed ?? 'Bestellung fehlgeschlagen'));
      }

      const orderId = json.data?.order?.id;
      if (!orderId) throw new Error('No order id returned');

      // SUCCESS: clear idempotency key so a future order can be placed
      idempotencyKeyRef.current = null;
      clearCart();
      toast({ type: 'success', message: t.customer.orderPlaced ?? 'Bestellt!' });
      router.push(`/orders/${orderId}`);
    } catch (e: any) {
      // AbortError means the timeout fired
      if (e?.name === 'AbortError') {
        setError(t.errors?.timeout ?? 'Die Verbindung dauerte zu lange. Bitte prüfe dein Internet und versuche es erneut.');
        // Reset idempotency key on timeout — server may not have received it
        idempotencyKeyRef.current = null;
      } else {
        setError(e.message ?? t.errors?.orderFailed ?? 'Fehler');
      }
    } finally {
      clearTimeout(timeout);
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  // Replace the entire cart page below with version that uses new components
  return (
    <>
      <PageHeader title={t.nav.cart} subtitle={restaurantName} back />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-32">
        {/* ─── Items ─── */}
        <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          <div className="px-4 py-3.5 border-b border-edge flex items-center justify-between">
            <h3 className="font-extrabold text-white text-sm">
              {t.customer.items} <span className="text-text-muted font-normal">({items.length})</span>
            </h3>
            <span className="text-xs text-brand-red-500 font-bold">{formatEUR(subtotal)}</span>
          </div>

          <div className="divide-y divide-edge">
            {items.map((item) => (
              <div key={item.product_id} className="flex items-center gap-3 p-4">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.product_name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-red-500/15 to-brand-yellow-500/10 border border-brand-red-500/20 flex items-center justify-center text-brand flex-shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate text-sm">{item.product_name}</p>
                  <p className="text-xs text-text-muted mt-0.5">{formatEUR(Number(item.product_price))}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={() => setQuantity(item.product_id, Math.max(1, item.quantity - 1))}
                      aria-label="Decrease"
                      className="w-7 h-7 rounded-lg bg-surface border border-edge hover:border-brand-red-500 hover:bg-brand-red-500/10 text-white flex items-center justify-center transition-all"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center text-sm font-extrabold text-white tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => setQuantity(item.product_id, item.quantity + 1)}
                      aria-label="Increase"
                      className="w-7 h-7 rounded-lg bg-surface border border-edge hover:border-brand-red-500 hover:bg-brand-red-500/10 text-white flex items-center justify-center transition-all"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className="font-extrabold text-white text-sm tabular-nums">
                    {formatEUR(Number(item.product_price) * item.quantity)}
                  </span>
                  <button
                    onClick={() => remove(item.product_id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
                    aria-label={t.common?.delete ?? 'Entfernen'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Schedule + Address ─── */}
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

          <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-live-gradient flex items-center justify-center shadow-glow-info flex-shrink-0">
                <MapPin className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white text-sm">{t.customer?.deliveryAddress ?? t.customer?.selectAddress}</h3>
                <p className="text-xs text-text-secondary mt-0.5">{t.customer?.savedAddressesHint ?? ''}</p>
              </div>
            </div>

            {/* Saved addresses (only if any) */}
            {savedAddresses.length > 0 && (
              <div className="mb-3">
                <SavedAddressChips
                  addresses={savedAddresses}
                  selectedId={selectedAddressId}
                  onSelect={(addr) => {
                    setSelectedAddressId(addr.id);
                    setAddress(`${addr.street}, ${addr.city}`);
                  }}
                  onAddNew={() => setAddress('')}
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
              onChange={(sel) => {
                setAddress(sel.address);
                setAddressLat(sel.lat);
                setAddressLng(sel.lng);
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

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.customer?.notes ?? 'Notiz an Fahrer'}
              className="w-full mt-3 px-3 py-2 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted text-sm focus:border-cyan focus:ring-2 focus:ring-cyan/20 focus:outline-none transition-all resize-none"
              rows={2}
            />
          </div>
        </div>

        {/* ─── Promo code ─── */}
        <PromoCodeInput
          applied={appliedCoupon}
          onApply={async (code) => {
            await applyCoupon(code);
          }}
          onClear={() => {
            setAppliedCoupon(null);
            setCoupon('');
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

        {/* ─── Tip ─── */}
        <TipSelector
          tip={tip}
          subtotal={subtotal}
          onChange={setTip}
          t={{
            title: t.customer?.tipTitle,
            subtitle: t.customer?.tipSubtitle,
            none: t.customer?.tipNone,
            custom: t.customer?.tipCustom,
            note: t.customer?.tipNote,
          }}
        />

        {/* ─── Payment ─── */}
        <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-premium-gradient flex items-center justify-center shadow-glow-violet flex-shrink-0">
              <Wallet className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">{t.customer?.payMethod}</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {paymentMethod === 'cash' 
                  ? (t as any).customer?.payCashDesc ?? 'Bezahle bei Lieferung'
                  : paymentMethod === 'stripe'
                  ? (t as any).customer?.payOnlineDesc ?? 'Sichere Online-Zahlung'
                  : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaymentMethod('cash')}
              aria-pressed={paymentMethod === 'cash'}
              className={cn(
                'h-14 rounded-xl flex items-center justify-center gap-2.5 border-2 transition-all duration-200 ease-silk active:scale-[0.98]',
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
                'h-14 rounded-xl flex items-center justify-center gap-2.5 border-2 transition-all duration-200 ease-silk active:scale-[0.98]',
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

        {/* ─── Totals ─── */}
        <div className="rounded-2xl bg-surface-elevated border border-edge p-4 space-y-2 text-sm">
          <div className="flex justify-between text-text-secondary">
            <span>{t.customer?.subtotal}</span>
            <span className="font-bold text-white tabular-nums">{formatEUR(subtotal)}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>{t.customer?.delivery}</span>
            <span className="font-bold text-white tabular-nums">{formatEUR(deliveryFee)}</span>
          </div>
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
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 flex items-start gap-2">
            <X className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger font-medium">{error}</p>
          </div>
        )}

        {/* ─── Place order CTA ─── */}
        <button
          onClick={submitOrder}
          disabled={submitting || !address.trim()}
          className={cn(
            'w-full h-14 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2',
            'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-glow',
            'hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]',
            'transition-all duration-200 ease-silk',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Wird bestellt...</span>
            </>
          ) : (
            <>
              <span>{t.customer?.placeOrder}</span>
              <span className="opacity-50 mx-0.5">·</span>
              <span className="tabular-nums">{formatEUR(total)}</span>
              <ChevronRight className="w-5 h-5 rtl:rotate-180" />
            </>
          )}
        </button>

        {/* Small note */}
        <p className="text-center text-xs text-text-muted">
          {(t as any).customer?.termsNotice ?? (
            locale === 'ar'
              ? 'بالنقر على "تقديم الطلب" فإنك توافق على شروطنا وتلتزم بالسعر المعروض.'
              : locale === 'en'
              ? 'By tapping "Place order" you agree to our Terms and commit to the displayed price.'
              : 'Mit dem Tippen auf „Bestellung aufgeben" bestätigst du unsere AGB und den angezeigten Gesamtbetrag.'
          )}
        </p>
      </div>
    </>
  );
}
