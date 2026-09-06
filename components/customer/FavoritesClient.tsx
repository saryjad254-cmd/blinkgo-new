'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import { RestaurantCard } from '@/components/customer/RestaurantCard';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { Restaurant } from '@/lib/types';

type FavoriteRow = {
  restaurant_id?: string;
  restaurants?: Restaurant | Restaurant[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeRestaurant(value: unknown): Restaurant | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.is_active === false) return null;
  return {
    ...value,
    cover_url: value.cover_url || value.cover_image_url || null,
    cuisine: Array.isArray(value.cuisine) ? value.cuisine : Array.isArray(value.cuisines) ? value.cuisines : [],
    rating: Number(value.rating || 0),
    review_count: Number(value.review_count ?? value.total_reviews ?? 0),
    delivery_fee: Number(value.delivery_fee || 0),
    min_order_amount: Number(value.min_order_amount ?? value.minimum_order ?? 0),
    estimated_delivery_time: String(value.estimated_delivery_time || (value.delivery_time_min ? `${value.delivery_time_min} min` : '25–35 min')),
    latitude: Number(value.latitude ?? value.lat ?? 0),
    longitude: Number(value.longitude ?? value.lng ?? 0),
  } as Restaurant;
}

export function FavoritesClient() {
  const { locale, t } = useI18n();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const copy = locale === 'ar'
    ? { title: 'المفضلة', countOne: 'مطعم', countMany: 'مطاعم', empty: 'لا توجد لديك مفضلة', emptyDescription: 'احفظ مطاعمك المفضلة لتجدها بسهولة هنا.', browse: 'تصفح المطاعم', failed: 'تعذّر تحميل المفضلة.', retry: 'إعادة المحاولة' }
    : locale === 'en'
      ? { title: 'Favorites', countOne: 'restaurant', countMany: 'restaurants', empty: 'No favorites yet', emptyDescription: 'Save restaurants you love and find them quickly here.', browse: 'Browse restaurants', failed: 'We could not load your favorites.', retry: 'Try again' }
      : { title: 'Favoriten', countOne: 'Restaurant', countMany: 'Restaurants', empty: 'Noch keine Favoriten', emptyDescription: 'Speichere deine Lieblingsrestaurants und finde sie hier schnell wieder.', browse: 'Restaurants entdecken', failed: 'Favoriten konnten nicht geladen werden.', retry: 'Erneut versuchen' };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/favorites', { cache: 'no-store' });
      if (!response.ok) throw new Error('favorites request failed');
      const payload = await response.json();
      const rows: FavoriteRow[] = payload?.data?.favorites ?? payload?.favorites ?? [];
      const resolved = await Promise.all(rows.map(async (row) => {
        const nested = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
        let restaurant: unknown = nested || null;
        if (!restaurant && row.restaurant_id) {
          const detailResponse = await fetch(`/api/restaurants/${row.restaurant_id}`, { cache: 'no-store' });
          if (detailResponse.ok) {
            const detail = await detailResponse.json();
            restaurant = isRecord(detail) ? detail.restaurant : null;
          }
        }
        if (!restaurant) return null;
        if (isRecord(restaurant) && typeof restaurant.name === 'string') {
          const searchResponse = await fetch(`/api/search?type=restaurant&limit=5&q=${encodeURIComponent(restaurant.name)}`, { cache: 'no-store' });
          if (searchResponse.ok) {
            const searchPayload = await searchResponse.json();
            const candidates = isRecord(searchPayload) && Array.isArray(searchPayload.restaurants)
              ? searchPayload.restaurants
              : [];
            const restaurantId = row.restaurant_id || restaurant.id;
            const richer = candidates.find((candidate) => isRecord(candidate) && candidate.id === restaurantId);
            if (isRecord(richer)) restaurant = { ...restaurant, ...richer };
          }
        }
        return normalizeRestaurant(restaurant);
      }));

      const unique = new Map<string, Restaurant>();
      resolved.forEach((restaurant) => {
        if (restaurant) unique.set(restaurant.id, restaurant);
      });
      setRestaurants([...unique.values()]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load]);

  const subtitle = restaurants.length > 0
    ? `${restaurants.length} ${restaurants.length === 1 ? copy.countOne : copy.countMany}`
    : undefined;

  return (
    <>
      <PageHeader title={copy.title || t.customer.favorites} subtitle={subtitle} back backHref="/home" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy="true" aria-label={copy.title}>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-72 animate-pulse rounded-md border border-edge-light bg-bg-card" />
            ))}
          </div>
        ) : error ? (
          <section className="rounded-3xl border border-danger/25 bg-danger/5 p-6 text-center" role="alert">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-danger" aria-hidden="true" />
            <p className="font-bold text-text">{copy.failed}</p>
            <button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-speed-gradient px-5 py-2.5 font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {copy.retry}
            </button>
          </section>
        ) : restaurants.length === 0 ? (
          <EmptyState
            iconName="Heart"
            title={copy.empty}
            description={copy.emptyDescription}
            action={(
              <Link href="/restaurants" className="inline-flex min-h-11 items-center rounded-2xl bg-speed-gradient px-5 py-2.5 text-sm font-extrabold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                {copy.browse}
              </Link>
            )}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {restaurants.map((restaurant, index) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                index={index}
                initialFavorited
                onFavoriteChange={(favorited) => {
                  if (!favorited) setRestaurants((current) => current.filter((item) => item.id !== restaurant.id));
                }}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
