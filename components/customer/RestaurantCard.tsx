'use client';
import { memo } from 'react';
import Link from 'next/link';
import { Star, Clock, Truck, ChefHat, Sparkles, Heart } from 'lucide-react';
import type { Restaurant } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { FavoriteButton } from '@/components/customer/FavoriteButton';
import { restaurantCoverUrl, hideOnError } from '@/lib/images';

/**
 * RestaurantCard — بطاقة مطعم بتصميم Speed Theme:
 * - glass dark card
 * - cover with gradient fallback
 * - featured badge with speed gradient
 * - hover-lift with glow
 */
export const RestaurantCard = memo(function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const { locale } = useI18n();
  return (
    <Link
      href={`/restaurants/${restaurant.id}`}
      prefetch={true}
      className="group block rounded-md overflow-hidden bg-bg-card backdrop-blur-xl border border-edge-light hover:border-brand-red-500/40 shadow-speed-md hover:shadow-speed-xl hover:-translate-y-1 transition-all duration-300"
    >
      {/* Cover */}
      <div className="relative h-40 sm:h-48 bg-gradient-to-br from-surface to-bg overflow-hidden">
        {restaurantCoverUrl(restaurant) ? (
          <img
            src={restaurantCoverUrl(restaurant)!}
            onError={hideOnError}
            alt={restaurant.name}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-red-500/10 to-danger/10" />
            <ChefHat className="w-16 h-16 text-brand-red-500/30 relative" />
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

        {/* Favorite button */}
        <FavoriteButton restaurantId={restaurant.id} />

        {/* Featured badge */}
        {restaurant.is_featured && (
          <span className="absolute top-3 end-3 inline-flex items-center gap-1 bg-speed-gradient text-white text-[10px] px-2.5 py-1 rounded-pill font-bold shadow-speed-glow">
            <Sparkles className="w-3 h-3" />
            مميز
          </span>
        )}

        {/* Rating badge — top left */}
        <span className="absolute top-3 start-3 inline-flex items-center gap-1 bg-bg-card/95 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-pill font-bold border border-edge-light">
          <Star className="w-3 h-3 fill-accent text-accent" />
          {Number(restaurant.rating || 0).toFixed(1)}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-white text-base truncate flex-1 min-w-0 group-hover:text-brand-red-500 transition-colors">
            {restaurant.name}
          </h3>
        </div>

        {restaurant.description && (
          <p className="text-xs text-text-muted line-clamp-2 mb-3 leading-relaxed">
            {restaurant.description}
          </p>
        )}

        {restaurant.cuisine && restaurant.cuisine.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {(restaurant.cuisine ?? []).slice(0, 3).map((c) => (
              <span
                key={c}
                className="text-[10px] bg-surface-elevated text-text-secondary px-2 py-0.5 rounded-pill border border-edge-light font-semibold"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-text-muted pt-3 border-t border-edge-light">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-info" />
            <span>{restaurant.estimated_delivery_time}</span>
          </div>
          <div className="flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 text-success" />
            <span>{formatEUR(restaurant.delivery_fee)}</span>
          </div>
          <div className="text-text-muted">
            {restaurant.review_count || 0} {(locale === 'ar' ? 'تقييم' : locale === 'de' ? 'Bewertungen' : 'Reviews')}
          </div>
        </div>
      </div>
    </Link>
  );});
