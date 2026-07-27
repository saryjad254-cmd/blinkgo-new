'use client';
import { memo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Star from 'lucide-react/dist/esm/icons/star';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Truck from 'lucide-react/dist/esm/icons/truck';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import Heart from 'lucide-react/dist/esm/icons/heart';
import type { Restaurant } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { FavoriteButton } from '@/components/customer/FavoriteButton';
import { cn } from '@/lib/cn';

// v85: Premium fallback gradient palettes (rotated by index for variety)
const FALLBACK_PALETTES = [
  'from-brand-red-500 via-brand-red-400 to-brand-yellow-400',
  'from-brand-yellow-500 via-brand-yellow-400 to-brand-red-400',
  'from-brand-black via-brand-red-900 to-brand-yellow-500',
  'from-brand-red-700 via-brand-red-500 to-orange-400',
  'from-amber-500 via-orange-500 to-red-500',
  'from-rose-500 via-pink-500 to-orange-400',
];

// 1x1 transparent blur placeholder (prevents CLS while image loads)
const BLUR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * RestaurantCard — premium card with real images and a beautiful fallback
 * for restaurants without a cover image.
 *
 * v85 fixes:
 *  - Real fallback: gradient + first letter of name (not just an icon)
 *  - onError handling: if the image fails to load, show the fallback
 *  - blurDataURL for smooth loading
 *  - proper aspect ratio
 */
export const RestaurantCard = memo(function RestaurantCard({
  restaurant,
  index = 0,
}: {
  restaurant: Restaurant;
  index?: number;
}) {
  const { locale } = useI18n();
  const [imgError, setImgError] = useState(false);
  const showImage = !!restaurant.cover_url && !imgError;

  const palette = FALLBACK_PALETTES[index % FALLBACK_PALETTES.length];
  const initial = (restaurant.name || '?').trim().charAt(0).toUpperCase();

  return (
    <Link
      href={`/restaurants/${restaurant.id}`}
      prefetch={true}
      className="group block rounded-md overflow-hidden bg-bg-card backdrop-blur-xl border border-edge-light hover:border-brand-red-500/40 shadow-speed-md hover:shadow-speed-xl hover:-translate-y-1 transition-all duration-300"
    >
      {/* Cover */}
      <div className="relative h-40 sm:h-48 bg-gradient-to-br from-surface to-bg overflow-hidden">
        {showImage ? (
          <Image
            src={restaurant.cover_url!}
            alt={restaurant.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            onError={() => setImgError(true)}
            unoptimized={restaurant.cover_url!.includes('supabase.co/storage')}
          />
        ) : (
          // v85: Premium fallback — gradient + first letter of restaurant name
          <div
            className={cn(
              'w-full h-full flex items-center justify-center relative',
              'bg-gradient-to-br',
              palette,
            )}
            aria-label={restaurant.name}
          >
            {/* Subtle pattern overlay for premium feel */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(0,0,0,0.15),transparent_60%)]" />
            <span className="relative text-6xl sm:text-7xl font-black text-white/95 drop-shadow-lg select-none">
              {initial}
            </span>
            <ChefHat
              className="absolute bottom-3 end-3 w-5 h-5 text-white/40"
              aria-hidden
            />
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

        {/* Favorite button */}
        <FavoriteButton restaurantId={restaurant.id} />

        {/* Featured badge */}
        {restaurant.is_featured && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 bg-speed-gradient text-white text-[10px] px-2.5 py-1 rounded-pill font-bold shadow-speed-glow">
            <Sparkles className="w-3 h-3" />
            مميز
          </span>
        )}

        {/* Rating badge — top left */}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 bg-bg-card/95 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-pill font-bold border border-edge-light">
          <Star className="w-3 h-3 fill-accent text-accent" />
          {Number(restaurant.rating || 0).toFixed(1)}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-white text-base truncate flex-1 group-hover:text-brand-red-500 transition-colors">
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
            {restaurant.review_count || 0} {(locale === 'ar' ? 'تقييم' : 'Bewertungen')}
          </div>
        </div>
      </div>
    </Link>
  );
});
