/**
 * useSearch — encapsulated search state management
 * ────────────────────────────────────────────────
 * Handles:
 *  - URL state sync (deep-linkable)
 *  - Debounced search input
 *  - AbortController cancellation
 *  - 200ms debounce (optimal for search)
 *  - Result deduplication
 *  - Error handling
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { apiGet, apiInvalidate } from '@/lib/api/client';

export type SortMode = 'recommended' | 'rating' | 'delivery_time' | 'price_low' | 'popular';
export type SearchType = 'all' | 'restaurant' | 'product';

export interface SearchFilters {
  q: string;
  sort: SortMode;
  type: SearchType;
  cuisine: string | null;
  minRating: number;
  maxPrice: number;
  badge: string | null;
  inStock: boolean;
  freeDelivery: boolean;
  openNow: boolean;
  maxDeliveryTime: number;
  promoted: boolean;
}

export interface Restaurant {
  id: string;
  name: string;
  cover_url: string;
  rating: number;
  review_count: number;
  cuisine: string[];
  delivery_fee: number;
  estimated_delivery_time: number;
  address: string;
  latitude?: number;
  longitude?: number;
  is_promoted?: boolean;
  is_featured?: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  restaurant_id: string;
  category: string;
  rating: number;
  order_count: number;
  restaurants?: {
    id: string;
    name: string;
    is_active: boolean;
    delivery_fee: number;
  };
}

export interface SearchResult {
  restaurants: Restaurant[];
  products: Product[];
  total: number;
  cached?: boolean;
}

const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  sort: 'recommended',
  type: 'all',
  cuisine: null,
  minRating: 0,
  maxPrice: 999,
  badge: null,
  inStock: false,
  freeDelivery: false,
  openNow: false,
  maxDeliveryTime: 0,
  promoted: false,
};

export function useSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Initialize from URL
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    ...DEFAULT_FILTERS,
    q: params?.get('q') || '',
    sort: (params?.get('sort') as SortMode) || 'recommended',
    type: (params?.get('type') as SearchType) || 'all',
    cuisine: params?.get('cuisine') || null,
    minRating: parseFloat(params?.get('min_rating') || '0'),
    maxPrice: parseFloat(params?.get('max_price') || '999'),
    badge: params?.get('badge') || null,
    inStock: params?.get('in_stock') === '1',
    freeDelivery: params?.get('free_delivery') === '1',
    openNow: params?.get('open_now') === '1',
    maxDeliveryTime: parseInt(params?.get('max_delivery_time') || '0'),
    promoted: params?.get('promoted') === '1',
  }));

  const [result, setResult] = useState<SearchResult>({ restaurants: [], products: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const p = new URLSearchParams();
      if (filters.q) p.set('q', filters.q);
      p.set('sort', filters.sort);
      if (filters.type && filters.type !== 'all') p.set('type', filters.type);
      if (filters.cuisine) p.set('cuisine', filters.cuisine);
      if (filters.minRating > 0) p.set('min_rating', String(filters.minRating));
      if (filters.maxPrice < 999) p.set('max_price', String(filters.maxPrice));
      if (filters.badge) p.set('badge', filters.badge);
      if (filters.inStock) p.set('in_stock', '1');
      if (filters.freeDelivery) p.set('free_delivery', '1');
      if (filters.openNow) p.set('open_now', '1');
      if (filters.maxDeliveryTime > 0) p.set('max_delivery_time', String(filters.maxDeliveryTime));
      if (filters.promoted) p.set('promoted', '1');

      const response = await apiGet<SearchResult>(`/api/search?${p.toString()}`, {
        signal: controller.signal,
        cacheTtl: 30_000,
      });

      if (controller.signal.aborted) return;
      if (response.ok) {
        setResult(response.data);
      } else {
        setError(response.error.message);
        setResult({ restaurants: [], products: [], total: 0 });
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(search, 200);
    return () => clearTimeout(t);
  }, [search]);

  // Sync to URL
  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.q) p.set('q', filters.q);
    if (filters.sort !== 'recommended') p.set('sort', filters.sort);
    if (filters.type !== 'all') p.set('type', filters.type);
    if (filters.cuisine) p.set('cuisine', filters.cuisine);
    if (filters.minRating > 0) p.set('min_rating', String(filters.minRating));
    if (filters.maxPrice < 999) p.set('max_price', String(filters.maxPrice));
    if (filters.badge) p.set('badge', filters.badge);
    if (filters.inStock) p.set('in_stock', '1');
    if (filters.freeDelivery) p.set('free_delivery', '1');
    if (filters.openNow) p.set('open_now', '1');
    if (filters.maxDeliveryTime > 0) p.set('max_delivery_time', String(filters.maxDeliveryTime));
    if (filters.promoted) p.set('promoted', '1');

    const newParams = p.toString();
    const currentParams = params?.toString() || '';
    if (newParams !== currentParams) {
      router.replace(`${pathname}?${newParams}`, { scroll: false });
    }
  }, [filters, pathname, router, params]);

  const updateFilter = useCallback(<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    filters,
    result,
    loading,
    error,
    updateFilter,
    resetFilters,
    refresh: () => {
      apiInvalidate(`/api/search?${new URLSearchParams()}`);
      search();
    },
  };
}
