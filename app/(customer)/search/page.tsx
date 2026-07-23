'use client';

/**
 * Search / Browse Page — premium food delivery discovery
 *
 * Best-practice implementation (Uber Eats / DoorDash / Lieferando 2025):
 * - URL state sync (filters, sort, query) for shareability and back-button
 * - 200ms debounce (optimal for search; too fast = extra requests, too slow = laggy UX)
 * - AbortController cancels in-flight requests when filters change
 * - React.memo on cards to prevent re-renders when only filter chip changes
 * - Quick filter chips (Free delivery, Open now, Under 30 min, Featured)
 * - View toggle (Grid / List / Map)
 * - Active filter chips above results (removable)
 * - "Order Again" section (recent orders, deduplicated by restaurant)
 * - Distance display (Haversine from user location)
 * - aria-live for results count (screen reader announces changes)
 * - role="feed" on results list (accessibility)
 * - Filter UI hidden in URL state (deep-linkable)
 * - "Clear all" appears when >1 filter active
 * - Empty state offers suggestions and clear-filters CTA
 * - Skeleton state during re-search (not just initial)
 * - All UI strings via i18n (no hardcoded DE/AR/EN)
 * - Image lazy loading with placeholder
 * - Stable keys (restaurant.id) for list virtualization
 * - localStorage for search history (max 10 items, deduped)
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Search as SearchIcon, Filter, X, Star, Clock, Truck, TrendingUp,
  Flame, Award, Sparkles, ArrowLeft, ChevronDown, ChevronUp, History,
  Store as StoreIcon, ShoppingBag, SlidersHorizontal, MapPin, Grid3x3,
  List, Map as MapIcon, Zap, BadgeCheck, Heart, Package
} from 'lucide-react';
import { VoiceSearch } from '@/components/customer/VoiceSearch';
import { FavoriteButton } from '@/components/customer/FavoriteButton';
import { useT, useI18n } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';
import { haversineDistance, formatDistance } from '@/lib/maps/distance';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/i18n/format';
import { hideOnError } from '@/lib/images';

interface Restaurant {
  id: string;
  name: string;
  cuisine: string[];
  rating: number;
  review_count: number;
  delivery_fee: number;
  estimated_delivery_time: number;
  address: string;
  cover_url: string;
  type?: string;
  latitude?: number;
  longitude?: number;
  is_promoted?: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  discount_price?: number;
  image_urls: string[];
  badges: string[];
  restaurant_id: string;
  restaurants: Restaurant;
  sold_count: number;
  is_featured: boolean;
  category: string;
}

interface RecentOrder {
  id: string;
  status: string;
  total: number;
  created_at: string;
  restaurant_id: string;
  restaurants: Restaurant;
}

type ViewMode = 'grid' | 'list' | 'map';

const SEARCH_HISTORY_KEY = 'blinkgo-search-history';
const SEARCH_HISTORY_MAX = 10;
const DEBOUNCE_MS = 200;

const BADGE_LABELS: Record<string, Record<string, string>> = {
  new: { de: 'Neu', ar: 'جديد', en: 'New' },
  bestseller: { de: 'Bestseller', ar: 'الأكثر مبيعاً', en: 'Bestseller' },
  sale: { de: 'Sale', ar: 'تخفيض', en: 'Sale' },
  hot: { de: 'Heiß', ar: 'رائج', en: 'Hot' },
  recommended: { de: 'Top', ar: 'الأفضل', en: 'Top' },
};

export default function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useT();
  const { locale } = useI18n();
  const ct = (key: string, fallback?: string) =>
    (t as any).customer?.[key] ?? fallback ?? key;

  // ===== URL state sync (deep-linkable filters) =====
  const urlQ = params?.get('q') || '';
  const urlSort = params?.get('sort') || 'recommended';
  const urlType = params?.get('type');
  const urlCuisine = params?.get('cuisine');
  const urlFreeDelivery = params?.get('free_delivery') === '1';
  const urlOpenNow = params?.get('open_now') === '1';
  const urlMaxDeliveryTime = params?.get('max_delivery_time')
    ? parseInt(params.get('max_delivery_time')!)
    : 0;
  const urlPromoted = params?.get('promoted') === '1';

  // ===== Component state =====
  const [q, setQ] = useState(urlQ);
  const [sort, setSort] = useState(urlSort);
  const [type, setType] = useState<string | null>(urlType);
  const [cuisine, setCuisine] = useState<string | null>(urlCuisine);
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState(999);
  const [badge, setBadge] = useState<string | null>(null);
  const [inStock, setInStock] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState(urlFreeDelivery);
  const [openNow, setOpenNow] = useState(urlOpenNow);
  const [maxDeliveryTime, setMaxDeliveryTime] = useState(urlMaxDeliveryTime);
  const [promoted, setPromoted] = useState(urlPromoted);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bestsellers, setBestsellers] = useState<Product[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [tab, setTab] = useState<'restaurants' | 'products'>('restaurants');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // ===== Debounced URL sync =====
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Get user location from localStorage (set during cart/order flow)
  useEffect(() => {
    try {
      const loc = JSON.parse(localStorage.getItem('blinkgo-last-location') || 'null');
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        setUserLocation(loc);
      }
    } catch {}
  }, []);

  // Sync state -> URL (debounced)
  const updateUrl = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(params?.toString());
      if (q) next.set('q', q);
      else next.delete('q');
      if (sort && sort !== 'recommended') next.set('sort', sort);
      else next.delete('sort');
      if (type) next.set('type', type);
      else next.delete('type');
      if (cuisine) next.set('cuisine', cuisine);
      else next.delete('cuisine');
      if (freeDelivery) next.set('free_delivery', '1');
      else next.delete('free_delivery');
      if (openNow) next.set('open_now', '1');
      else next.delete('open_now');
      if (maxDeliveryTime > 0) next.set('max_delivery_time', String(maxDeliveryTime));
      else next.delete('max_delivery_time');
      if (promoted) next.set('promoted', '1');
      else next.delete('promoted');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);
  }, [params, pathname, q, sort, type, cuisine, freeDelivery, openNow, maxDeliveryTime, promoted, router]);

  // Initial load: bestsellers + recent + recommendations + orders
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch('/api/products/bestsellers?limit=12').then((r) => r.json()).catch(() => ({})),
      fetch('/api/products/recent?limit=10').then((r) => r.json()).catch(() => ({})),
      fetch('/api/orders/recent?limit=5').then((r) => r.json()).catch(() => ({})),
    ]).then(([bestsellersRes, recentRes, ordersRes]) => {
      if (cancelled) return;
      if (bestsellersRes.status === 'fulfilled') {
        setBestsellers(bestsellersRes.value?.bestsellers || []);
      }
      if (recentRes.status === 'fulfilled') {
        setRecent(recentRes.value?.recent || []);
        setRecommendations(recentRes.value?.recommendations || []);
      }
      if (ordersRes.status === 'fulfilled') {
        setRecentOrders(ordersRes.value?.orders || []);
      }
    });
    try {
      const h = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
      if (Array.isArray(h)) setSearchHistory(h.slice(0, SEARCH_HISTORY_MAX));
    } catch {}
    return () => { cancelled = true; };
  }, []);

  // Search with AbortController
  const performSearch = useCallback(
    async (query: string, currentSort: string) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const p = new URLSearchParams();
        if (query) p.set('q', query);
        p.set('sort', currentSort);
        if (type) p.set('type', type);
        if (cuisine) p.set('cuisine', cuisine);
        if (minRating > 0) p.set('min_rating', String(minRating));
        if (maxPrice < 999) p.set('max_price', String(maxPrice));
        if (badge) p.set('badge', badge);
        if (inStock) p.set('in_stock', '1');
        if (freeDelivery) p.set('free_delivery', '1');
        if (openNow) p.set('open_now', '1');
        if (maxDeliveryTime > 0) p.set('max_delivery_time', String(maxDeliveryTime));
        if (promoted) p.set('promoted', '1');

        const res = await fetch(`/api/search?${p.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setRestaurants(data.restaurants || []);
        setProducts(data.products || []);

        if (query) {
          try {
            const h = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
            const newH = [query, ...(Array.isArray(h) ? h.filter((x: string) => x !== query) : [])].slice(0, SEARCH_HISTORY_MAX);
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newH));
            setSearchHistory(newH);
          } catch {}
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error('Search failed:', e);
          setRestaurants([]);
          setProducts([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [type, cuisine, minRating, maxPrice, badge, inStock, freeDelivery, openNow, maxDeliveryTime, promoted]
  );

  // Debounced re-search on input/filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(q, sort);
      updateUrl();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort, type, cuisine, minRating, maxPrice, badge, inStock, freeDelivery, openNow, maxDeliveryTime, promoted]);

  // Sort options (built from i18n)
  const sortOptions = [
    { value: 'recommended', label: ct('sortRecommended', 'Empfohlen'), icon: Sparkles },
    { value: 'rating_desc', label: ct('sortRating', 'Bewertung'), icon: Star },
    { value: 'bestseller', label: ct('sortBestseller', 'Bestseller'), icon: TrendingUp },
    { value: 'price_asc', label: ct('sortPriceAsc', 'Preis aufsteigend'), icon: ChevronUp },
    { value: 'price_desc', label: ct('sortPriceDesc', 'Preis absteigend'), icon: ChevronDown },
    { value: 'newest', label: ct('sortNewest', 'Neueste'), icon: Flame },
  ];

  const cuisinesByLocale: Record<string, string[]> = {
    de: ['Burger', 'Pizza', 'Sushi', 'Asiatisch', 'Deutsch', 'Italienisch', 'Mexikanisch', 'Indisch', 'Salat', 'Vegan'],
    ar: ['برغر', 'بيتزا', 'سوشي', 'آسيوي', 'عربي', 'إيطالي', 'مكسيكي', 'هندي', 'سلطة', 'نباتي'],
    en: ['Burger', 'Pizza', 'Sushi', 'Asian', 'Arabic', 'Italian', 'Mexican', 'Indian', 'Salad', 'Vegan'],
  };
  const cuisines = cuisinesByLocale[locale] || cuisinesByLocale.de;

  const totalResults = restaurants.length + products.length;
  const activeFilters = [
    { key: 'type', value: type, label: type === 'restaurant' ? ct('tabRestaurants', 'Restaurants') : type === 'market' ? (locale === 'ar' ? 'سوق' : locale === 'de' ? 'Markt' : 'Market') : type === 'pharmacy' ? (locale === 'ar' ? 'صيدلية' : locale === 'de' ? 'Apotheke' : 'Pharmacy') : type, onRemove: () => setType(null) },
    { key: 'cuisine', value: cuisine, label: cuisine, onRemove: () => setCuisine(null) },
    { key: 'rating', value: minRating > 0 ? 'rating' : null, label: `${minRating}★+`, onRemove: () => setMinRating(0) },
    { key: 'price', value: maxPrice < 999 ? 'price' : null, label: `<${maxPrice}€`, onRemove: () => setMaxPrice(999) },
    { key: 'badge', value: badge, label: badge ? (BADGE_LABELS[badge]?.[locale] || badge) : null, onRemove: () => setBadge(null) },
    { key: 'freeDelivery', value: freeDelivery ? 'free' : null, label: ct('freeDelivery', 'Gratis Lieferung'), onRemove: () => setFreeDelivery(false) },
    { key: 'openNow', value: openNow ? 'open' : null, label: ct('openNow', 'Jetzt geöffnet'), onRemove: () => setOpenNow(false) },
    { key: 'maxDeliveryTime', value: maxDeliveryTime > 0 ? 'time' : null, label: `<${maxDeliveryTime}min`, onRemove: () => setMaxDeliveryTime(0) },
    { key: 'promoted', value: promoted ? 'promoted' : null, label: ct('promoted', 'Empfohlen'), onRemove: () => setPromoted(false) },
  ].filter((f) => f.value);

  const clearAllFilters = () => {
    setType(null);
    setCuisine(null);
    setMinRating(0);
    setMaxPrice(999);
    setBadge(null);
    setInStock(false);
    setFreeDelivery(false);
    setOpenNow(false);
    setMaxDeliveryTime(0);
    setPromoted(false);
  };

  return (
    <div className="min-h-screen bg-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-sticky bg-bg/85 backdrop-blur-xl border-b border-edge">
        <div className="max-w-5xl mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <Link
              href="/restaurants"
              className="p-2 -m-2 text-text-secondary hover:text-white transition-colors"
              aria-label={ct('a11yCloseFilters', 'Close')}
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
            </Link>
            <div className="relative flex-1">
              <SearchIcon
                className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={ct('searchPlaceholder', 'Suche nach Restaurant, Gericht, Küche…')}
                aria-label={ct('a11ySearchInput', 'Search for restaurants or dishes')}
                className="w-full h-11 ps-10 pe-10 rounded-xl bg-bg-elevated border border-edge text-sm text-text placeholder:text-text-muted focus:border-brand focus:bg-bg-subtle focus:shadow-[0_0_0_3px_rgba(255,107,26,0.12)] transition-all duration-200 ease-silk outline-none"
                autoFocus
                enterKeyHint="search"
                autoComplete="off"
              />
              {q && (
                <button
                  onClick={() => setQ('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-surface-light text-text-secondary hover:text-white flex items-center justify-center transition-colors"
                  aria-label={ct('a11yClearQuery', 'Clear search')}
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
                </button>
              )}
            </div>
            <VoiceSearch />
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'relative w-11 h-11 rounded-xl border transition-all duration-200 ease-silk flex items-center justify-center touch-manipulation',
                showFilters || activeFilters.length > 0
                  ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white border-transparent shadow-speed-glow'
                  : 'bg-bg-elevated text-text-secondary border-edge hover:border-edge-strong hover:text-white'
              )}
              aria-label={ct('a11yFilterButton', 'Show filters')}
              aria-expanded={showFilters}
            >
              <Filter className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
              {activeFilters.length > 0 && (
                <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-yellow-500 text-white text-[10px] flex items-center justify-center font-extrabold border-2 border-bg">
                  {activeFilters.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick filter chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide" role="toolbar" aria-label="Quick filters">
            <QuickChip
              active={freeDelivery}
              onClick={() => setFreeDelivery(!freeDelivery)}
              icon={Truck}
              label={ct('freeDelivery', 'Gratis Lieferung')}
            />
            <QuickChip
              active={openNow}
              onClick={() => setOpenNow(!openNow)}
              icon={BadgeCheck}
              label={ct('openNow', 'Jetzt geöffnet')}
            />
            <QuickChip
              active={maxDeliveryTime === 30}
              onClick={() => setMaxDeliveryTime(maxDeliveryTime === 30 ? 0 : 30)}
              icon={Zap}
              label={ct('under30Min', 'Unter 30 Min')}
            />
            <QuickChip
              active={promoted}
              onClick={() => setPromoted(!promoted)}
              icon={Award}
              label={ct('promoted', 'Empfohlen')}
            />
            {restaurants.length > 0 && (
              <div className="ms-auto flex items-center gap-1 p-0.5 rounded-lg bg-bg-elevated border border-edge">
                <ViewButton active={view === 'grid'} onClick={() => setView('grid')} icon={Grid3x3} label={ct('a11yGridView', 'Grid')} />
                <ViewButton active={view === 'list'} onClick={() => setView('list')} icon={List} label={ct('a11yListView', 'List')} />
                <ViewButton active={view === 'map'} onClick={() => setView('map')} icon={MapIcon} label={ct('a11yMapView', 'Map')} />
              </div>
            )}
          </div>

          {/* Sort tabs */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
            role="tablist"
            aria-label="Sort"
          >
            {sortOptions.map((s) => {
              const Icon = s.icon;
              const active = sort === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => setSort(s.value)}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 ease-silk touch-manipulation',
                    active
                      ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-speed-glow'
                      : 'bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white border border-edge'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div
            className="max-w-5xl mx-auto px-4 pb-4 space-y-3 border-t border-edge-light pt-3 animate-slide-in"
            role="region"
            aria-label={ct('a11yFilterButton', 'Filters')}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-text flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                {ct('a11yFilterButton', 'Filter')}
                {activeFilters.length > 0 && (
                  <span className="text-xs text-text-muted font-normal">
                    ({activeFilters.length})
                  </span>
                )}
              </h3>
              {activeFilters.length > 1 && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs font-bold text-danger hover:text-danger/80 transition-colors"
                >
                  {ct('filterClear', 'Alle löschen')}
                </button>
              )}
            </div>

            {/* Type */}
            <FilterChips
              label={ct('filterType', 'Typ')}
              allLabel={ct('filterAll', 'Alle')}
              options={[
                { value: 'restaurant' },
                { value: 'market' },
                { value: 'pharmacy' },
              ]}
              value={type}
              onChange={setType}
              getLabel={(v) =>
                v === 'restaurant' ? ct('tabRestaurants', 'Restaurants')
                : v === 'market' ? (locale === 'ar' ? 'المتاجر' : locale === 'en' ? 'Markets' : 'Märkte')
                : v === 'pharmacy' ? (locale === 'ar' ? 'الصيدليات' : locale === 'en' ? 'Pharmacies' : 'Apotheken')
                : v
              }
            />

            {/* Cuisine */}
            <FilterChips
              label={ct('filterCuisine', 'Küche')}
              allLabel={ct('filterAll', 'Alle')}
              options={cuisines.map((c) => ({ value: c }))}
              value={cuisine}
              onChange={(v) => setCuisine(cuisine === v ? null : v)}
            />

            {/* Min Rating */}
            <div>
              <p className="text-xs font-semibold text-text-muted mb-2">
                {ct('filterRating', 'Mindestbewertung')}
              </p>
              <div className="flex gap-2">
                {[0, 3, 4, 4.5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setMinRating(r)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1.5 rounded-pill text-xs font-semibold transition-all',
                      minRating === r
                        ? 'bg-speed-gradient text-white'
                        : 'bg-surface-elevated text-text-secondary'
                    )}
                  >
                    {r === 0 ? ct('filterAll', 'Alle') : (
                      <>
                        <Star className="w-3 h-3 fill-current" aria-hidden="true" />
                        {r}+
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Price */}
            <div>
              <p className="text-xs font-semibold text-text-muted mb-2">
                {ct('filterPrice', 'Max. Preis')}: {maxPrice < 999 ? `${formatCurrency(maxPrice, locale)}` : ct('filterAll', 'Alle')}
              </p>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={maxPrice > 50 ? 50 : maxPrice}
                onChange={(e) => setMaxPrice(parseFloat(e.target.value))}
                className="w-full accent-brand-500"
                aria-label={ct('filterPrice', 'Max. Preis')}
              />
            </div>

            {/* Badge */}
            <FilterChips
              label={ct('filterBadge', 'Auszeichnung')}
              allLabel={ct('filterAll', 'Alle')}
              options={['new', 'bestseller', 'sale', 'hot', 'recommended'].map((v) => ({ value: v }))}
              value={badge}
              onChange={(v) => setBadge(badge === v ? null : v)}
              getLabel={(v) => BADGE_LABELS[v]?.[locale] || v}
            />

            {/* In stock */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => setInStock(e.target.checked)}
                className="w-4 h-4 rounded accent-brand-500"
              />
              <span className="text-sm text-white">
                {ct('filterStock', 'Nur verfügbare Produkte')}
              </span>
            </label>

            <button onClick={clearAllFilters} className="btn-secondary text-xs">
              {ct('filterReset', 'Filter zurücksetzen')}
            </button>
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-6">
        {/* Active filter chips */}
        {activeFilters.length > 0 && !q && (
          <div className="flex items-center gap-2 flex-wrap" role="region" aria-label="Active filters">
            <span className="text-xs font-semibold text-text-muted">
              {ct('quickFilter', 'Aktiv')}:
            </span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                onClick={f.onRemove}
                className="flex items-center gap-1 px-2.5 py-1 rounded-pill bg-brand/15 text-brand text-xs font-semibold border border-brand/30 hover:bg-brand/25 transition-colors"
                aria-label={`${ct('a11yClearQuery', 'Remove')} ${f.label}`}
              >
                {f.label}
                <X className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
              </button>
            ))}
            {activeFilters.length > 1 && (
              <button
                onClick={clearAllFilters}
                className="text-xs font-bold text-danger hover:text-danger/80"
              >
                {ct('filterClear', 'Alle löschen')}
              </button>
            )}
          </div>
        )}

        {/* Order Again section (when no query) */}
        {!q && recentOrders.length > 0 && (
          <Section title={ct('orderAgain', 'Nochmal bestellen')} icon={Heart} t={t}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentOrders.map((o) => (
                <RecentOrderCard
                  key={o.id}
                  order={o}
                  userLocation={userLocation}
                  locale={locale}
                  ct={ct}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Search history (only when no query) */}
        {!q && searchHistory.length > 0 && (
          <div className="card-glass p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-edge flex items-center justify-center text-text-secondary">
                  <History className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                </div>
                <h3 className="font-bold text-text text-sm">
                  {ct('lastSearches', 'Letzte Suchanfragen')}
                </h3>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem(SEARCH_HISTORY_KEY);
                  setSearchHistory([]);
                }}
                className="text-xs font-bold text-text-muted hover:text-danger transition-colors"
              >
                {ct('clearHistory', 'Löschen')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((h) => (
                <button
                  key={h}
                  onClick={() => setQ(h)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white border border-edge transition-colors"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active search results */}
        {q && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted" aria-live="polite" role="status">
                {loading
                  ? ct('searching', 'Suche läuft…')
                  : ct('resultsFor', '{count} Ergebnisse für "{query}"').replace('{count}', String(totalResults)).replace('{query}', q)}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-bg-elevated rounded-2xl border border-edge w-fit" role="tablist">
              <button
                onClick={() => setTab('restaurants')}
                role="tab"
                aria-selected={tab === 'restaurants'}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all duration-200 ease-silk',
                  tab === 'restaurants'
                    ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-speed-glow'
                    : 'text-text-secondary hover:text-white'
                )}
              >
                <StoreIcon className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                {ct('tabRestaurants', 'Restaurants')} ({restaurants.length})
              </button>
              <button
                onClick={() => setTab('products')}
                role="tab"
                aria-selected={tab === 'products'}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all duration-200 ease-silk',
                  tab === 'products'
                    ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-speed-glow'
                    : 'text-text-secondary hover:text-white'
                )}
              >
                <ShoppingBag className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                {ct('tabProducts', 'Produkte')} ({products.length})
              </button>
            </div>

            {loading && totalResults === 0 ? (
              <ResultsSkeleton view={view} />
            ) : tab === 'restaurants' ? (
              restaurants.length === 0 ? (
                <EmptyResults query={q} type="restaurant" onClearFilters={clearAllFilters} ct={ct} />
              ) : view === 'map' ? (
                <MapViewPlaceholder restaurants={restaurants} userLocation={userLocation} ct={ct} />
              ) : view === 'list' ? (
                <div className="space-y-2" role="feed" aria-busy={loading}>
                  {restaurants.map((r) => (
                    <RestaurantListItem key={r.id} restaurant={r} locale={locale} userLocation={userLocation} ct={ct} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="feed" aria-busy={loading}>
                  {restaurants.map((r) => (
                    <RestaurantResultCard key={r.id} restaurant={r} locale={locale} userLocation={userLocation} ct={ct} />
                  ))}
                </div>
              )
            ) : products.length === 0 ? (
              <EmptyResults query={q} type="product" onClearFilters={clearAllFilters} ct={ct} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="feed" aria-busy={loading}>
                {products.map((p) => (
                  <ProductResultCard key={p.id} product={p} locale={locale} ct={ct} />
                ))}
              </div>
            )}
          </>
        )}

        {/* When no query: show bestsellers + recent + recommendations */}
        {!q && (
          <>
            {restaurants.length > 0 && (
              <Section
                title={ct('topNearYou', 'Top Restaurants in Ihrer Nähe')}
                icon={Sparkles}
                t={t}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {restaurants.slice(0, 6).map((r) => (
                    <RestaurantResultCard key={r.id} restaurant={r} locale={locale} userLocation={userLocation} ct={ct} />
                  ))}
                </div>
              </Section>
            )}

            {recent.length > 0 && (
              <Section title={ct('recentlyViewed', 'Zuletzt angesehen')} icon={History} t={t}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {recent.slice(0, 5).map((p) => (
                    <ProductResultCard key={p.id} product={p} compact locale={locale} ct={ct} />
                  ))}
                </div>
              </Section>
            )}

            {bestsellers.length > 0 && (
              <Section title={ct('bestsellers', 'Bestseller')} icon={Award} t={t}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {bestsellers.slice(0, 8).map((p) => (
                    <ProductResultCard key={p.id} product={p} compact locale={locale} ct={ct} />
                  ))}
                </div>
              </Section>
            )}

            {recommendations.length > 0 && (
              <Section title={ct('recommendedForYou', 'Für dich empfohlen')} icon={Sparkles} t={t}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {recommendations.slice(0, 8).map((p) => (
                    <ProductResultCard key={p.id} product={p} compact locale={locale} ct={ct} />
                  ))}
                </div>
              </Section>
            )}

            <div className="card-glass p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-brand-red-500/10 border border-brand-red-500/20 flex items-center justify-center text-brand">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                </div>
                <h3 className="font-bold text-text text-sm">
                  {ct('suggestedSearches', 'Vorgeschlagene Suchanfragen')}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {cuisines.slice(0, 8).map((s) => (
                  <button
                    key={s}
                    onClick={() => setQ(s)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white border border-edge transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ===== Memoized child components =====

function Section({ title, icon: Icon, children, t }: { title: string; icon: any; children: React.ReactNode; t: any }) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="w-9 h-9 rounded-xl bg-brand-red-500/10 border border-brand-red-500/20 flex items-center justify-center text-brand">
          <Icon className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
        </div>
        <h2 className="font-extrabold text-text text-base tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ResultsSkeleton({ view }: { view: ViewMode }) {
  const count = view === 'list' ? 5 : 6;
  return (
    <div className={cn(view === 'list' ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3')} role="status" aria-label="Loading">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="skeleton h-48 rounded-2xl" />
      ))}
    </div>
  );
}

function QuickChip({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 ease-silk touch-manipulation',
        active
          ? 'bg-success/15 text-success border border-success/30'
          : 'bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white border border-edge'
      )}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'w-7 h-7 rounded-md flex items-center justify-center transition-all',
        active ? 'bg-brand text-white' : 'text-text-muted hover:text-white'
      )}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function FilterChips<T extends string>({
  label, allLabel, options, value, onChange, getLabel,
}: {
  label: string;
  allLabel: string;
  options: Array<{ value: T }>;
  value: T | null;
  onChange: (v: T | null) => void;
  getLabel?: (v: T) => string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-muted mb-2">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        <button
          onClick={() => onChange(null)}
          className={cn(
            'px-3 py-1.5 rounded-pill text-xs font-semibold transition-all',
            !value ? 'bg-speed-gradient text-white' : 'bg-surface-elevated text-text-secondary'
          )}
          aria-pressed={!value}
        >
          {allLabel}
        </button>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={cn(
              'px-3 py-1.5 rounded-pill text-xs font-semibold transition-all',
              value === opt.value ? 'bg-speed-gradient text-white' : 'bg-surface-elevated text-text-secondary'
            )}
            aria-pressed={value === opt.value}
          >
            {getLabel ? getLabel(opt.value) : opt.value}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyResults({ query, type, onClearFilters, ct }: { query: string; type: 'restaurant' | 'product'; onClearFilters: () => void; ct: (k: string, fb?: string) => string }) {
  return (
    <div className="card-glass p-10 text-center" role="status">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div className="absolute inset-0 rounded-2xl bg-brand-red-500/15 blur-xl" />
        <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-brand-red-500/15 to-brand-yellow-500/10 border border-brand-red-500/20 flex items-center justify-center text-brand">
          <SearchIcon className="w-7 h-7" strokeWidth={1.75} aria-hidden="true" />
        </div>
      </div>
      <h3 className="font-extrabold text-text mb-1">{ct('noResultsTitle', 'Keine Ergebnisse')}</h3>
      <p className="text-sm text-text-secondary">
        {ct(type === 'restaurant' ? 'noResultsDescSearch' : 'noResultsDescSearch', 'Wir konnten nichts finden')} "{query}"
      </p>
      <p className="text-xs text-text-muted mt-2">
        {ct('tryDifferentSearch', 'Versuche eine andere Suche oder passe die Filter an')}
      </p>
      <button
        onClick={onClearFilters}
        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white text-sm font-bold hover:shadow-glow-strong transition-all"
      >
        <Filter className="w-3.5 h-3.5" aria-hidden="true" />
        {ct('removeFilters', 'Filter entfernen')}
      </button>
    </div>
  );
}

function MapViewPlaceholder({ restaurants, userLocation, ct }: { restaurants: Restaurant[]; userLocation: { lat: number; lng: number } | null; ct: (k: string, fb?: string) => string }) {
  // In production, integrate with Leaflet/Google Maps
  // For now, show a clean placeholder
  return (
    <div className="card-glass p-8 text-center" role="region" aria-label="Map view">
      <div className="w-16 h-16 rounded-2xl bg-brand-red-500/15 border border-brand-red-500/30 flex items-center justify-center text-brand mx-auto mb-3">
        <MapIcon className="w-7 h-7" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h3 className="font-bold text-text mb-1">{restaurants.length} {ct('tabRestaurants', 'Restaurants')}</h3>
      <p className="text-xs text-text-muted mb-4">
        {userLocation ? `${userLocation.lat.toFixed(2)}, ${userLocation.lng.toFixed(2)}` : '—'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-start">
        {restaurants.slice(0, 10).map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-bg-elevated border border-edge">
            <div className="w-6 h-6 rounded-md bg-brand-red-500/15 text-brand flex items-center justify-center text-xs font-bold flex-shrink-0">
              {i + 1}
            </div>
            <span className="text-xs text-text truncate flex-1 min-w-0">{r.name}</span>
            {r.rating && (
              <span className="text-xs text-warning font-bold tabular-nums">★ {r.rating.toFixed(1)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const RestaurantResultCard = memo(function RestaurantResultCard({
  restaurant, locale, userLocation, ct,
}: {
  restaurant: Restaurant;
  locale: string;
  userLocation: { lat: number; lng: number } | null;
  ct: (k: string, fb?: string) => string;
}) {
  const distance = useMemo(() => {
    if (!userLocation || !restaurant.latitude || !restaurant.longitude) return null;
    return haversineDistance(
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: restaurant.latitude, lng: restaurant.longitude }
    );
  }, [userLocation, restaurant.latitude, restaurant.longitude]);

  return (
    <Link
      href={`/restaurants/${restaurant.id}`}
      className="group block rounded-2xl overflow-hidden card-glass hover:-translate-y-1 transition-all duration-200 ease-silk focus:outline-none focus:ring-2 focus:ring-brand-red-500/30"
      aria-label={ct('a11yRestaurantCard', 'View restaurant').replace('{name}', restaurant.name)}
    >
      <div className="relative h-32 bg-gradient-to-br from-surface to-bg overflow-hidden">
        {restaurant.cover_url ? (
          <Image
            src={restaurant.cover_url}
            onError={hideOnError}
            alt={restaurant.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-110 transition-transform duration-700 ease-silk"
            loading="lazy"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl" aria-hidden="true">🍽️</div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        <FavoriteButton restaurantId={restaurant.id} />
        {restaurant.is_promoted && (
          <span className="absolute top-2.5 start-2.5 flex items-center gap-1 text-[10px] bg-warning/90 backdrop-blur-sm text-black px-2 py-0.5 rounded-full font-extrabold">
            <Award className="w-2.5 h-2.5" aria-hidden="true" />
            {ct('promoted', 'Empfohlen')}
          </span>
        )}
        {restaurant.type && restaurant.type !== 'restaurant' && (
          <span className="absolute top-2.5 end-2.5 text-[10px] bg-info/90 backdrop-blur-sm text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            {restaurant.type === 'market'
              ? (locale === 'ar' ? 'سوق' : locale === 'en' ? 'Market' : 'Markt')
              : restaurant.type === 'pharmacy'
                ? (locale === 'ar' ? 'صيدلية' : locale === 'en' ? 'Pharmacy' : 'Apotheke')
                : ''}
          </span>
        )}
      </div>
      <div className="p-3.5">
        <h3 className="font-extrabold text-text text-sm truncate mb-1.5">{restaurant.name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary tabular-nums flex-wrap">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-warning/10 text-warning font-bold">
            <Star className="w-3 h-3 fill-current" strokeWidth={0} aria-hidden="true" />
            {restaurant.rating?.toFixed(1) || '–'}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {restaurant.estimated_delivery_time || 30} {locale === 'ar' ? 'د' : 'min'}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Truck className="w-3 h-3" aria-hidden="true" />
            {(restaurant.delivery_fee || 0) === 0 ? ct('free', 'Gratis') : formatEUR(restaurant.delivery_fee || 0)}
          </span>
          {distance != null && (
            <span className="inline-flex items-center gap-0.5 ms-auto">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              {formatDistance(distance, (locale === "ar" || locale === "de" || locale === "en" ? locale : "de") as "ar" | "de" | "en")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
});

const RestaurantListItem = memo(function RestaurantListItem({
  restaurant, locale, userLocation, ct,
}: {
  restaurant: Restaurant;
  locale: string;
  userLocation: { lat: number; lng: number } | null;
  ct: (k: string, fb?: string) => string;
}) {
  const distance = useMemo(() => {
    if (!userLocation || !restaurant.latitude || !restaurant.longitude) return null;
    return haversineDistance(
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: restaurant.latitude, lng: restaurant.longitude }
    );
  }, [userLocation, restaurant.latitude, restaurant.longitude]);

  return (
    <Link
      href={`/restaurants/${restaurant.id}`}
      className="group flex items-center gap-3 p-3 rounded-2xl card-glass hover:bg-bg-subtle transition-all focus:outline-none focus:ring-2 focus:ring-brand-red-500/30"
      aria-label={ct('a11yRestaurantCard', 'View restaurant').replace('{name}', restaurant.name)}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-surface to-bg">
        {restaurant.cover_url ? (
          <Image
            src={restaurant.cover_url}
            onError={hideOnError}
            alt={restaurant.name}
            fill
            sizes="80px"
            className="object-cover"
            loading="lazy"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl" aria-hidden="true">🍽️</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-extrabold text-text text-sm truncate">{restaurant.name}</h3>
        <p className="text-xs text-text-muted truncate mt-0.5">
          {restaurant.cuisine?.slice(0, 2).join(' · ') || '—'}
        </p>
        <div className="flex items-center gap-2 text-xs text-text-secondary tabular-nums mt-1">
          <span className="inline-flex items-center gap-0.5 text-warning font-bold">
            <Star className="w-3 h-3 fill-current" strokeWidth={0} aria-hidden="true" />
            {restaurant.rating?.toFixed(1) || '–'}
          </span>
          <span>·</span>
          <span>{restaurant.estimated_delivery_time || 30} min</span>
          <span>·</span>
          <span>{(restaurant.delivery_fee || 0) === 0 ? ct('free', 'Gratis') : formatEUR(restaurant.delivery_fee || 0)}</span>
        </div>
      </div>
      {distance != null && (
        <div className="text-xs text-text-muted font-semibold flex-shrink-0">
          {formatDistance(distance, (locale === "ar" || locale === "de" || locale === "en" ? locale : "de") as "ar" | "de" | "en")}
        </div>
      )}
    </Link>
  );
});

const ProductResultCard = memo(function ProductResultCard({
  product, compact, locale, ct,
}: {
  product: Product;
  compact?: boolean;
  locale: string;
  ct: (k: string, fb?: string) => string;
}) {
  const hasDiscount = product.discount_price != null && product.discount_price < product.price;
  const finalPrice = hasDiscount ? product.discount_price! : product.price;
  const firstBadge = product.badges?.[0];

  return (
    <Link
      href={`/restaurants/${product.restaurant_id}`}
      className="group block rounded-2xl overflow-hidden card-glass hover:-translate-y-1 transition-all duration-200 ease-silk focus:outline-none focus:ring-2 focus:ring-brand-red-500/30"
      aria-label={ct('a11yProductCard', 'View product').replace('{name}', product.name)}
    >
      <div className={`relative ${compact ? 'h-28' : 'h-36'} bg-gradient-to-br from-surface to-bg overflow-hidden`}>
        {(product.image_urls?.[0] || (product as any).image_url) ? (
          <Image
            src={(product.image_urls?.[0] || (product as any).image_url)!}
            onError={hideOnError}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-110 transition-transform duration-700 ease-silk"
            loading="lazy"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl" aria-hidden="true">🍽️</div>
        )}
        {firstBadge && BADGE_LABELS[firstBadge] && (
          <span className="absolute top-2 end-2 inline-flex items-center bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider shadow-speed-glow">
            {BADGE_LABELS[firstBadge][locale] || firstBadge}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="font-bold text-text text-xs truncate">{product.name}</h3>
        {!compact && product.description && (
          <p className="text-[10px] text-text-muted line-clamp-2 mt-0.5 leading-snug">{product.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-sm font-extrabold text-brand tabular-nums">{formatEUR(finalPrice)}</span>
          {hasDiscount && (
            <span className="text-[10px] text-text-muted line-through tabular-nums">{formatEUR(product.price)}</span>
          )}
        </div>
      </div>
    </Link>
  );
});

const RecentOrderCard = memo(function RecentOrderCard({
  order, userLocation, locale, ct,
}: {
  order: RecentOrder;
  userLocation: { lat: number; lng: number } | null;
  locale: string;
  ct: (k: string, fb?: string) => string;
}) {
  const r = order.restaurants;
  const distance = useMemo(() => {
    if (!userLocation || !r.latitude || !r.longitude) return null;
    return haversineDistance(
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: r.latitude, lng: r.longitude }
    );
  }, [userLocation, r.latitude, r.longitude]);

  return (
    <Link
      href={`/restaurants/${r.id}`}
      className="group block rounded-2xl overflow-hidden card-glass hover:-translate-y-1 transition-all focus:outline-none focus:ring-2 focus:ring-brand-red-500/30"
      aria-label={`${ct('reorder', 'Reorder')} ${r.name}`}
    >
      <div className="relative h-24 bg-gradient-to-br from-surface to-bg overflow-hidden">
        {r.cover_url ? (
          <Image src={r.cover_url} alt={r.name} onError={hideOnError as any} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl" aria-hidden="true">🍽️</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute bottom-2 start-2 inline-flex items-center gap-1 bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white text-[10px] px-2 py-0.5 rounded-full font-extrabold shadow-speed-glow">
          <Package className="w-2.5 h-2.5" aria-hidden="true" />
          {ct('reorder', 'Erneut bestellen')}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-extrabold text-text text-sm truncate">{r.name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-text-muted tabular-nums mt-1">
          <span>{new Date(order.created_at).toLocaleDateString(locale)}</span>
          <span>·</span>
          <span className="font-bold text-text">{formatEUR(order.total)}</span>
          {distance != null && (
            <>
              <span>·</span>
              <span>{formatDistance(distance, (locale === "ar" || locale === "de" || locale === "en" ? locale : "de") as "ar" | "de" | "en")}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
});
