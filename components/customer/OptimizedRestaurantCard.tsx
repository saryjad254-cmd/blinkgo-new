/**
 * OptimizedRestaurantCard
 * ───────────────────────
 * Heavy-optimized restaurant card with:
 *  - React.memo (prevents re-render on parent state changes)
 *  - Lazy image loading (IntersectionObserver)
 *  - useMemo for derived data (distance, etc.)
 *  - Skeleton fallback
 *  - Touch-optimized (44px target)
 *  - Accessible (aria-label, focus visible)
 */
'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, Clock, Truck, Heart, BadgeCheck } from 'lucide-react';
import { formatEUR } from '@/lib/format';
import { haversineDistance, formatDistance } from '@/lib/maps/distance';
import { cn } from '@/lib/cn';
import { FavoriteButton } from './FavoriteButton';
import { LazyImage } from './LazyImage';
import { restaurantCoverUrl, hideOnError } from '@/lib/images';

export interface RestaurantCardData {
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

interface Props {
  restaurant: RestaurantCardData;
  userLocation?: { lat: number; lng: number } | null;
  view?: 'grid' | 'list';
  locale?: 'de' | 'ar' | 'en';
  t?: Record<string, string>;
}

function RestaurantCardInner({ restaurant: r, userLocation, view = 'grid', t = {} }: Props) {
  // Memoize derived data — recalc only when restaurant or location changes
  const distance = useMemo(() => {
    if (!userLocation || !r.latitude || !r.longitude) return null;
    return haversineDistance(
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: r.latitude, lng: r.longitude }
    );
  }, [userLocation?.lat, userLocation?.lng, r.latitude, r.longitude]);

  const distanceLabel = useMemo(() => {
    if (!distance) return null;
    return formatDistance(distance);
  }, [distance]);

  if (view === 'list') {
    return (
      <Link
        href={`/restaurants/${r.id}`}
        className="flex gap-3 p-3 bg-bg-elevated rounded-2xl hover:bg-bg-secondary transition touch-manipulation min-h-[88px]"
        aria-label={`${r.name} — ${t.view || 'View'}`}
      >
        <div className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden">
          <LazyImage
            src={restaurantCoverUrl(r) || r.cover_url}
          onError={hideOnError as any}
            alt={r.name}
            fill
            className="object-cover"
            sizes="80px"
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-text-primary truncate">{r.name}</h3>
              {r.is_featured && (
                <BadgeCheck className="w-4 h-4 text-success flex-shrink-0" aria-label="Verified" />
              )}
            </div>
            <p className="text-xs text-text-muted truncate">
              {(r.cuisine || []).slice(0, 3).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="flex items-center gap-0.5">
              <Star className="w-3.5 h-3.5 fill-brand-yellow-400 text-brand-yellow-400" />
              {r.rating.toFixed(1)}
            </span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-3.5 h-3.5" />
              {r.estimated_delivery_time} {t.min || 'min'}
            </span>
            <span className="flex items-center gap-0.5">
              <Truck className="w-3.5 h-3.5" />
              {r.delivery_fee === 0 ? (t.free || 'Free') : formatEUR(r.delivery_fee)}
            </span>
          </div>
        </div>
        <FavoriteButton restaurantId={r.id} className="self-start" />
      </Link>
    );
  }

  return (
    <Link
      href={`/restaurants/${r.id}`}
      className={cn(
        'group relative bg-bg-elevated rounded-2xl overflow-hidden hover:shadow-lg transition-all',
        'active:scale-[0.98] touch-manipulation',
        'min-h-[220px]'
      )}
      aria-label={`${r.name} — ${t.view || 'View'}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-bg-secondary">
        <LazyImage
          src={restaurantCoverUrl(r) || r.cover_url}
          onError={hideOnError as any}
          alt={r.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        {r.is_promoted && (
          <span className="absolute top-2 start-2 px-2 py-0.5 bg-brand-gradient text-white text-xs font-semibold rounded-full">
            {t.promoted || 'Promoted'}
          </span>
        )}
        <div className="absolute top-2 end-2">
          <FavoriteButton restaurantId={r.id} />
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <h3 className="font-semibold text-text-primary truncate flex-1 min-w-0">{r.name}</h3>
          {r.is_featured && (
            <BadgeCheck className="w-4 h-4 text-success flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-text-muted truncate">
          {(r.cuisine || []).slice(0, 3).join(' · ')}
        </p>
        <div className="flex items-center gap-2 text-xs text-text-secondary pt-1">
          <span className="flex items-center gap-0.5 font-medium">
            <Star className="w-3.5 h-3.5 fill-brand-yellow-400 text-brand-yellow-400" />
            {r.rating.toFixed(1)}
            <span className="text-text-muted">({r.review_count})</span>
          </span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3.5 h-3.5" />
            {r.estimated_delivery_time} {t.min || 'min'}
          </span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <Truck className="w-3.5 h-3.5" />
            {r.delivery_fee === 0 ? (t.free || 'Free') : formatEUR(r.delivery_fee)}
          </span>
          {distanceLabel && (
            <>
              <span>·</span>
              <span className="text-text-muted">{distanceLabel}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

// Wrap in React.memo with custom equality check on key fields
export const OptimizedRestaurantCard = memo(RestaurantCardInner, (prev, next) => {
  // Re-render only if these fields change (prevents card-level re-render on filter change)
  const pr = prev.restaurant;
  const nr = next.restaurant;
  if (pr.id !== nr.id) return false;
  if (pr.rating !== nr.rating) return false;
  if (pr.delivery_fee !== nr.delivery_fee) return false;
  if (pr.is_promoted !== nr.is_promoted) return false;
  if (pr.is_featured !== nr.is_featured) return false;
  if (pr.cover_url !== nr.cover_url) return false;
  // User location might change
  if (prev.userLocation?.lat !== next.userLocation?.lat) return false;
  if (prev.userLocation?.lng !== next.userLocation?.lng) return false;
  if (prev.view !== next.view) return false;
  return true;
});
