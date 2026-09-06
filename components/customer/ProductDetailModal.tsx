'use client';

/**
 * ProductDetailModal — full product configurator with modifiers.
 *
 * Opens when a user clicks a product card on the Restaurant Page.
 * Renders inside a BottomSheet for mobile-native feel.
 *
 * Phase 7D — Production-certified for commercial use.
 *
 * Responsibilities:
 *   1. Show product image (with gallery + broken-image fallback + zoom)
 *   2. Show all product metadata: name, description, badges, prep time, calories, allergens
 *   3. Render all modifier groups (radio / checkbox) with proper validation
 *   4. Validate required modifiers and min/max selections
 *   5. Compute live total (base + modifier price_deltas) × quantity
 *   6. Special instructions (notes) — sanitized input, character counter
 *   7. Quantity stepper with bounds (1-99)
 *   8. Add to cart via /api/cart/validate (server-issued canonical key)
 *   9. Re-check product availability on modal open
 *  10. Detect and warn about price changes during edit
 *  11. Block add when restaurant becomes paused / hidden
 *  12. Block add when product becomes out-of-stock
 *  13. Focus first invalid modifier group on validation error
 *  14. A11y: focus trap, ESC, ARIA roles, aria-live on price
 *  15. Track analytics events: product_viewed, modifier_changed, add_to_cart_*
 *  16. Reduced motion support
 *  17. RTL-safe (Arabic) and LTR (German, English)
 *
 * Security:
 *   - Notes are sanitized via sanitizeText() (control char stripping, max length)
 *   - Server-issued CartKey is the source of truth for line identity
 *   - All prices are server-computed; client unit price is display-only
 *   - Tampered modifier IDs are rejected by /api/cart/validate
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useCart } from '@/lib/cart-store';
import type { CartLineConfiguration } from '@/lib/cart-key';
import { useToast } from '@/components/ui/Toast';
import { formatEUR } from '@/lib/foundation/format';
import { sanitizeText } from '@/lib/foundation/validation';
import { cn } from '@/lib/cn';
import { CatalogImage } from '@/components/customer/CatalogImage';
import { hasAnalyticsConsent } from '@/lib/privacy/consent';
import Check from 'lucide-react/dist/esm/icons/check';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import Minus from 'lucide-react/dist/esm/icons/minus';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Star from 'lucide-react/dist/esm/icons/star';
import Flame from 'lucide-react/dist/esm/icons/flame';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Leaf from 'lucide-react/dist/esm/icons/leaf';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import ZoomIn from 'lucide-react/dist/esm/icons/zoom-in';
import X from 'lucide-react/dist/esm/icons/x';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

// ── Types ──────────────────────────────────────────

export interface ProductModifierOption {
  id: string;
  name: string;
  price_delta: number;
}

export interface ProductModifier {
  id: string;
  name: string;
  type: 'radio' | 'checkbox';
  required: boolean;
  min_select: number;
  max_select: number;
  options: ProductModifierOption[];
}

export interface ProductDetailData {
  id: string;
  name: string;
  description: string;
  price: number;
  discount_price?: number | null;
  image_urls: string[];
  category: string;
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_gluten_free?: boolean;
  is_featured?: boolean;
  is_available?: boolean;
  prep_time_min?: number;
  calories?: number;
  allergens?: string[];
  ingredients?: string[];
  product_kind?: 'prepared_food' | 'prepacked_food' | 'beverage' | 'alcohol' | 'non_food';
  legal_name?: string | null;
  net_quantity?: number | null;
  net_quantity_unit?: string | null;
  base_price?: number | null;
  base_price_unit?: string | null;
  ingredients_text?: string | null;
  additives?: string[];
  nutrition?: Record<string, number>;
  country_of_origin?: string | null;
  producer_name?: string | null;
  producer_address?: string | null;
  storage_instructions?: string | null;
  usage_instructions?: string | null;
  alcohol_percentage?: number | null;
  minimum_age?: 16 | 18 | null;
  legal_information_complete?: boolean;
  sold_count?: number;
  rating?: number;
  modifiers?: ProductModifier[];
}

export type RestaurantStatus = 'open' | 'closed' | 'busy' | 'paused' | 'hidden';

export interface RestaurantState {
  status: RestaurantStatus;
  isAvailable: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  product: ProductDetailData | null;
  restaurantId: string;
  restaurantName: string;
  restaurantMinOrder?: number;
  /** Already-in-cart quantity for this product (for "in cart" indicator) */
  initialInCartQty?: number;
  /** Restaurant business state — controls whether add is allowed. */
  restaurantState?: RestaurantState;
  /** Loading indicator: product data is being fetched. */
  loading?: boolean;
  /** Adjusts customer-facing copy without changing the existing cart/API contract. */
  merchantKind?: 'restaurant' | 'retail';
  /** When present, the validated line is written to this group instead of the personal cart. */
  groupOrderId?: string;
}

// ── Constants ──────────────────────────────────────

const MAX_NOTES_LEN = 300;
const MAX_QUANTITY = 99;
const MIN_QUANTITY = 1;
const PRODUCT_AVAILABILITY_RECHECK_MS = 30_000; // 30s

const BADGE_META: Array<{
  key: keyof ProductDetailData;
  tone: 'success' | 'brand' | 'amber' | 'red';
  icon: ComponentType<{ className?: string }>;
  i18n: string;
}> = [
  { key: 'is_featured', tone: 'brand', icon: Star, i18n: 'productDetail.bestsellerBadge' },
  { key: 'is_vegan', tone: 'success', icon: Leaf, i18n: 'productDetail.veganBadge' },
  { key: 'is_vegetarian', tone: 'success', icon: Leaf, i18n: 'productDetail.vegetarianBadge' },
  { key: 'is_gluten_free', tone: 'amber', icon: Sparkles, i18n: 'productDetail.glutenFreeBadge' },
];

// ── Component ──────────────────────────────────────

export function ProductDetailModal({
  open,
  onClose,
  product,
  restaurantId,
  restaurantName,
  restaurantState,
  loading = false,
  merchantKind = 'restaurant',
  groupOrderId,
}: Props) {
  const { t, locale } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const online = useOnlineStatus();

  const [quantity, setQuantity] = useState(MIN_QUANTITY);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [modifierQuantities, setModifierQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Server-issued data (after /api/cart/validate)
  const [serverPrice, setServerPrice] = useState<number | null>(null);
  const [priceChanged, setPriceChanged] = useState<{ old: number; new: number } | null>(null);

  // Fresh product data fetched in-modal (for availability / price refresh)
  const [freshProduct, setFreshProduct] = useState<ProductDetailData | null>(null);
  const [imageIdx, setImageIdx] = useState(0);
  const [imageBroken, setImageBroken] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [showValidationHint, setShowValidationHint] = useState(false);

  const lastProductId = useRef<string | null>(null);
  const modifierRefs = useRef<Record<string, HTMLFieldSetElement | null>>({});
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageGalleryRef = useRef<HTMLDivElement>(null);

  // Effective product: prefer fresh data over prop
  const effProduct = freshProduct || product;
  const merchantUnavailable = merchantKind === 'retail'
    ? locale === 'ar'
      ? 'البائع غير متاح حالياً'
      : locale === 'de'
        ? 'Der Händler ist derzeit nicht verfügbar'
        : 'The seller is currently unavailable'
    : t.productDetail.restaurantUnavailable;
  const preparationLabel = effProduct?.prep_time_min == null
    ? ''
    : merchantKind === 'retail'
      ? locale === 'ar'
        ? `وقت التجهيز: ${effProduct.prep_time_min} دقيقة`
        : locale === 'de'
          ? `Bearbeitungszeit: ${effProduct.prep_time_min} Min.`
          : `Handling time: ${effProduct.prep_time_min} min`
      : t.productDetail.prepTime.replace(/\{(?:min|دقيقة)\}/g, String(effProduct.prep_time_min));
  const notesHint = merchantKind === 'retail'
    ? locale === 'ar'
      ? 'اختياري. سيرى البائع هذه الملاحظة مع الطلب.'
      : locale === 'de'
        ? 'Optional. Der Händler sieht diese Notiz zusammen mit der Bestellung.'
        : 'Optional. The seller will see this note with the order.'
    : t.productDetail.notesHint;

  // ── Reset state on product change ───────────────
  useEffect(() => {
    if (!open || !effProduct) return;
    if (lastProductId.current !== effProduct.id) {
      lastProductId.current = effProduct.id;
      setQuantity(MIN_QUANTITY);
      setNotes('');
      setServerPrice(null);
      setPriceChanged(null);
      setImageIdx(0);
      setImageBroken(false);
      setZoomed(false);
      setShowValidationHint(false);
      // Initialize: pick first option as default for required radio
      const init: Record<string, string[]> = {};
      const initQty: Record<string, number> = {};
      for (const m of effProduct.modifiers || []) {
        if (m.type === 'radio' && m.required) {
          const firstOpt = m.options[0]?.id;
          if (firstOpt) {
            init[m.id] = [firstOpt];
            initQty[`${m.id}:${firstOpt}`] = MIN_QUANTITY;
          }
        } else {
          init[m.id] = [];
        }
      }
      setSelected(init);
      setModifierQuantities(initQty);
    }
  }, [open, effProduct]);

  // ── Periodic availability re-check ───────────────
  useEffect(() => {
    if (!open || !effProduct) return;
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => {
      void refreshProduct();
    }, PRODUCT_AVAILABILITY_RECHECK_MS);
    return () => {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effProduct?.id]);

  // ── Swipe gesture for image gallery (touch) ──────
  useEffect(() => {
    if (!open || !effProduct || (effProduct.image_urls || []).length < 2) return;
    let startX = 0;
    let startY = 0;
    let active = false;
    const el = imageGalleryRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      active = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) nextImage();
        else prevImage();
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effProduct?.image_urls]);

  // ── Analytics: product_viewed on open ────────────
  useEffect(() => {
    if (!open || !effProduct) return;
    trackEvent('product_viewed', { product_id: effProduct.id, category: effProduct.category });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effProduct?.id]);

  // ── Refresh product from server ──────────────────
  const refreshProduct = useCallback(async () => {
    if (!effProduct) return;
    if (!online) return; // skip if offline
    try {
      const res = await fetch(`/api/products/${effProduct.id}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.product) {
        setFreshProduct(data.product);
        // Detect server price change
        const localBase = effProduct.discount_price ?? effProduct.price;
        const serverBase = data.product.discount_price ?? data.product.price;
        if (localBase !== serverBase && serverPrice !== null) {
          setPriceChanged({ old: localBase, new: serverBase });
        }
      }
    } catch {
      // Silent failure — keep current data
    }
  }, [effProduct, online, serverPrice]);

  // ── Image gallery navigation ─────────────────────
  function nextImage() {
    if (!effProduct?.image_urls?.length) return;
    setImageIdx((i) => (i + 1) % effProduct.image_urls.length);
    setImageBroken(false);
  }
  function prevImage() {
    if (!effProduct?.image_urls?.length) return;
    setImageIdx((i) => (i - 1 + effProduct.image_urls.length) % effProduct.image_urls.length);
    setImageBroken(false);
  }

  // ── Live total computation (client-side preview) ─
  const basePrice = useMemo(() => {
    if (!effProduct) return 0;
    return effProduct.discount_price ?? effProduct.price;
  }, [effProduct]);

  const modifierTotal = useMemo(() => {
    if (!effProduct) return 0;
    let sum = 0;
    for (const m of effProduct.modifiers || []) {
      const picked = selected[m.id] || [];
      for (const optId of picked) {
        const opt = m.options.find((o) => o.id === optId);
        if (opt) sum += opt.price_delta;
      }
    }
    return sum;
  }, [effProduct, selected]);

  const unitPrice = basePrice + modifierTotal;
  const total = unitPrice * quantity;
  const hasDiscount =
    effProduct?.discount_price != null && effProduct.discount_price < (effProduct?.price ?? Infinity);

  // ── Validation ──────────────────────────────────
  const validationIssues = useMemo(() => {
    if (!effProduct) return [];
    const issues: { modifierId?: string; message: string }[] = [];
    for (const m of effProduct.modifiers || []) {
      const picked = selected[m.id] || [];
      if (m.required && picked.length < m.min_select) {
        issues.push({
          modifierId: m.id,
          message: t.productDetail.modifierRequired,
        });
      }
      if (picked.length > m.max_select) {
        issues.push({
          modifierId: m.id,
          message: t.productDetail.selectUpTo,
        });
      }
    }
    return issues;
  }, [effProduct, selected, t]);

  const firstInvalidModifierId = validationIssues.find((i) => i.modifierId)?.modifierId;

  // ── Availability blockers ───────────────────────
  const restaurantBlocked =
    restaurantState?.status === 'paused' || restaurantState?.status === 'hidden';
  const productBlocked = effProduct?.is_available === false;
  const canSubmit =
    validationIssues.length === 0 &&
    !submitting &&
    !restaurantBlocked &&
    !productBlocked &&
    effProduct != null;

  // ── Toggle modifier option ──────────────────────
  function toggleOption(modifierId: string, optionId: string, type: 'radio' | 'checkbox') {
    setSelected((prev) => {
      const cur = prev[modifierId] || [];
      if (type === 'radio') {
        // Reset quantity for this option
        setModifierQuantities((q) => ({ ...q, [`${modifierId}:${optionId}`]: MIN_QUANTITY }));
        return { ...prev, [modifierId]: [optionId] };
      }
      // checkbox
      if (cur.includes(optionId)) {
        setModifierQuantities((q) => {
          const n = { ...q };
          delete n[`${modifierId}:${optionId}`];
          return n;
        });
        return { ...prev, [modifierId]: cur.filter((x) => x !== optionId) };
      }
      setModifierQuantities((q) => ({ ...q, [`${modifierId}:${optionId}`]: MIN_QUANTITY }));
      trackEvent('modifier_selected', { product_id: effProduct?.id, modifier_id: modifierId, option_id: optionId });
      return { ...prev, [modifierId]: [...cur, optionId] };
    });
  }

  // ── Increment quantity of a checkbox option ──────
  function incrementOptionQty(modifierId: string, optionId: string) {
    const key = `${modifierId}:${optionId}`;
    setModifierQuantities((q) => ({ ...q, [key]: Math.min(MAX_QUANTITY, (q[key] || 1) + 1) }));
  }
  function decrementOptionQty(modifierId: string, optionId: string) {
    const key = `${modifierId}:${optionId}`;
    setModifierQuantities((q) => {
      const cur = q[key] || 1;
      const next = { ...q };
      if (cur <= 1) {
        delete next[key];
        // also unselect
        setSelected((s) => ({
          ...s,
          [modifierId]: (s[modifierId] || []).filter((x) => x !== optionId),
        }));
      } else {
        next[key] = cur - 1;
      }
      return next;
    });
  }

  // ── Focus first invalid modifier group ──────────
  useEffect(() => {
    if (showValidationHint && firstInvalidModifierId) {
      const el = modifierRefs.current[firstInvalidModifierId];
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus();
    }
  }, [showValidationHint, firstInvalidModifierId]);

  // ── Notes change handler (sanitize on input) ────
  function onNotesChange(v: string) {
    // Strip control chars + truncate; preserve user's whitespace until max
    const cleaned = sanitizeText(v, MAX_NOTES_LEN);
    setNotes(cleaned);
  }

  // ── Add to cart ─────────────────────────────────
  async function handleAdd() {
    if (!effProduct) return;
    if (validationIssues.length > 0) {
      setShowValidationHint(true);
      trackEvent('add_to_cart_validation_failed', { product_id: effProduct.id });
      return;
    }
    if (restaurantBlocked) {
      toast.error(merchantUnavailable);
      return;
    }
    if (productBlocked) {
      toast.error(t.productDetail.outOfStock);
      return;
    }
    if (!online) {
      toast.error(t.productDetail.offlineCannotAdd);
      return;
    }
    setSubmitting(true);
    trackEvent('add_to_cart_attempted', { product_id: effProduct.id, quantity });

    try {
      // Server-side validation — server issues the canonical CartKey
      let serverKey: string | undefined;
      let serverUnitPrice: number = unitPrice;
      let validatedConfiguration: CartLineConfiguration | undefined;
      let serverKeyIssuedAt: string | undefined;
      let serverError: string | null = null;
      try {
        const res = await fetch('/api/cart/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurantId,
            items: [{
              product_id: effProduct.id,
              quantity,
              selected_modifiers: selected,
              modifier_quantities: modifierQuantities,
              notes: notes.trim() || undefined,
            }],
          }),
        });
        const data = await res.json().catch(() => ({})) as {
          ok?: boolean;
          issues?: Array<{ message?: string; kind?: string }>;
          lines?: Array<{ config_key: string; unit_price: number; configuration: CartLineConfiguration }>;
          server_key_issued_at?: string;
        };
        if (!res.ok) {
          serverError = extractErrorMessage(data, 'validation_failed');
        } else if (data && data.ok === false && (data.issues || []).length > 0) {
          const issueMsgs = (data.issues || []).map((issue) => issue.message).filter((message): message is string => Boolean(message));
          // Differentiate between price_changed (user can confirm) and
          // hard rejection (deleted, tampered, modifier_invalid).
          const hard = (data.issues || []).filter((issue) =>
            typeof issue.kind === 'string' && ['deleted', 'unavailable', 'tampered', 'modifier_invalid', 'out_of_stock'].includes(issue.kind));
          if (hard.length > 0) {
            toast.error(issueMsgs.join('; '));
            trackEvent('add_to_cart_failed', { product_id: effProduct.id, kind: hard[0]?.kind });
            return;
          }
          if (issueMsgs.length > 0) {
            toast.error(issueMsgs.join('; '));
            return;
          }
        } else {
          const serverLine = (data.lines || [])[0];
          if (serverLine) {
            serverKey = serverLine.config_key;
            serverUnitPrice = serverLine.unit_price;
            validatedConfiguration = serverLine.configuration;
            serverKeyIssuedAt = data.server_key_issued_at;
            // Detect price change
            if (serverUnitPrice !== unitPrice) {
              setPriceChanged({ old: unitPrice, new: serverUnitPrice });
            }
          }
        }
      } catch {
        // Network failure — proceed with locally-computed key; checkout
        // re-validates on the server. Show a warning.
        toast.warning(t.productDetail.networkWarning);
      }

      if (serverError === 'restaurant_unavailable') {
        toast.error(merchantUnavailable);
        return;
      }
      if (serverError === 'deleted' || serverError === 'out_of_stock') {
        toast.error(t.productDetail.outOfStock);
        return;
      }

      const finalConfiguration: CartLineConfiguration =
        validatedConfiguration || {
          selected_modifiers: selected,
          modifier_quantities: modifierQuantities,
          notes: notes.trim() || undefined,
        };

      // Build a short human-readable summary for the cart UI
      const summary = buildConfigSummary(effProduct, finalConfiguration, locale);

      if (groupOrderId) {
        const response = await fetch(`/api/group-orders/${groupOrderId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: effProduct.id, quantity, configuration: finalConfiguration }),
        });
        if (!response.ok) throw new Error('group_item_failed');
      } else cart.add({
        product_id: effProduct.id,
        product_name: effProduct.name,
        product_price: serverUnitPrice,
        image_url: effProduct.image_urls?.[0] ?? null,
        restaurant_id: restaurantId,
        restaurant_name: restaurantName,
        configuration: finalConfiguration,
        config_key: serverKey,
        config_summary: summary,
        server_key_issued_at: serverKeyIssuedAt,
      }, quantity);

      trackEvent('add_to_cart_succeeded', { product_id: effProduct.id, quantity });
      toast.success(
        t.productDetail.addedToCart
          .replace('{name}', effProduct.name)
          .replace('{اسم}', effProduct.name),
      );
      onClose();
    } catch (error: unknown) {
      toast.error(t.productDetail.addToCartFailed);
      trackEvent('add_to_cart_failed', { product_id: effProduct?.id, error: error instanceof Error ? error.message : 'unknown_error' });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading state: render skeleton when opening ─
  if (loading && !effProduct) {
    return (
      <BottomSheet open={open} onClose={onClose} size="md" showHandle showClose closeLabel={t.productDetail.close}>
        <div className="space-y-4">
          <div className="h-56 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="h-6 w-2/3 rounded bg-white/[0.04] animate-pulse" />
          <div className="h-4 w-full rounded bg-white/[0.04] animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-white/[0.04] animate-pulse" />
          <div className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      </BottomSheet>
    );
  }

  // ── Empty state: no product ─────────────────────
  if (!effProduct) {
    return (
      <BottomSheet open={open} onClose={onClose} size="md" showHandle showClose closeLabel={t.productDetail.close}>
        <div className="text-center py-10 space-y-3">
          <AlertCircle className="h-12 w-12 text-text-muted mx-auto" />
          <h2 className="text-lg font-bold text-text-primary">{t.productDetail.notFound}</h2>
          <p className="text-sm text-text-muted">{t.productDetail.notFoundHint}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 px-5 h-11 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold"
          >
            {t.productDetail.close}
          </button>
        </div>
      </BottomSheet>
    );
  }

  const imageUrls = effProduct.image_urls || [];
  const currentImage = imageUrls[imageIdx];

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={effProduct.name} size="lg" showHandle showClose closeLabel={t.productDetail.close}>
        <div className="space-y-5">
          {/* ── IMAGE GALLERY ─────────────────────── */}
          <div
            ref={imageGalleryRef}
            className="relative -mx-1 -mt-1 h-56 sm:h-64 rounded-2xl overflow-hidden bg-bg-elevated touch-pan-y"
            role={imageUrls.length > 1 ? 'region' : undefined}
            aria-label={t.productDetail.imageGallery}
          >
            {currentImage && !imageBroken ? (
              <Image
                src={currentImage}
                alt={effProduct.name}
                fill
                sizes="(max-width: 768px) 100vw, 600px"
                className="object-cover"
                priority
                onError={() => setImageBroken(true)}
              />
            ) : (
              <CatalogImage src={null} alt={effProduct.name} name={effProduct.name} kind="product" sizes="(max-width: 768px) 100vw, 600px" />
            )}

            {/* Discount badge */}
            {hasDiscount && effProduct.discount_price != null && (
              <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-red-500 text-white text-sm font-bold shadow-lg">
                -{Math.round(((effProduct.price - effProduct.discount_price) / effProduct.price) * 100)}%
              </div>
            )}

            {/* Out-of-stock overlay */}
            {productBlocked && (
              <div className="absolute inset-0 bg-black/60 grid place-items-center">
                <span className="px-4 py-2 rounded-full bg-red-500 text-white font-bold text-sm">
                  {t.productDetail.outOfStock}
                </span>
              </div>
            )}

            {/* Image gallery controls (chevrons) */}
            {imageUrls.length > 1 && !productBlocked && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  aria-label={t.productDetail.previousImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur text-white grid place-items-center"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  aria-label={t.productDetail.nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur text-white grid place-items-center"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                {/* Dots indicator */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5" aria-hidden="true">
                  {imageUrls.map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        i === imageIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/40',
                      )}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Zoom button (desktop) */}
            {currentImage && !imageBroken && !reduceMotion && (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                aria-label={t.productDetail.zoomImage}
                className="absolute top-3 left-3 h-11 w-11 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur text-white grid place-items-center"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* ── BADGES ───────────────────────────── */}
          {BADGE_META.some((b) => effProduct[b.key]) && (
            <div className="flex flex-wrap gap-1.5">
              {BADGE_META.filter((b) => effProduct[b.key]).map((b) => {
                const Icon = b.icon;
                return (
                  <span
                    key={b.key}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                      b.tone === 'success' && 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
                      b.tone === 'brand' && 'bg-red-500/15 text-red-200 border-red-400/30',
                      b.tone === 'amber' && 'bg-amber-500/15 text-amber-200 border-amber-400/30',
                      b.tone === 'red' && 'bg-red-500/15 text-red-200 border-red-400/30',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {lookupTr(t, b.i18n)}
                  </span>
                );
              })}
            </div>
          )}

          {/* ── TITLE + DESCRIPTION ──────────────── */}
          <div>
            <h2 className="text-xl font-bold text-text-primary">{effProduct.name}</h2>
            <p className="text-sm text-text-muted mt-1 leading-relaxed">{effProduct.description}</p>
          </div>

          {/* ── META ROW ─────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
            {effProduct.prep_time_min != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {preparationLabel}
              </span>
            )}
            {effProduct.calories != null && (
              <span className="inline-flex items-center gap-1">
                <Flame className="h-3.5 w-3.5" />
                {effProduct.calories} {t.productDetail.caloriesUnit}
              </span>
            )}
            {effProduct.sold_count != null && effProduct.sold_count > 0 && (
              <span>{t.productDetail.soldCount.replace(/\{(?:count|عدد)\}/g, String(effProduct.sold_count))}</span>
            )}
            {effProduct.rating != null && effProduct.rating > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-amber-400" />
                {effProduct.rating.toFixed(1)}
              </span>
            )}
          </div>

          {/* ── INGREDIENTS ──────────────────────── */}
          {effProduct.ingredients && effProduct.ingredients.length > 0 && (
            <div className="text-xs text-text-muted">
              <span className="font-medium text-text-secondary">{t.productDetail.ingredients}: </span>
              {effProduct.ingredients.join(', ')}
            </div>
          )}

          {/* ── ALLERGENS ────────────────────────── */}
          {effProduct.allergens && effProduct.allergens.length > 0 && (
            <div className="text-xs text-text-muted">
              <span className="font-medium text-text-secondary">{t.productDetail.allergens}: </span>
              {effProduct.allergens.join(', ')}
            </div>
          )}

          {(effProduct.legal_name || effProduct.net_quantity || effProduct.ingredients_text || effProduct.producer_name || effProduct.alcohol_percentage) && (
            <section data-testid="customer-product-legal-information" className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-text-muted">
              <h3 className="font-bold text-text-primary">{locale === 'ar' ? 'معلومات المنتج' : locale === 'en' ? 'Product information' : 'Produktinformationen'}</h3>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {effProduct.legal_name && <div><dt className="font-semibold text-text-secondary">{locale === 'ar' ? 'الاسم القانوني' : locale === 'en' ? 'Legal name' : 'Rechtliche Bezeichnung'}</dt><dd>{effProduct.legal_name}</dd></div>}
                {effProduct.net_quantity != null && effProduct.net_quantity_unit && <div><dt className="font-semibold text-text-secondary">{locale === 'ar' ? 'الكمية الصافية' : locale === 'en' ? 'Net quantity' : 'Nettofüllmenge'}</dt><dd>{effProduct.net_quantity} {effProduct.net_quantity_unit}</dd></div>}
                {effProduct.base_price != null && effProduct.base_price_unit && <div><dt className="font-semibold text-text-secondary">{locale === 'ar' ? 'سعر الوحدة' : locale === 'en' ? 'Unit price' : 'Grundpreis'}</dt><dd>{formatEUR(effProduct.base_price)} / {effProduct.base_price_unit}</dd></div>}
                {effProduct.alcohol_percentage != null && <div><dt className="font-semibold text-text-secondary">{locale === 'ar' ? 'الكحول' : locale === 'en' ? 'Alcohol' : 'Alkohol'}</dt><dd>{effProduct.alcohol_percentage}% vol. · {effProduct.minimum_age}+</dd></div>}
                {effProduct.country_of_origin && <div><dt className="font-semibold text-text-secondary">{locale === 'ar' ? 'المنشأ' : locale === 'en' ? 'Origin' : 'Herkunft'}</dt><dd>{effProduct.country_of_origin}</dd></div>}
                {effProduct.producer_name && <div><dt className="font-semibold text-text-secondary">{locale === 'ar' ? 'المنتج' : locale === 'en' ? 'Producer' : 'Hersteller'}</dt><dd>{effProduct.producer_name}{effProduct.producer_address ? `, ${effProduct.producer_address}` : ''}</dd></div>}
              </dl>
              {effProduct.ingredients_text && <p className="mt-2"><strong className="text-text-secondary">{locale === 'ar' ? 'المكونات' : locale === 'en' ? 'Ingredients' : 'Zutaten'}:</strong> {effProduct.ingredients_text}</p>}
              {effProduct.additives && effProduct.additives.length > 0 && <p className="mt-2"><strong className="text-text-secondary">{locale === 'ar' ? 'المضافات' : locale === 'en' ? 'Additives' : 'Zusatzstoffe'}:</strong> {effProduct.additives.join(', ')}</p>}
              {effProduct.nutrition && Object.keys(effProduct.nutrition).length > 0 && <p className="mt-2"><strong className="text-text-secondary">{locale === 'ar' ? 'القيم الغذائية لكل 100 غ/مل' : locale === 'en' ? 'Nutrition per 100 g/ml' : 'Nährwerte je 100 g/ml'}:</strong> {Object.entries(effProduct.nutrition).map(([key, value]) => `${key.replace(/_/g, ' ')} ${value}`).join(' · ')}</p>}
              {effProduct.storage_instructions && <p className="mt-2"><strong className="text-text-secondary">{locale === 'ar' ? 'التخزين' : locale === 'en' ? 'Storage' : 'Lagerung'}:</strong> {effProduct.storage_instructions}</p>}
            </section>
          )}

          {/* ── PRICE ────────────────────────────── */}
          <div className="flex items-baseline gap-2">
            {hasDiscount && effProduct.discount_price != null ? (
              <>
                <span className="text-2xl font-bold text-text-primary">{formatEUR(effProduct.discount_price)}</span>
                <span className="text-sm text-text-muted line-through">{formatEUR(effProduct.price)}</span>
              </>
            ) : (
              <span className="text-2xl font-bold text-text-primary">{formatEUR(effProduct.price)}</span>
            )}
          </div>

          {/* ── PRICE-CHANGE WARNING ─────────────── */}
          {priceChanged && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20" role="alert">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200 flex-1">
                {t.productDetail.priceChanged}
              </div>
              <button
                type="button"
                onClick={() => setPriceChanged(null)}
                aria-label={t.productDetail.dismissPriceWarning}
                className="text-amber-200/70 hover:text-amber-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ── MODIFIERS ────────────────────────── */}
          {(effProduct.modifiers || []).length > 0 && (
            <div className="space-y-4 border-t border-white/[0.06] pt-4">
              {effProduct.modifiers!.map((m) => {
                const isInvalid = showValidationHint && (selected[m.id] || []).length < m.min_select;
                return (
                  <fieldset
                    key={m.id}
                    ref={(el) => {
                      modifierRefs.current[m.id] = el;
                    }}
                    className={cn(
                      'space-y-2 rounded-xl transition-all',
                      isInvalid ? 'ring-2 ring-red-500/50 p-2 -m-2' : '',
                    )}
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? `err-${m.id}` : undefined}
                  >
                    <legend className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                      {m.name}
                      {m.required && (
                        <span className="text-[10px] uppercase tracking-wider text-red-400 font-bold">
                          {t.productDetail.required}
                        </span>
                      )}
                      {m.type === 'checkbox' && m.max_select > 1 && (
                        <span className="text-[10px] text-text-muted font-normal">
                          {t.productDetail.selectUpTo.replace(/\{(?:max|حد)\}/g, String(m.max_select))}
                        </span>
                      )}
                    </legend>
                    <div className="space-y-1.5">
                      {m.options.map((opt) => {
                        const checked = (selected[m.id] || []).includes(opt.id);
                        const qty = modifierQuantities[`${m.id}:${opt.id}`] || 0;
                        return (
                          <label
                            key={opt.id}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all',
                              'hover:bg-white/[0.04] min-h-[44px]',
                              checked
                                ? 'bg-white/[0.08] border-red-400/50'
                                : 'bg-white/[0.02] border-white/[0.06]',
                            )}
                          >
                            <span
                              className={cn(
                                'h-5 w-5 grid place-items-center border-2 flex-shrink-0 transition-colors',
                                m.type === 'radio' ? 'rounded-full' : 'rounded-md',
                                checked
                                  ? 'border-red-500 bg-red-500'
                                  : 'border-white/20 bg-transparent',
                              )}
                              aria-hidden="true"
                            >
                              {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </span>
                            <input
                              type={m.type === 'radio' ? 'radio' : 'checkbox'}
                              name={`modifier-${m.id}`}
                              value={opt.id}
                              checked={checked}
                              onChange={() => toggleOption(m.id, opt.id, m.type)}
                              className="sr-only"
                              aria-label={`${m.name}: ${opt.name}`}
                            />
                            <span className="flex-1 text-sm text-text-primary">{opt.name}</span>
                            {opt.price_delta !== 0 && (
                              <span className="text-sm text-text-muted">
                                {opt.price_delta > 0 ? '+' : ''}{formatEUR(opt.price_delta)}
                              </span>
                            )}
                            {/* Quantity stepper for selected checkbox options */}
                            {m.type === 'checkbox' && checked && (
                              <div className="flex items-center gap-1 ml-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    decrementOptionQty(m.id, opt.id);
                                  }}
                                  aria-label={t.productDetail.decreaseOptionQty}
                                  className="h-8 w-8 grid place-items-center rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    incrementOptionQty(m.id, opt.id);
                                  }}
                                  aria-label={t.productDetail.increaseOptionQty}
                                  className="h-8 w-8 grid place-items-center rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    {isInvalid && (
                      <p id={`err-${m.id}`} className="text-xs text-red-300 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t.productDetail.pleaseSelectOption}
                      </p>
                    )}
                  </fieldset>
                );
              })}
            </div>
          )}

          {/* ── NOTES ────────────────────────────── */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-sm font-semibold text-text-primary" htmlFor="product-notes">
                {t.productDetail.specialInstructions}
              </label>
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  notes.length > MAX_NOTES_LEN * 0.9 ? 'text-amber-400' : 'text-text-muted',
                )}
                aria-live="polite"
              >
                {notes.length}/{MAX_NOTES_LEN}
              </span>
            </div>
            <textarea
              id="product-notes"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder={t.productDetail.specialInstructionsPlaceholder}
              maxLength={MAX_NOTES_LEN}
              rows={2}
              aria-describedby="product-notes-hint"
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
            />
            <p id="product-notes-hint" className="text-[10px] text-text-muted mt-1">
              {notesHint}
            </p>
          </div>

          {/* ── VALIDATION ISSUES ─────────────────── */}
          {showValidationHint && validationIssues.length > 0 && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200 flex-1">
                {validationIssues.map((i) => i.message).join(' · ')}
              </div>
            </div>
          )}

          {/* ── FOOTER / ADD TO CART ─────────────── */}
          <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-bg-base border-t border-white/[0.06] flex items-center gap-3">
            {/* Quantity stepper */}
            <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-full h-12">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(MIN_QUANTITY, q - 1))}
                disabled={quantity <= MIN_QUANTITY}
                className="h-12 w-12 grid place-items-center text-text-primary disabled:opacity-30"
                aria-label={t.productDetail.decrease}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                className="w-8 text-center font-semibold text-text-primary tabular-nums"
                aria-live="polite"
              >
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                className="h-12 w-12 grid place-items-center text-text-primary"
                aria-label={t.productDetail.increase}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add button */}
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canSubmit}
              aria-label={t.productDetail.addFor.replace(/\{(?:price|سعر)\}/g, formatEUR(total))}
              className={cn(
                'flex-1 h-12 px-5 rounded-full font-semibold text-white transition-all',
                'bg-red-500 hover:bg-red-600 active:scale-95',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'shadow-glow inline-flex items-center justify-center gap-2',
              )}
            >
              {submitting ? (
                <>
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  {t.productDetail.adding}
                </>
              ) : productBlocked ? (
                t.productDetail.outOfStock
              ) : restaurantBlocked ? (
                merchantUnavailable
              ) : total > 0 ? (
                t.productDetail.addFor.replace(/\{(?:price|سعر)\}/g, formatEUR(total))
              ) : (
                t.productDetail.addFree
              )}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── ZOOMED IMAGE LIGHTBOX ──────────────── */}
      <AnimatePresence>
        {zoomed && currentImage && !imageBroken && (
          <motion.div
            className="fixed inset-0 z-modal-overlay bg-black/90 grid place-items-center p-4 cursor-zoom-out"
            onClick={() => setZoomed(false)}
            role="dialog"
            aria-modal="true"
            aria-label={effProduct.name}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              onClick={() => setZoomed(false)}
              aria-label={t.productDetail.closeZoom}
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative w-full max-w-3xl aspect-square">
              <Image
                src={currentImage}
                alt={effProduct.name}
                fill
                sizes="(max-width: 1024px) 100vw, 800px"
                className="object-contain"
                priority
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Helpers ──────────────────────────────────────

/**
 * Build a short, human-readable summary of a product configuration
 * (e.g. "Large, Extra cheese, No onions"). Used by the cart UI to
 * display line customizations. Stable order, no duplicate fragments.
 */
function buildConfigSummary(
  product: ProductDetailData,
  config: CartLineConfiguration,
  locale: 'ar' | 'de' | 'en',
): string {
  const parts: string[] = [];

  if (config.selected_modifiers) {
    const productModifierOrder = (product.modifiers || []).map((m) => m.id);
    const idOrder = Array.from(
      new Set([...productModifierOrder, ...Object.keys(config.selected_modifiers)]),
    );
    for (const modId of idOrder) {
      const optionIds = config.selected_modifiers[modId];
      if (!optionIds || optionIds.length === 0) continue;
      const mod = (product.modifiers || []).find((m) => m.id === modId);
      const optionNames = optionIds
        .map((oid) => {
          const name = mod?.options.find((o) => o.id === oid)?.name ?? oid;
          if (locale === 'ar') return name.replace(/pieces?/gi, 'قطع').replace(/piece/gi, 'قطعة');
          if (locale === 'de') return name.replace(/pieces?/gi, 'Stück');
          return name;
        })
        .filter(Boolean);
      if (optionNames.length) parts.push(optionNames.join(', '));
    }
  }

  if (config.cooking_preference) parts.push(config.cooking_preference);
  if (config.spice_level) parts.push(config.spice_level);
  if (config.notes) parts.push(config.notes);
  if (config.special_instructions && config.special_instructions !== config.notes) {
    parts.push(config.special_instructions);
  }

  return parts.join(' · ');
}

/**
 * Privacy-friendly analytics: no PII, no fingerprint, just event counts.
 * Wrapped in try/catch — analytics must never block the customer journey.
 */
function trackEvent(event: string, data?: Record<string, unknown>) {
  try {
    if (typeof window === 'undefined') return;
    if (!hasAnalyticsConsent()) return;
    // Only fire if the navigator is online
    if (!navigator.onLine) return;
    // Use sendBeacon to avoid blocking, with proper error handling
    const payload = JSON.stringify({ event, data: data || {}, ts: Date.now() });
    if (navigator.sendBeacon) {
      // Currently a no-op endpoint; will be wired up if/when an analytics
      // endpoint is added. We don't want to fail if the endpoint is missing.
      try {
        navigator.sendBeacon('/api/analytics/product', payload);
      } catch {
        // Silent
      }
    }
  } catch {
    // Analytics must never break the product page
  }
}

/**
 * Walk a dotted path on the translations object.
 * Returns the value at the path, or the path itself if not found.
 */
function lookupTr(t: unknown, path: string): string {
  if (!t || typeof path !== 'string') return path;
  const parts = path.split('.');
  let cur: unknown = t;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return path;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : path;
}
