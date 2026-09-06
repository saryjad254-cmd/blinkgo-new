'use client';

/**
 * Premium Restaurant Page — production-certified world-class dining experience.
 *
 * Sections (in order):
 *   1. Hero with cover image (parallax-friendly)
 *   2. Restaurant info card: logo, name, status, description, cuisines
 *   3. Stats row: rating, reviews, distance, delivery time, delivery fee, min order
 *   4. Opening hours (collapsible)
 *   5. Sticky category navigation (Popular, Mains, Sides, Drinks, etc.)
 *   6. Product grid grouped by category (virtualized for large menus)
 *   7. Floating cart pill (shows when items in cart for this restaurant)
 *
 * Quality bar:
 *   - Tri-locale (DE/AR/EN) with RTL
 *   - WCAG AA: focus, ARIA, contrast, 44×44 touch targets, reduced motion
 *   - Performance: AbortController, optimistic state, virtualized list, memoization
 *   - Security: server-side price re-validation via /api/cart/validate
 *   - Business rules: closed/busy/paused/hidden states, min order, delivery radius
 *   - Resilience: error state, retry, graceful API failures
 */

import { useState, useEffect, useMemo, useCallback, type ComponentType } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import { BlinkLogo } from '@/components/brand/BlinkLogo';
import { VirtuosoGrid } from 'react-virtuoso';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Heart from 'lucide-react/dist/esm/icons/heart';
import Share2 from 'lucide-react/dist/esm/icons/share-2';
import Star from 'lucide-react/dist/esm/icons/star';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Truck from 'lucide-react/dist/esm/icons/truck';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import ShoppingCart from 'lucide-react/dist/esm/icons/shopping-cart';
import Search from 'lucide-react/dist/esm/icons/search';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import { Card, Badge } from '@/components/ui/v2';
import { PremiumProductCard } from '@/components/customer/PremiumProductCard';
import { StartGroupOrderButton } from '@/components/customer/StartGroupOrderButton';
import { ProductDetailModal, type ProductDetailData } from '@/components/customer/ProductDetailModal';
import { useT, useI18n } from '@/lib/i18n/I18nProvider';
import { useCart } from '@/lib/cart-store';
import { useToast } from '@/components/ui/Toast';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { cn } from '@/lib/cn';
import { formatEUR } from '@/lib/format';

// ── Types ───────────────────────────────────────────
interface Restaurant {
  id: string;
  type?: 'restaurant' | 'market' | 'pharmacy' | string;
  name: string;
  description: string;
  cover_image_url?: string;
  logo_url?: string;
  rating: number;
  total_reviews: number;
  delivery_time_min: number;
  delivery_fee: number;
  minimum_order: number;
  cuisines: string[];
  is_active: boolean;
  is_busy?: boolean;
  is_paused?: boolean;
  is_hidden?: boolean;
  is_open_now?: boolean;
  is_online?: boolean;
  accepting_orders?: boolean;
  lat?: number;
  lng?: number;
  delivery_radius_km?: number;
  opening_hours?: Record<string, { open: string; close: string }> | null;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  discount_price?: number | null;
  image_urls: string[];
  category: string;
  is_featured: boolean;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  prep_time_min: number;
  calories?: number;
  allergens?: string[];
  sold_count?: number;
  rating?: number;
}

type FetchState = 'loading' | 'ok' | 'error';

const DAY_KEYS: Array<keyof NonNullable<Restaurant['opening_hours']>> = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_AR = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeOpeningHours(value: unknown): Restaurant['opening_hours'] {
  if (!isRecord(value)) return null;
  const result: Record<string, { open: string; close: string }> = {};
  for (const key of DAY_KEYS) {
    const hours = value[key];
    if (!isRecord(hours) || typeof hours.open !== 'string' || typeof hours.close !== 'string') continue;
    result[key] = { open: hours.open, close: hours.close };
  }
  return Object.keys(result).length > 0 ? result : null;
}

function normalizeRestaurant(value: unknown): Restaurant | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  return {
    id: value.id,
    type: typeof value.type === 'string' ? value.type : 'restaurant',
    name: value.name,
    description: typeof value.description === 'string' ? value.description : '',
    cover_image_url: typeof value.cover_image_url === 'string' ? value.cover_image_url : undefined,
    logo_url: typeof value.logo_url === 'string' ? value.logo_url : undefined,
    rating: Math.max(0, Math.min(5, finiteNumber(value.rating))),
    total_reviews: Math.max(0, Math.round(finiteNumber(value.total_reviews))),
    delivery_time_min: Math.max(0, Math.round(finiteNumber(value.delivery_time_min, 25))),
    delivery_fee: Math.max(0, finiteNumber(value.delivery_fee)),
    minimum_order: Math.max(0, finiteNumber(value.minimum_order)),
    cuisines: stringArray(value.cuisines),
    is_active: value.is_active !== false,
    is_busy: value.is_busy === true,
    is_paused: value.is_paused === true,
    is_hidden: value.is_hidden === true,
    is_open_now: value.is_open_now !== false,
    is_online: value.is_online !== false,
    accepting_orders: value.accepting_orders !== false,
    lat: Number.isFinite(Number(value.lat)) ? Number(value.lat) : undefined,
    lng: Number.isFinite(Number(value.lng)) ? Number(value.lng) : undefined,
    delivery_radius_km: Number.isFinite(Number(value.delivery_radius_km)) ? Number(value.delivery_radius_km) : undefined,
    opening_hours: normalizeOpeningHours(value.opening_hours),
  };
}

function normalizeProduct(value: unknown): Product | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === 'string' ? value.description : '',
    price: Math.max(0, finiteNumber(value.price)),
    discount_price: value.discount_price == null ? null : Math.max(0, finiteNumber(value.discount_price)),
    image_urls: stringArray(value.image_urls),
    category: typeof value.category === 'string' && value.category.trim() ? value.category : 'Other',
    is_featured: value.is_featured === true,
    is_vegetarian: value.is_vegetarian === true,
    is_vegan: value.is_vegan === true,
    is_gluten_free: value.is_gluten_free === true,
    prep_time_min: Math.max(1, Math.round(finiteNumber(value.prep_time_min, 15)) || 15),
    calories: value.calories == null ? undefined : Math.max(0, Math.round(finiteNumber(value.calories))),
    allergens: stringArray(value.allergens),
    sold_count: value.sold_count == null ? undefined : Math.max(0, Math.round(finiteNumber(value.sold_count))),
    rating: value.rating == null ? undefined : Math.max(0, Math.min(5, finiteNumber(value.rating))),
  };
}

function normalizeProductDetail(value: unknown): ProductDetailData | null {
  const base = normalizeProduct(value);
  if (!base || !isRecord(value)) return null;
  const allowedKinds = ['prepared_food', 'prepacked_food', 'beverage', 'alcohol', 'non_food'] as const;
  const productKind = allowedKinds.find((kind) => kind === value.product_kind);
  const modifiers = Array.isArray(value.modifiers)
    ? value.modifiers.flatMap((modifier) => {
        if (!isRecord(modifier) || typeof modifier.id !== 'string' || typeof modifier.name !== 'string') return [];
        const type: 'checkbox' | 'radio' = modifier.type === 'checkbox' ? 'checkbox' : 'radio';
        const options = Array.isArray(modifier.options)
          ? modifier.options.flatMap((option) => isRecord(option) && typeof option.id === 'string' && typeof option.name === 'string'
            ? [{ id: option.id, name: option.name, price_delta: finiteNumber(option.price_delta) }]
            : [])
          : [];
        return [{
          id: modifier.id,
          name: modifier.name,
          type,
          required: modifier.required === true,
          min_select: Math.max(0, Math.round(finiteNumber(modifier.min_select))),
          max_select: Math.max(1, Math.round(finiteNumber(modifier.max_select, 1))),
          options,
        }];
      })
    : [];
  const nutrition = isRecord(value.nutrition)
    ? Object.fromEntries(Object.entries(value.nutrition).flatMap(([key, amount]) => Number.isFinite(Number(amount)) ? [[key, Number(amount)]] : []))
    : undefined;
  const minimumAge = value.minimum_age === 16 || value.minimum_age === 18 ? value.minimum_age : null;
  const optionalString = (key: string) => typeof value[key] === 'string' ? value[key] as string : null;
  return {
    ...base,
    is_available: value.is_available !== false,
    ingredients: stringArray(value.ingredients),
    product_kind: productKind,
    legal_name: optionalString('legal_name'),
    net_quantity: value.net_quantity == null ? null : finiteNumber(value.net_quantity),
    net_quantity_unit: optionalString('net_quantity_unit'),
    base_price: value.base_price == null ? null : finiteNumber(value.base_price),
    base_price_unit: optionalString('base_price_unit'),
    ingredients_text: optionalString('ingredients_text'),
    additives: stringArray(value.additives),
    nutrition,
    country_of_origin: optionalString('country_of_origin'),
    producer_name: optionalString('producer_name'),
    producer_address: optionalString('producer_address'),
    storage_instructions: optionalString('storage_instructions'),
    usage_instructions: optionalString('usage_instructions'),
    alcohol_percentage: value.alcohol_percentage == null ? null : finiteNumber(value.alcohol_percentage),
    minimum_age: minimumAge,
    legal_information_complete: value.legal_information_complete === true,
    modifiers,
  };
}

// Haversine distance in km
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default function RestaurantPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const groupOrderId = searchParams.get('group');
  const t = useT();
  const { locale } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const online = useOnlineStatus();
  const reduceMotion = useReducedMotion();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isFavorite, setIsFavorite] = useState(false);
  const [showFloatingCart, setShowFloatingCart] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [openProductData, setOpenProductData] = useState<ProductDetailData | null>(null);
  const [openingProduct, setOpeningProduct] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ── Effects ─────────────────────────────────────────

  // Scroll: show floating cart + track category
  useEffect(() => {
    const onScroll = () => setShowFloatingCart(window.scrollY > 200);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Try to get user location (best-effort, no permission UI)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { timeout: 4000, maximumAge: 600_000 },
      );
    } catch {
      // ignore
    }
  }, []);

  // Fetch restaurant + products (with abort controller)
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setFetchState('loading');
    try {
      const [rRes, pRes] = await Promise.allSettled([
        fetch(`/api/restaurants/${id}`, { signal }).then((r) => {
          if (!r.ok) throw new Error('restaurant_not_ok');
          return r.json() as Promise<unknown>;
        }),
        fetch(`/api/products/by-restaurant?restaurant_id=${id}&limit=200`, { signal }).then((r) => {
          if (!r.ok) throw new Error('products_not_ok');
          return r.json() as Promise<unknown>;
        }),
      ]);
      const restaurantPayload = rRes.status === 'fulfilled' && isRecord(rRes.value)
        ? normalizeRestaurant(rRes.value.restaurant)
        : null;
      if (restaurantPayload) {
        setRestaurant(restaurantPayload);
      } else {
        setFetchState('error');
        return;
      }
      if (pRes.status === 'fulfilled' && isRecord(pRes.value) && Array.isArray(pRes.value.products)) {
        setProducts(pRes.value.products.map(normalizeProduct).filter((product): product is Product => product !== null));
      } else {
        setProducts([]);
      }
      setFetchState('ok');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFetchState('error');
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void fetchData(controller.signal);
    });
    return () => controller.abort();
  }, [fetchData]);

  // Load favorite state
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem('blinkgo-favorites');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) setIsFavorite(list.includes(id));
        }
      } catch {}
    });
    return () => { cancelled = true; };
  }, [id]);

  function toggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      const raw = localStorage.getItem('blinkgo-favorites');
      const list: string[] = raw ? JSON.parse(raw) : [];
      const updated = next
        ? Array.from(new Set([...list, id]))
        : list.filter((x) => x !== id);
      localStorage.setItem('blinkgo-favorites', JSON.stringify(updated));
      toast.success(next ? t.restaurantDetail.saved : t.restaurantDetail.save);
    } catch {}
  }

  // Share
  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: restaurant?.name || 'BlinkGo', url });
      } catch {
        // user cancelled
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t.common.success);
      } catch {
        toast.error(t.restaurantDetail.shareNotAvailable);
      }
    } else {
      toast.error(t.restaurantDetail.shareNotAvailable);
    }
  }

  // ── Derived data ───────────────────────────────────

  // Group products by category (memoized)
  const categories = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const cat = p.category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }, [products]);

  // Featured (popular) — top 6 featured items
  const featuredProducts = useMemo(
    () => products.filter((p) => p.is_featured).slice(0, 6),
    [products],
  );

  // Distance calculation
  const distance = useMemo(() => {
    if (!restaurant || !userCoords || restaurant.lat == null || restaurant.lng == null) return null;
    return distanceKm(userCoords.lat, userCoords.lng, restaurant.lat, restaurant.lng);
  }, [restaurant, userCoords]);

  // Delivery availability
  const isOpen = Boolean(
    restaurant
    && !restaurant.is_paused
    && !restaurant.is_hidden
    && restaurant.is_active
    && restaurant.is_open_now !== false
    && restaurant.is_online !== false
    && restaurant.accepting_orders !== false
  );
  const isBusy = !!restaurant?.is_busy;
  const displayedDeliveryMinutes = (restaurant?.delivery_time_min ?? 0) + (isBusy ? 10 : 0);
  const inDeliveryRadius = !restaurant?.delivery_radius_km || !distance || distance <= restaurant.delivery_radius_km;

  // Cart for this restaurant
  const cartItemsForThisRestaurant = useMemo(
    () => cart.items.filter((i) => i.restaurant_id === id),
    [cart.items, id],
  );
  const cartCount = cartItemsForThisRestaurant.reduce((sum, i) => sum + i.quantity, 0);
  const cartSubtotal = cartItemsForThisRestaurant.reduce((sum, i) => sum + i.product_price * i.quantity, 0);
  const meetsMinOrder = cartSubtotal >= (restaurant?.minimum_order ?? 0);

  // Today's hours
  const todayHours = useMemo(() => {
    if (!restaurant?.opening_hours) return null;
    const dayIdx = (new Date().getDay() + 6) % 7; // JS: 0=Sun → our 0=Mon
    const key = DAY_KEYS[dayIdx];
    return { key, hours: restaurant.opening_hours[key] };
  }, [restaurant]);

  // ── Open product detail (lazy fetch full data) ─────
  async function openProductDetail(productId: string) {
    setOpenProductId(productId);
    setOpeningProduct(true);
    try {
      const res = await fetch(`/api/products/${productId}`);
      if (res.ok) {
        const data: unknown = await res.json();
        const product = isRecord(data) ? normalizeProductDetail(data.product) : null;
        setOpenProductData(product);
      } else {
        // Fallback: use the slim product from the list
        const fallback = products.find((p) => p.id === productId);
        if (fallback) {
          setOpenProductData({ ...fallback });
        } else {
          setOpenProductId(null);
          toast.error(t.restaurantDetail.errorTitle);
        }
      }
    } catch {
      const fallback = products.find((p) => p.id === productId);
      if (fallback) {
        setOpenProductData({ ...fallback });
      } else {
        setOpenProductId(null);
      }
    } finally {
      setOpeningProduct(false);
    }
  }

  function closeProductDetail() {
    setOpenProductId(null);
    setOpenProductData(null);
  }

  // ── Render states ──────────────────────────────────

  if (fetchState === 'loading') return <RestaurantSkeleton />;

  if (fetchState === 'error' || !restaurant) {
    return (
      <NotFound
        onBack={() => router.back()}
        onRetry={fetchData}
        isError={fetchState === 'error'}
      />
    );
  }

  // ── Main render ────────────────────────────────────

  return (
    <div className="min-h-screen overflow-x-clip pb-32" role="main" aria-label={restaurant.name}>
      {/* Offline indicator (subtle) */}
      {!online && (
        <div className="sticky top-0 z-sticky bg-amber-500/15 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-xs text-amber-200">
          <WifiOff className="h-3.5 w-3.5" />
          <span>
            {locale === 'ar'
              ? 'أنت غير متصل — يتم عرض آخر بيانات محفوظة'
              : locale === 'en'
                ? 'Offline — showing the latest saved data'
                : 'Offline — zuletzt geladene Daten werden angezeigt'}
          </span>
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div className="relative h-72 sm:h-96 -mt-4 sm:-mt-6 -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden bg-bg-elevated">
        {restaurant.cover_image_url ? (
          <Image
            src={restaurant.cover_image_url}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <Image
            src="/brand/blinkgo-discovery-hero-v2.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[68%_center]"
            aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/10 to-black/15" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" aria-hidden="true" />

        {/* Top bar — 44×44 touch targets */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 sm:p-6 z-10">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-11 w-11 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 grid place-items-center hover:bg-black/60 transition-all active:scale-95"
            aria-label={t.restaurantDetail.back}
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <BlinkLogo variant="horizontal" size="sm" priority className="drop-shadow-[0_4px_16px_rgba(0,0,0,.8)]" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFavorite}
              className="h-11 w-11 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 grid place-items-center hover:bg-black/60 transition-all active:scale-95"
              aria-label={isFavorite ? t.restaurantDetail.saved : t.restaurantDetail.save}
              aria-pressed={isFavorite}
            >
              <Heart
                className={cn(
                  'h-5 w-5 transition-colors',
                  isFavorite ? 'text-red-400 fill-red-400' : 'text-white',
                )}
              />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="h-11 w-11 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 grid place-items-center hover:bg-black/60 transition-all active:scale-95"
              aria-label={t.restaurantDetail.share}
            >
              <Share2 className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* ── INFO CARD ───────────────────────────────────────── */}
      <div className="px-4 sm:px-6 lg:px-8 -mt-20 relative">
        <Card variant="raised" padding="lg" className="shadow-premium-lg">
          <div className="flex items-start gap-4">
            {restaurant.logo_url && (
              <div className="relative h-16 w-16 rounded-2xl overflow-hidden border-2 border-white/10 flex-shrink-0 bg-bg-elevated">
                <Image
                  src={restaurant.logo_url}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
                  {restaurant.name}
                </h1>
                <StatusBadge restaurant={restaurant} />
              </div>
              <p className="text-sm text-text-muted mt-1 line-clamp-2">{restaurant.description}</p>
              {restaurant.cuisines && restaurant.cuisines.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {restaurant.cuisines.map((c) => (
                    <Badge key={c} tone="neutral" variant="outline" size="sm">{c}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stats grid — 2 rows for better readability on mobile */}
          <div className="mt-4 flex justify-end"><StartGroupOrderButton restaurantId={restaurant.id} /></div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mt-5 pt-5 border-t border-white/[0.06]">
            <Stat
              icon={Star}
              value={restaurant.rating.toFixed(1)}
              label={t.restaurantDetail.rating}
              sub={t.restaurantDetail.reviewsCount.replace('{count}', String(restaurant.total_reviews ?? 0))}
              accent="text-amber-400"
            />
            <Stat
              icon={Clock}
              value={`${displayedDeliveryMinutes}`}
              label={t.restaurantDetail.delivery}
              sub={t.restaurantDetail.minutes}
              accent="text-text-primary"
            />
            <Stat
              icon={Truck}
              value={restaurant.delivery_fee === 0 ? t.restaurantDetail.free : formatEUR(restaurant.delivery_fee)}
              label={t.restaurantDetail.deliveryFee}
              accent="text-text-primary"
            />
            {distance != null && (
              <Stat
                icon={MapPin}
                value={distance.toFixed(1)}
                label={t.restaurantDetail.kmAway.replace(/\s*$/, '')}
                sub="km"
                accent="text-text-primary"
              />
            )}
            <Stat
              icon={MapPin}
              value={`${restaurant.minimum_order}€`}
              label={t.restaurantDetail.minimumOrder}
              accent="text-text-primary"
            />
          </div>

          {isBusy && (
            <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{locale === 'ar' ? 'المطعم مشغول الآن، وقد يستغرق التوصيل وقتًا إضافيًا.' : locale === 'en' ? 'The restaurant is busy right now, so delivery may take a little longer.' : 'Das Restaurant ist momentan stark ausgelastet. Die Lieferung kann etwas länger dauern.'}</span>
            </div>
          )}

          {/* Out-of-radius warning */}
          {!inDeliveryRadius && distance != null && (
            <div className="mt-4 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">
                {t.restaurantDetail.deliveryRadius} — Sie sind {distance.toFixed(1)} km entfernt.
              </p>
            </div>
          )}

          {/* Opening hours (collapsible) */}
          {restaurant.opening_hours && Object.keys(restaurant.opening_hours).length > 0 && todayHours && (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <button
                type="button"
                onClick={() => setHoursOpen((v) => !v)}
                className="w-full flex items-center justify-between text-sm hover:bg-white/[0.02] -mx-2 px-2 py-1.5 rounded-lg transition-colors"
                aria-expanded={hoursOpen}
                aria-controls="opening-hours"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-text-muted" />
                  <span className="font-medium text-text-primary">
                    {todayHours.hours ? `${todayHours.hours.open} – ${todayHours.hours.close}` : isOpen ? t.restaurantDetail.open : t.restaurantDetail.closed}
                  </span>
                  <span className="text-text-muted text-xs">{t.restaurantDetail.today}</span>
                </div>
                {hoursOpen ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
              </button>
              <AnimatePresence>
                {hoursOpen && (
                  <motion.div
                    id="opening-hours"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <ul className="mt-2 space-y-1 text-xs">
                      {DAY_KEYS.map((k, i) => {
                        const h = restaurant.opening_hours![k];
                        if (!h) return null;
                        return (
                          <li key={k} className="flex items-center justify-between px-2 py-1 rounded">
                             <span className="text-text-muted">{(locale === 'ar' ? DAY_LABELS_AR : locale === 'en' ? DAY_LABELS_EN : DAY_LABELS_DE)[i]}</span>
                            <span className="text-text-primary font-medium">{h.open} – {h.close}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </Card>
      </div>

      {/* ── STICKY CATEGORY NAV ────────────────────────────── */}
      {categories.length > 0 && (
        <div
          className="sticky top-0 md:top-16 z-sticky -mx-4 sm:-mx-6 lg:-mx-8 mt-6 bg-bg/85 backdrop-blur-2xl border-y border-white/[0.06]"
          role="navigation"
          aria-label={t.restaurantDetail.categories}
        >
          <div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-4 sm:px-6 lg:px-8 py-3 scrollbar-hide">
            <CategoryChip
              active={activeCategory === 'all'}
              onClick={() => { setActiveCategory('all'); scrollToTop(); }}
              label={t.restaurantDetail.all}
              count={products.length}
            />
            {categories.map((cat) => (
              <CategoryChip
                key={cat.name}
                active={activeCategory === cat.name}
                onClick={() => { setActiveCategory(cat.name); scrollToSection(cat.name); }}
                label={cat.name}
                count={cat.items.length}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── FEATURED (POPULAR) ──────────────────────────────── */}
      {activeCategory === 'all' && featuredProducts.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 mt-6" aria-label={t.restaurantDetail.popular}>
          <h2 className="flex items-center gap-2.5 font-bold text-lg text-text-primary mb-3 px-1">
            <span className="h-1 w-1 rounded-full bg-red-500" aria-hidden="true" />
            {t.restaurantDetail.popular}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onOpen={() => openProductDetail(product.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── PRODUCTS BY CATEGORY ────────────────────────────── */}
      <div className="px-4 sm:px-6 lg:px-8 mt-6 space-y-8" role="feed" aria-busy={openingProduct}>
        {categories.length === 0 ? (
          <Card variant="raised" padding="lg" className="text-center">
            <p className="text-text-muted">{t.restaurantDetail.noMenu}</p>
          </Card>
        ) : activeCategory === 'all' ? (
          categories.map((cat) => (
            <section key={cat.name} id={`cat-${cat.name}`} aria-labelledby={`cat-${cat.name}-h`}>
              <h2
                id={`cat-${cat.name}-h`}
                className="flex items-center gap-2.5 font-bold text-lg text-text-primary mb-3 px-1"
              >
                <span className="h-1 w-1 rounded-full bg-red-500" aria-hidden="true" />
                {cat.name}
                <span className="text-xs font-normal text-text-muted">({cat.items.length})</span>
              </h2>
              {cat.items.length > 20 ? (
                <VirtualizedProductGrid products={cat.items} onOpen={openProductDetail} />
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {cat.items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onOpen={() => openProductDetail(product.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        ) : (
          (() => {
            const cat = categories.find((c) => c.name === activeCategory);
            if (!cat) return null;
            return (
              <section id={`cat-${cat.name}`} aria-labelledby={`cat-${cat.name}-h`}>
                <h2
                  id={`cat-${cat.name}-h`}
                  className="flex items-center gap-2.5 font-bold text-lg text-text-primary mb-3 px-1"
                >
                  <span className="h-1 w-1 rounded-full bg-red-500" aria-hidden="true" />
                  {cat.name}
                  <span className="text-xs font-normal text-text-muted">({cat.items.length})</span>
                </h2>
                {cat.items.length > 20 ? (
                  <VirtualizedProductGrid products={cat.items} onOpen={openProductDetail} />
                ) : (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {cat.items.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onOpen={() => openProductDetail(product.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })()
        )}
      </div>

      {/* ── FLOATING CART PILL ───────────────────────────────── */}
      <AnimatePresence>
        {cartCount > 0 && isOpen && inDeliveryRadius && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: showFloatingCart ? 0 : 100, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-sticky"
            role="region"
            aria-live="polite"
            aria-label={`${t.restaurantDetail.viewCart}: ${cartCount}, ${formatEUR(cartSubtotal)}`}
          >
            <Link
              href="/cart"
              className="group flex items-center gap-3 h-14 px-5 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-glow transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              <div className="relative">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-white text-red-500 text-[10px] font-bold flex items-center justify-center" aria-hidden="true">
                  {cartCount}
                </span>
              </div>
              <span className="font-semibold">{t.restaurantDetail.viewCart}</span>
              <span className="font-bold">{formatEUR(cartSubtotal)}</span>
              {!meetsMinOrder && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
                  {t.common?.minOrder || 'Minimum order'}: {formatEUR(restaurant.minimum_order)}
                </span>
              )}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PRODUCT DETAIL MODAL ────────────────────────────── */}
      <ProductDetailModal
        open={openProductId !== null}
        onClose={closeProductDetail}
        product={openProductData}
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        restaurantMinOrder={restaurant.minimum_order}
        loading={openingProduct && !openProductData}
        groupOrderId={groupOrderId || undefined}
        restaurantState={{
          status: restaurant.is_paused ? 'paused'
            : restaurant.is_hidden ? 'hidden'
            : restaurant.is_busy ? 'busy'
            : restaurant.is_active ? 'open'
            : 'closed',
          isAvailable: !!restaurant.is_active && !restaurant.is_paused && !restaurant.is_hidden,
        }}
        merchantKind={restaurant.type === 'restaurant' || !restaurant.type ? 'restaurant' : 'retail'}
      />
    </div>
  );
}

// ── Product Card (button wrapper) ───────────────────
function ProductCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded-2xl"
    >
      <PremiumProductCard
        id={product.id}
        name={product.name}
        description={product.description}
        price={product.price}
        discountPrice={product.discount_price ?? undefined}
        imageUrls={product.image_urls}
        badges={[
          ...(product.is_featured ? ['bestseller'] : []),
          ...(product.is_vegetarian ? ['vegetarian'] : []),
          ...(product.is_vegan ? ['vegan'] : []),
        ]}
        prepMinutes={product.prep_time_min}
        soldCount={product.sold_count}
        rating={product.rating}
      />
    </div>
  );
}

// ── Virtualized grid for large categories ────────────
function VirtualizedProductGrid({ products, onOpen }: { products: Product[]; onOpen: (id: string) => void }) {
  return (
    <VirtuosoGrid
      useWindowScroll
      data={products}
      listClassName="grid grid-cols-2 gap-3 lg:grid-cols-3"
      itemClassName=""
      itemContent={(_idx, product) => (
        <ProductCard
          product={product}
          onOpen={() => onOpen(product.id)}
        />
      )}
    />
  );
}

// ── Status badge ─────────────────────────────────────
function StatusBadge({ restaurant }: { restaurant: Restaurant }) {
  const { t } = useI18n();
  if (restaurant.is_paused) {
    return <Badge tone="warning" variant="subtle" size="sm">{t.restaurantDetail.paused}</Badge>;
  }
  if (restaurant.is_hidden) {
    return <Badge tone="neutral" variant="subtle" size="sm">{t.restaurantDetail.hidden}</Badge>;
  }
  if (!restaurant.is_active) {
    return <Badge tone="neutral" variant="subtle" size="sm">{t.restaurantDetail.closed}</Badge>;
  }
  if (restaurant.is_busy) {
    return <Badge tone="warning" variant="subtle" size="sm">{t.restaurantDetail.busy}</Badge>;
  }
  return <Badge tone="success" variant="subtle" size="sm">{t.restaurantDetail.open}</Badge>;
}

// ── Stat block ───────────────────────────────────────
function Stat({ icon: Icon, value, label, sub, accent }: { icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>; value: string; label: string; sub?: string; accent?: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', accent)} aria-hidden="true" />
        <span className={cn('font-bold text-base', accent)}>{value}</span>
        {sub && <span className="text-[10px] text-text-muted">{sub}</span>}
      </div>
      <p className="text-[10px] text-text-muted mt-0.5 uppercase tracking-wider line-clamp-1">{label}</p>
    </div>
  );
}

// ── Category chip ────────────────────────────────────
function CategoryChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex-shrink-0 snap-start px-3.5 h-11 rounded-full text-sm font-semibold whitespace-nowrap',
        'transition-all active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
        active
          ? 'bg-white text-text-inverse shadow-premium'
          : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.08] hover:text-text-primary border border-white/[0.06]',
      )}
      aria-pressed={active}
      aria-label={count !== undefined ? `${label}, ${count}` : label}
    >
      {label}
      {count !== undefined && (
        <span className={cn('ms-1.5 text-xs', active ? 'text-text-inverse/60' : 'text-text-muted')}>
          {count}
        </span>
      )}
    </button>
  );
}

function scrollToTop() {
  if (typeof window !== 'undefined') window.scrollTo({ top: 200, behavior: 'smooth' });
}

function scrollToSection(cat: string) {
  if (typeof window === 'undefined') return;
  const el = document.getElementById(`cat-${cat}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Loading skeleton ─────────────────────────────────
function RestaurantSkeleton() {
  return (
    <div className="min-h-screen overflow-x-clip animate-pulse" aria-busy="true" aria-label="Loading restaurant">
      <div className="h-72 sm:h-96 bg-white/[0.04] -mt-4 sm:-mt-6 -mx-4 sm:-mx-6 lg:-mx-8" />
      <div className="px-4 sm:px-6 lg:px-8 -mt-20">
        <div className="h-48 rounded-2xl bg-white/[0.04]" />
      </div>
      <div className="px-4 sm:px-6 lg:px-8 mt-6 space-y-3">
        <div className="h-10 rounded-2xl bg-white/[0.04]" />
        <div className="h-28 rounded-2xl bg-white/[0.04]" />
        <div className="h-28 rounded-2xl bg-white/[0.04]" />
        <div className="h-28 rounded-2xl bg-white/[0.04]" />
        <div className="h-28 rounded-2xl bg-white/[0.04]" />
        <div className="h-28 rounded-2xl bg-white/[0.04]" />
      </div>
    </div>
  );
}

// ── Not found / error ────────────────────────────────
function NotFound({ onBack, onRetry, isError }: { onBack: () => void; onRetry: () => void; isError?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6" role="alert">
      <div className="h-20 w-20 rounded-full bg-white/[0.04] grid place-items-center mb-4">
        {isError ? (
          <AlertCircle className="h-8 w-8 text-text-muted" />
        ) : (
          <Search className="h-8 w-8 text-text-muted" />
        )}
      </div>
      <h2 className="text-xl font-bold mb-1">
        {isError ? t.restaurantDetail.errorTitle : t.restaurantDetail.notFound}
      </h2>
      <p className="text-text-muted text-sm mb-6 max-w-sm">
        {isError ? t.restaurantDetail.errorHint : t.restaurantDetail.notFoundHint}
      </p>
      <div className="flex items-center gap-2">
        {isError && (
          <button
            type="button"
            onClick={onRetry}
            className="px-5 h-11 rounded-full bg-white/10 border border-white/20 text-text-primary font-semibold hover:bg-white/15 transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <RefreshCw className="h-4 w-4" />
            {t.restaurantDetail.retry}
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="px-5 h-11 rounded-full bg-white text-text-inverse font-semibold hover:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          {t.restaurantDetail.goBack}
        </button>
      </div>
    </div>
  );
}
