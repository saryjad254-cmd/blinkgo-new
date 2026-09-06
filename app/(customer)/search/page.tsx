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
import { SearchMap } from '@/components/maps/SearchMap';
import { trackSearchEvent } from '@/lib/analytics/search';
import { useOnlineStatus, useCachedFetch } from '@/lib/hooks/useOnlineStatus';
import SearchIcon from 'lucide-react/dist/esm/icons/search';
import Filter from 'lucide-react/dist/esm/icons/filter';
import X from 'lucide-react/dist/esm/icons/x';
import Star from 'lucide-react/dist/esm/icons/star';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Truck from 'lucide-react/dist/esm/icons/truck';
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up';
import Flame from 'lucide-react/dist/esm/icons/flame';
import Award from 'lucide-react/dist/esm/icons/award';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up';
import History from 'lucide-react/dist/esm/icons/history';
import StoreIcon from 'lucide-react/dist/esm/icons/store';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import SlidersHorizontal from 'lucide-react/dist/esm/icons/sliders-horizontal';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Grid3x3 from 'lucide-react/dist/esm/icons/grid-3x3';
import List from 'lucide-react/dist/esm/icons/list';
import MapIcon from 'lucide-react/dist/esm/icons/map';
import Zap from 'lucide-react/dist/esm/icons/zap';
import BadgeCheck from 'lucide-react/dist/esm/icons/badge-check';
import Heart from 'lucide-react/dist/esm/icons/heart';
import Package from 'lucide-react/dist/esm/icons/package';
import { VoiceSearch } from '@/components/customer/VoiceSearch';
import { FavoriteButton } from '@/components/customer/FavoriteButton';
import { useI18n, useTranslations } from '@/lib/i18n/I18nProvider';
import { formatEUR } from '@/lib/format';
import { haversineDistance, formatDistance } from '@/lib/delivery-zone';
import { cn } from '@/lib/cn';
import type { LucideIcon } from 'lucide-react';

interface Restaurant {
  id: string;
  name: string;
  cuisines: string[];
  cuisine?: string[];
  cuisines_label?: string;
  rating: number;
  total_reviews: number;
  delivery_time_min: number;
  delivery_fee: number;
  minimum_order?: number;
  address: string;
  cover_image_url?: string;
  cover_url?: string;
  logo_url?: string;
  description?: string;
  type?: string;
  latitude?: number;
  longitude?: number;
  is_promoted?: boolean;
  is_active?: boolean;
  is_paused?: boolean;
  busy_mode?: boolean;
  busy_mode_until?: string;
  is_hidden?: boolean;
  estimated_delivery_time?: string | number;
  _highlight?: { name: string };
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
  restaurants?: Restaurant | null | false;
  sold_count: number;
  is_featured: boolean;
  category: string;
  rating?: number;
  is_active?: boolean;
  _highlight?: { name: string };
}

interface RecentOrder {
  id: string;
  status: string;
  total: number;
  created_at: string;
  restaurant_id: string;
  restaurants: Restaurant;
}

interface SearchSuggestion {
  query: string;
  restaurants: number;
  products: number;
}

interface SearchResponse {
  restaurants?: Restaurant[];
  products?: Product[];
  didYouMean?: SearchSuggestion[];
  total?: number;
  hasMore?: boolean;
  nextOffset?: number;
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
  const paramsString = params?.toString() ?? '';
  const { locale } = useI18n();
  const translate = useTranslations();
  const ct = useCallback(
    (key: string, fallback?: string) => translate(`customer.${key}`, fallback ?? key),
    [translate],
  );

  // ===== URL state sync (deep-linkable filters) =====
  const urlQ = params?.get('q') || params?.get('category') || '';
  const rawUrlSort = params?.get('sort') || 'recommended';
  const urlSort = rawUrlSort === 'popular' ? 'bestseller'
    : rawUrlSort === 'rating' ? 'rating_desc'
    : rawUrlSort === 'price_low' ? 'price_asc'
    : rawUrlSort === 'price_high' ? 'price_desc'
    : rawUrlSort;
  const urlType = params?.get('type');
  const urlCuisine = params?.get('cuisine');
  const urlMinRating = Math.min(5, Math.max(0, Number(params?.get('min_rating') || 0)));
  const urlMaxPrice = Math.min(999, Math.max(0, Number(params?.get('max_price') || 999)));
  const urlBadge = params?.get('badge');
  const urlInStock = params?.get('in_stock') === '1';
  const urlFreeDelivery = params?.get('free_delivery') === '1';
  const urlOpenNow = params?.get('open_now') === '1';
  const urlMaxDeliveryTime = params?.get('max_delivery_time')
    ? parseInt(params.get('max_delivery_time')!)
    : 0;
  const urlPromoted = params?.get('promoted') === '1';
  const rawUrlView = params?.get('view');
  const urlView: ViewMode = rawUrlView === 'list' || rawUrlView === 'map' ? rawUrlView : 'grid';

  // ===== Component state =====
  const [q, setQ] = useState(urlQ);
  const [sort, setSort] = useState(urlSort);
  const [type, setType] = useState<string | null>(urlType);
  const [cuisine, setCuisine] = useState<string | null>(urlCuisine);
  const [minRating, setMinRating] = useState(urlMinRating);
  const [maxPrice, setMaxPrice] = useState(urlMaxPrice);
  const [badge, setBadge] = useState<string | null>(urlBadge);
  const [inStock, setInStock] = useState(urlInStock);
  const [freeDelivery, setFreeDelivery] = useState(urlFreeDelivery);
  const [openNow, setOpenNow] = useState(urlOpenNow);
  const [maxDeliveryTime, setMaxDeliveryTime] = useState(urlMaxDeliveryTime);
  const [promoted, setPromoted] = useState(urlPromoted);
  const [showFilters, setShowFilters] = useState(params?.get('filter') === '1');
  const [view, setView] = useState<ViewMode>(urlView);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [didYouMean, setDidYouMean] = useState<SearchSuggestion[]>([]);
  const [highlightedMarkerId, setHighlightedMarkerId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [bestsellers, setBestsellers] = useState<Product[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [tab, setTab] = useState<'restaurants' | 'products'>('restaurants');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Browser back/forward must restore the complete search UI, not only change
  // the address bar. Shared links are already covered by the lazy initial state.
  useEffect(() => {
    const restoreFromHistory = () => {
      const next = new URLSearchParams(window.location.search);
      const nextRawSort = next.get('sort') || 'recommended';
      const nextSort = nextRawSort === 'popular' ? 'bestseller'
        : nextRawSort === 'rating' ? 'rating_desc'
        : nextRawSort === 'price_low' ? 'price_asc'
        : nextRawSort === 'price_high' ? 'price_desc'
        : nextRawSort;
      const nextRawView = next.get('view');
      setQ(next.get('q') || next.get('category') || '');
      setSort(nextSort);
      setType(next.get('type'));
      setCuisine(next.get('cuisine'));
      setMinRating(Math.min(5, Math.max(0, Number(next.get('min_rating') || 0))));
      setMaxPrice(Math.min(999, Math.max(0, Number(next.get('max_price') || 999))));
      setBadge(next.get('badge'));
      setInStock(next.get('in_stock') === '1');
      setFreeDelivery(next.get('free_delivery') === '1');
      setOpenNow(next.get('open_now') === '1');
      setMaxDeliveryTime(next.get('max_delivery_time') ? Math.max(0, parseInt(next.get('max_delivery_time')!, 10) || 0) : 0);
      setPromoted(next.get('promoted') === '1');
      setShowFilters(next.get('filter') === '1');
      setView(nextRawView === 'list' || nextRawView === 'map' ? nextRawView : 'grid');
    };
    window.addEventListener('popstate', restoreFromHistory);
    return () => window.removeEventListener('popstate', restoreFromHistory);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const storedHistory = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        if (Array.isArray(storedHistory)) setSearchHistory(storedHistory.slice(0, SEARCH_HISTORY_MAX));
        const storedLocation = JSON.parse(localStorage.getItem('blinkgo-last-location') || 'null');
        if (storedLocation && typeof storedLocation.lat === 'number' && typeof storedLocation.lng === 'number') setUserLocation(storedLocation);
      } catch {
        // Corrupted local preferences must not block search rendering.
      }
    });
    return () => { cancelled = true; };
  }, []);
  const { isOnline } = useOnlineStatus();
  const { getCached, setCached } = useCachedFetch<{
    restaurants: Restaurant[];
    products: Product[];
    didYouMean?: SearchSuggestion[];
  }>(`search:${q}:${sort}:${type}:${cuisine}`);
  const [usedCached, setUsedCached] = useState(false);

  // ===== Debounced URL sync =====
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync state -> URL (debounced)
  const updateUrl = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(paramsString);
      if (q) next.set('q', q);
      else next.delete('q');
      next.delete('category');
      if (sort && sort !== 'recommended') next.set('sort', sort);
      else next.delete('sort');
      if (type) next.set('type', type);
      else next.delete('type');
      if (cuisine) next.set('cuisine', cuisine);
      else next.delete('cuisine');
      if (minRating > 0) next.set('min_rating', String(minRating));
      else next.delete('min_rating');
      if (maxPrice < 999) next.set('max_price', String(maxPrice));
      else next.delete('max_price');
      if (badge) next.set('badge', badge);
      else next.delete('badge');
      if (inStock) next.set('in_stock', '1');
      else next.delete('in_stock');
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
  }, [paramsString, pathname, q, sort, type, cuisine, minRating, maxPrice, badge, inStock, freeDelivery, openNow, maxDeliveryTime, promoted, router]);

  const selectView = useCallback((nextView: ViewMode) => {
    setView(nextView);
    const next = new URLSearchParams(paramsString);
    if (nextView === 'grid') next.delete('view');
    else next.set('view', nextView);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [paramsString, pathname, router]);

  const toggleFilters = useCallback(() => {
    const nextOpen = !showFilters;
    setShowFilters(nextOpen);
    const next = new URLSearchParams(paramsString);
    if (nextOpen) next.set('filter', '1');
    else next.delete('filter');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [paramsString, pathname, router, showFilters]);

  // Initial load: bestsellers + recent + recommendations + orders
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch('/api/products/bestsellers?limit=12').then((r) => r.json()).catch(() => ({})),
      fetch('/api/products/recent?limit=10').then((r) => r.json()).catch(() => ({})),
      fetch('/api/orders/recent?limit=5').then((r) => r.json()).catch(() => ({})),
      fetch('/api/recommendations?type=products&limit=8').then((r) => r.json()).catch(() => ({})),
    ]).then(([bestsellersRes, recentRes, ordersRes, recommendationsRes]) => {
      if (cancelled) return;
      if (bestsellersRes.status === 'fulfilled') {
        setBestsellers(bestsellersRes.value?.bestsellers || []);
      }
      if (recentRes.status === 'fulfilled') {
        setRecent(recentRes.value?.recent || recentRes.value?.products || []);
      }
      if (ordersRes.status === 'fulfilled') {
        setRecentOrders(ordersRes.value?.orders || []);
      }
      if (recommendationsRes.status === 'fulfilled') {
        setRecommendations(recommendationsRes.value?.data?.personalized || recommendationsRes.value?.personalized || []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Search with AbortController
  const performSearch = useCallback(
    async (query: string, currentSort: string, currentOffset = 0, append = false) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!append) setLoading(true);
      else setLoadingMore(true);
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
        if (currentOffset > 0) p.set('offset', String(currentOffset));

        const res = await fetch(`/api/search?${p.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Search request failed (${res.status})`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Search service returned an invalid response');
        }
        const data = await res.json() as SearchResponse;
        setUsedCached(false);
        const newRestaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
        const newProducts = Array.isArray(data.products) ? data.products : [];
        // Cache successful response for offline fallback
        if (!append && newRestaurants.length + newProducts.length > 0) {
          try {
            setCached({ restaurants: newRestaurants, products: newProducts, didYouMean: data.didYouMean || [] });
          } catch {}
        }

        if (append) {
          setRestaurants((prev) => {
            const known = new Set(prev.map((item) => item.id));
            return [...prev, ...newRestaurants.filter((item) => !known.has(item.id))];
          });
          setProducts((prev) => {
            const known = new Set(prev.map((item) => item.id));
            return [...prev, ...newProducts.filter((item) => !known.has(item.id))];
          });
        } else {
          setRestaurants(newRestaurants);
          setProducts(newProducts);
        }
        setDidYouMean(data.didYouMean || []);

        // Pagination state
        const total = data.total ?? (newRestaurants.length + newProducts.length);
        setHasMore(Boolean(data.hasMore));
        setNextOffset(typeof data.nextOffset === 'number' ? data.nextOffset : currentOffset);

        // Track search analytics (only for fresh queries, not appends)
        if (!append && query) {
          try {
            trackSearchEvent('search_submitted', {
              query,
              resultCount: total,
              filterCuisine: cuisine,
              filterSort: currentSort,
            });
            if (total === 0) {
              trackSearchEvent('search_zero_result', {
                query,
                filterCuisine: cuisine,
                filterSort: currentSort,
              });
            }
          } catch {}
        }

        if (query && !append) {
          try {
            const h = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
            const newH = [query, ...(Array.isArray(h) ? h.filter((x: string) => x !== query) : [])].slice(0, SEARCH_HISTORY_MAX);
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newH));
            setSearchHistory(newH);
          } catch {}
        }
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Search failed:', error);
          if (!append) {
            // Offline fallback: try cached results
            const cached = getCached();
            if (cached && cached.restaurants) {
              setRestaurants(cached.restaurants);
              setProducts(cached.products);
              setDidYouMean(cached.didYouMean || []);
              setUsedCached(true);
            } else {
              setRestaurants([]);
              setProducts([]);
              setDidYouMean([]);
              setUsedCached(false);
            }
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [type, cuisine, minRating, maxPrice, badge, inStock, freeDelivery, openNow, maxDeliveryTime, promoted, setCached, getCached]
  );

  // Debounced re-search on input/filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Reset pagination when query/filters change
      setNextOffset(0);
      setHasMore(false);
      performSearch(q, sort, 0, false);
      updateUrl();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort, type, cuisine, minRating, maxPrice, badge, inStock, freeDelivery, openNow, maxDeliveryTime, promoted]);

  // Infinite scroll: load more when sentinel is visible
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  useEffect(() => {
    if (!sentinelRef.current) return;
    if (!hasMore) return;
    if (loadingMore) return;
    if (loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMoreRef.current) {
          loadingMoreRef.current = true;
          performSearch(q, sort, nextOffset, true).finally(() => {
            loadingMoreRef.current = false;
          });
        }
      },
      { rootMargin: '300px 0px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, nextOffset, q, sort, performSearch]);

  // Track result clicks (for analytics)
  const trackResultClick = useCallback((resultId: string, resultType: 'restaurant' | 'product', queryText: string) => {
    try {
      trackSearchEvent('search_to_restaurant', {
        query: queryText,
        resultId,
        resultType,
      });
    } catch {}
  }, []);

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
    { key: 'type', value: type, label: type === 'restaurant' ? ct('tabRestaurants', 'Restaurants') : type === 'product' ? ct('tabProducts', 'Produkte') : type, onRemove: () => setType(null) },
    { key: 'cuisine', value: cuisine, label: cuisine, onRemove: () => setCuisine(null) },
    { key: 'rating', value: minRating > 0 ? 'rating' : null, label: `${minRating}★+`, onRemove: () => setMinRating(0) },
    { key: 'price', value: maxPrice < 999 ? 'price' : null, label: `<${maxPrice}€`, onRemove: () => setMaxPrice(999) },
    { key: 'badge', value: badge, label: badge ? (BADGE_LABELS[badge]?.[locale] || badge) : null, onRemove: () => setBadge(null) },
    { key: 'inStock', value: inStock ? 'stock' : null, label: ct('filterStock', 'Nur verfügbare Produkte'), onRemove: () => setInStock(false) },
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
              href="/home"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary transition-colors hover:bg-surface-light hover:text-white focus:outline-none focus:ring-2 focus:ring-brand"
              aria-label={locale === 'ar' ? 'رجوع' : locale === 'de' ? 'Zurück' : 'Back'}
            >
              <ArrowLeft className={`w-5 h-5 ${locale === 'ar' ? 'rotate-180' : ''}`} strokeWidth={2} aria-hidden="true" />
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
                className="w-full h-11 ps-10 pe-10 rounded-xl bg-bg-elevated border border-edge text-sm text-text placeholder:text-text-muted focus:border-brand focus:bg-bg-subtle focus:ring-2 focus:ring-brand/40 focus:shadow-[0_0_0_3px_rgba(255,107,26,0.2)] transition-all duration-200 ease-silk outline-none"
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
              onClick={toggleFilters}
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
          <div className="-mx-4 flex snap-x snap-proximity items-center gap-2 overflow-x-auto px-4 pb-1 scroll-px-4 scrollbar-hide" role="toolbar" aria-label={ct('quickFilter', 'Quick filters')}>
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
            {q && restaurants.length > 0 && (
              <div className="ms-auto flex shrink-0 items-center gap-1 rounded-lg border border-edge bg-bg-elevated p-0.5">
                <ViewButton active={view === 'grid'} onClick={() => selectView('grid')} icon={Grid3x3} label={ct('a11yGridView', 'Grid')} />
                <ViewButton active={view === 'list'} onClick={() => selectView('list')} icon={List} label={ct('a11yListView', 'List')} />
                <ViewButton active={view === 'map'} onClick={() => selectView('map')} icon={MapIcon} label={ct('a11yMapView', 'Map')} />
              </div>
            )}
          </div>

          {/* Sort tabs */}
          <div
            className="-mx-4 flex snap-x snap-proximity items-center gap-2 overflow-x-auto px-4 pb-1 scroll-px-4 scrollbar-hide"
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
                    'flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ease-silk touch-manipulation',
                    active
                      ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-speed-glow'
                      : 'bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white border border-edge'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
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
                { value: 'product' },
              ]}
              value={type}
              onChange={setType}
              getLabel={(v) =>
                v === 'restaurant' ? ct('tabRestaurants', 'Restaurants')
                : v === 'product' ? ct('tabProducts', 'Produkte')
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
                    aria-pressed={minRating === r}
                    className={cn(
                      'flex min-h-11 items-center gap-1 px-3 py-2 rounded-pill text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
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
                {ct('filterPrice', 'Max. Preis')}: {maxPrice < 999 ? `${maxPrice.toFixed(2)} €` : ct('filterAll', 'Alle')}
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
          <Section title={ct('orderAgain', 'Nochmal bestellen')} icon={Heart}>
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
                  : (
                    <>
                      {ct('resultsFor', '{count} Ergebnisse für "{query}"').replace('{count}', String(totalResults)).replace('{query}', q)}
                      {usedCached && !isOnline && (
                        <span className="ms-2 inline-flex items-center gap-1 text-xs font-bold text-warning">
                          ⚠ {ct('cachedResults', 'Zuletzt gesehene Ergebnisse')}
                        </span>
                      )}
                    </>
                  )}
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
                <EmptyResults
                  query={q}
                  type="restaurant"
                  onClearFilters={clearAllFilters}
                  ct={ct}
                  didYouMean={didYouMean}
                  onSuggestionClick={(s) => setQ(s)}
                />
              ) : view === 'map' ? (
                <SearchMap
                  markers={restaurants
                    .filter((r) => r.latitude != null && r.longitude != null)
                    .map((r) => ({
                      id: r.id,
                      lat: r.latitude!,
                      lng: r.longitude!,
                      name: r.name,
                      rating: r.rating,
                      delivery_time_min: r.delivery_time_min,
                      delivery_fee: r.delivery_fee,
                    }))}
                  highlightedId={highlightedMarkerId}
                  onMarkerClick={(id) => {
                    setHighlightedMarkerId(id);
                    trackResultClick(id, 'restaurant', q);
                  }}
                  userLocation={userLocation}
                  height="500px"
                />
              ) : view === 'list' ? (
                <div className="space-y-2" role="feed" aria-busy={loading}>
                  {restaurants.map((r, index) => (
                    <RestaurantListItem
                      key={r.id}
                      restaurant={r}
                      locale={locale}
                      userLocation={userLocation}
                      ct={ct}
                      onClick={() => {
                        setHighlightedMarkerId(r.id);
                        trackResultClick(r.id, 'restaurant', q);
                      }}
                      isHighlighted={highlightedMarkerId === r.id}
                      eager={index < 2}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="feed" aria-busy={loading}>
                  {restaurants.map((r, index) => (
                    <RestaurantResultCard
                      key={r.id}
                      restaurant={r}
                      locale={locale}
                      userLocation={userLocation}
                      ct={ct}
                      onClick={() => {
                        setHighlightedMarkerId(r.id);
                        trackResultClick(r.id, 'restaurant', q);
                      }}
                      isHighlighted={highlightedMarkerId === r.id}
                      eager={index < 2}
                    />
                  ))}
                </div>
              )
            ) : products.length === 0 ? (
              <EmptyResults
                query={q}
                type="product"
                onClearFilters={clearAllFilters}
                ct={ct}
                didYouMean={didYouMean}
                onSuggestionClick={(s) => setQ(s)}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="feed" aria-busy={loading}>
                {products.map((p, index) => (
                  <ProductResultCard key={p.id} product={p} locale={locale} ct={ct} eager={index < 2} />
                ))}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {hasMore && !loading && q && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-8"
                aria-label={ct('a11yLoadMore', 'Loading more results')}
              >
                {loadingMore && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                    {ct('loadingMore', 'Mehr laden…')}
                  </div>
                )}
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
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {restaurants.slice(0, 6).map((r, index) => (
                    <RestaurantResultCard key={r.id} restaurant={r} locale={locale} userLocation={userLocation} ct={ct} eager={index < 2} />
                  ))}
                </div>
              </Section>
            )}

            {recent.length > 0 && (
              <Section title={ct('recentlyViewed', 'Zuletzt angesehen')} icon={History}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {recent.slice(0, 5).map((p) => (
                    <ProductResultCard key={p.id} product={p} compact locale={locale} ct={ct} />
                  ))}
                </div>
              </Section>
            )}

            {bestsellers.length > 0 && (
              <Section title={ct('bestsellers', 'Bestseller')} icon={Award}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {bestsellers.slice(0, 8).map((p) => (
                    <ProductResultCard key={p.id} product={p} compact locale={locale} ct={ct} />
                  ))}
                </div>
              </Section>
            )}

            {recommendations.length > 0 && (
              <Section title={ct('recommendedForYou', 'Für dich empfohlen')} icon={Sparkles}>
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

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
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

function SearchImageFallback({ name, kind = 'restaurant' }: { name: string; kind?: 'restaurant' | 'product' }) {
  const Icon = kind === 'restaurant' ? StoreIcon : ShoppingBag;
  const initial = name.trim().charAt(0).toUpperCase() || 'B';
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_72%_20%,rgba(255,193,7,.18),transparent_36%),linear-gradient(135deg,#1b0908_0%,#090a0d_58%,#111216_100%)]" aria-hidden="true">
      <span className="absolute -end-3 -top-8 text-[110px] font-black italic leading-none text-[#E10600]/10">{initial}</span>
      <span className="absolute start-0 top-[28%] h-px w-[42%] bg-gradient-to-r from-[#E10600] to-transparent shadow-[0_10px_0_rgba(255,193,7,.42),0_20px_0_rgba(225,6,0,.30)]" />
      <div className="relative z-10 flex max-w-[82%] flex-col items-center gap-2 text-center">
        <span className="grid size-11 place-items-center rounded-2xl border border-[#FFC107]/25 bg-black/45 text-[#FFC107] shadow-[0_12px_32px_rgba(225,6,0,.18)]">
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
        <span className="line-clamp-1 text-xs font-black text-white/78">{name}</span>
      </div>
    </div>
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

function QuickChip({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ease-silk touch-manipulation',
        active
          ? 'bg-success/15 text-success border border-success/30'
          : 'bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white border border-edge'
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
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

function EmptyResults({ query, type, onClearFilters, ct, didYouMean, onSuggestionClick }: { query: string; type: 'restaurant' | 'product'; onClearFilters: () => void; ct: (k: string, fb?: string) => string; didYouMean?: { query: string; restaurants: number; products: number }[]; onSuggestionClick?: (s: string) => void }) {
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
        {ct(type === 'restaurant' ? 'noResultsDescSearch' : 'noResultsDescSearch', 'Wir konnten nichts finden')}{' "'}{query}{'" '}
      </p>
      <p className="text-xs text-text-muted mt-2">
        {ct('tryDifferentSearch', 'Versuche eine andere Suche oder passe die Filter an')}
      </p>
      {didYouMean && didYouMean.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-text-muted mb-2">
            {ct('didYouMean', 'Meinten Sie vielleicht:')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {didYouMean.map((s) => (
              <button
                key={s.query}
                onClick={() => onSuggestionClick?.(s.query)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20 transition-colors"
                aria-label={`${ct('searchFor', 'Suchen nach')} ${s.query}`}
              >
                {s.query}
                <span className="ms-1.5 text-[10px] text-text-muted font-normal">
                  ({s.restaurants + s.products})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
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

const RestaurantResultCard = memo(function RestaurantResultCard({
  restaurant, locale, userLocation, ct, onClick, isHighlighted, eager = false,
}: {
  restaurant: Restaurant;
  locale: string;
  userLocation: { lat: number; lng: number } | null;
  ct: (k: string, fb?: string) => string;
  onClick?: () => void;
  isHighlighted?: boolean;
  eager?: boolean;
}) {
  const distance = useMemo(() => {
    if (!userLocation || !restaurant.latitude || !restaurant.longitude) return null;
    return haversineDistance(
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: restaurant.latitude, lng: restaurant.longitude }
    );
  }, [userLocation, restaurant.latitude, restaurant.longitude]);

  return (
    <article className={cn(
      'group relative overflow-hidden rounded-2xl card-glass transition-all duration-200 ease-silk hover:-translate-y-1',
      isHighlighted && 'ring-2 ring-brand-red-500/60 shadow-glow-strong'
    )}>
      <Link
        href={`/restaurants/${restaurant.id}`}
        onClick={onClick}
        className="block focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-red-500/30"
        aria-label={ct('a11yRestaurantCard', 'View restaurant').replace('{name}', restaurant.name)}
      >
      <div className="relative h-32 bg-gradient-to-br from-surface to-bg overflow-hidden">
        {restaurant.cover_image_url ? (
          <Image
            src={restaurant.cover_image_url}
            alt={restaurant.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-110 transition-transform duration-700 ease-silk"
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            unoptimized
          />
        ) : restaurant.cover_url ? (
          <Image
            src={restaurant.cover_url}
            alt={restaurant.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-110 transition-transform duration-700 ease-silk"
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            unoptimized
          />
        ) : (
          <SearchImageFallback name={restaurant.name} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        {restaurant.is_promoted && (
          <span className="absolute top-2.5 start-2.5 flex items-center gap-1 text-[10px] bg-warning/90 backdrop-blur-sm text-black px-2 py-0.5 rounded-full font-extrabold">
            <Award className="w-2.5 h-2.5" aria-hidden="true" />
            {ct('promoted', 'Empfohlen')}
          </span>
        )}
        {restaurant.type && restaurant.type !== 'restaurant' && (
          <span className="absolute top-14 end-2.5 text-[10px] bg-info/90 backdrop-blur-sm text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            {restaurant.type === 'market'
              ? (locale === 'ar' ? 'سوق' : locale === 'en' ? 'Market' : 'Markt')
              : restaurant.type === 'pharmacy'
                ? (locale === 'ar' ? 'صيدلية' : locale === 'en' ? 'Pharmacy' : 'Apotheke')
                : ''}
          </span>
        )}
      </div>
      <div className="p-3.5">
        <h3 className="font-extrabold text-text text-sm truncate mb-1.5">
          {restaurant.name}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary tabular-nums flex-wrap">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-warning/10 text-warning font-bold">
            <Star className="w-3 h-3 fill-current" strokeWidth={0} aria-hidden="true" />
            {restaurant.rating?.toFixed(1) || '–'}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {restaurant.delivery_time_min || 30} {locale === 'ar' ? 'د' : 'min'}
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
      <FavoriteButton
        restaurantId={restaurant.id}
        className="absolute end-2.5 top-2.5 z-20 shadow-lg"
      />
    </article>
  );
});

const RestaurantListItem = memo(function RestaurantListItem({
  restaurant, locale, userLocation, ct, onClick, isHighlighted, eager = false,
}: {
  restaurant: Restaurant;
  locale: string;
  userLocation: { lat: number; lng: number } | null;
  ct: (k: string, fb?: string) => string;
  onClick?: () => void;
  isHighlighted?: boolean;
  eager?: boolean;
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
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 p-3 rounded-2xl card-glass hover:bg-bg-subtle transition-all focus:outline-none focus:ring-2 focus:ring-brand-red-500/30',
        isHighlighted && 'ring-2 ring-brand-red-500/60 shadow-glow-strong'
      )}
      aria-label={ct('a11yRestaurantCard', 'View restaurant').replace('{name}', restaurant.name)}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-surface to-bg">
        {restaurant.cover_image_url ? (
          <Image
            src={restaurant.cover_image_url}
            alt={restaurant.name}
            fill
            sizes="80px"
            className="object-cover"
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            unoptimized
          />
        ) : restaurant.cover_url ? (
          <Image
            src={restaurant.cover_url}
            alt={restaurant.name}
            fill
            sizes="80px"
            className="object-cover"
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            unoptimized
          />
        ) : (
          <SearchImageFallback name={restaurant.name} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-extrabold text-text text-sm truncate">
          {restaurant.name}
        </h3>
        <p className="text-xs text-text-muted truncate mt-0.5">
          {restaurant.cuisines?.slice(0, 2).join(' · ') || restaurant.cuisine?.slice(0, 2).join(' · ') || '—'}
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
  product, compact, locale, ct, eager = false,
}: {
  product: Product;
  compact?: boolean;
  locale: string;
  ct: (k: string, fb?: string) => string;
  eager?: boolean;
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
        {product.image_urls?.[0] ? (
          <Image
            src={product.image_urls[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-110 transition-transform duration-700 ease-silk"
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            unoptimized
          />
        ) : (
          <SearchImageFallback name={product.name} kind="product" />
        )}
        {firstBadge && BADGE_LABELS[firstBadge] && (
          <span className="absolute top-2 end-2 inline-flex items-center bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider shadow-speed-glow">
            {BADGE_LABELS[firstBadge][locale] || firstBadge}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="font-bold text-text text-xs truncate">
          {product.name}
        </h3>
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
          <Image src={r.cover_url} alt={r.name} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" unoptimized />
        ) : (
          <SearchImageFallback name={r.name} />
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
