'use client';
import { memo } from 'react';
import Link from 'next/link';
import Star from 'lucide-react/dist/esm/icons/star';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Truck from 'lucide-react/dist/esm/icons/truck';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import type { Restaurant } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { FavoriteButton } from '@/components/customer/FavoriteButton';
import { CatalogImage } from '@/components/customer/CatalogImage';

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
  initialFavorited = false,
  onFavoriteChange,
}: {
  restaurant: Restaurant;
  index?: number;
  initialFavorited?: boolean;
  onFavoriteChange?: (favorited: boolean) => void;
}) {
  const { locale } = useI18n();
  const reviewCount = Number(restaurant.review_count || 0);
  const rating = Number(restaurant.rating || 0);
  const hasVerifiedRating = reviewCount > 0 && rating > 0;
  const description = locale === 'ar' && restaurant.description && !/[\u0600-\u06FF]/.test(restaurant.description)
    ? null
    : restaurant.description;
  const localizeCuisine = (value: string) => {
    if (locale !== 'ar') return value;
    return value
      .replace(/Burgers?/gi, 'برغر').replace(/American/gi, 'أمريكي')
      .replace(/Amerikanisch/gi, 'أمريكي')
      .replace(/Pizza/gi, 'بيتزا').replace(/Italian/gi, 'إيطالي')
      .replace(/Sushi/gi, 'سوشي').replace(/Japanese|Japanisch/gi, 'ياباني')
      .replace(/Caf[eé]/gi, 'مقهى').replace(/Breakfast/gi, 'فطور')
      .replace(/Pasta/gi, 'باستا').replace(/Desserts?/gi, 'حلويات');
  };
  const deliveryTime = locale === 'ar'
    ? restaurant.estimated_delivery_time.replace(/min\.?/gi, 'دقيقة')
    : restaurant.estimated_delivery_time;
  const featuredLabel = locale === 'ar' ? 'مميّز' : locale === 'de' ? 'Empfohlen' : 'Featured';

  return (
    <article className="group relative overflow-hidden rounded-[22px] border border-edge-light bg-bg-card shadow-speed-md backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-brand-red-500/40 hover:shadow-speed-xl">
      <Link
        href={`/restaurants/${restaurant.id}`}
        prefetch={true}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
      {/* Cover */}
      <div className="relative h-40 sm:h-48 bg-gradient-to-br from-surface to-bg overflow-hidden">
        <CatalogImage
          src={restaurant.cover_url}
          alt={restaurant.name}
          name={restaurant.name}
          kind="restaurant"
          index={index}
          priority={index < 2}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="group-hover:scale-[1.045]"
        />

        {/* Overlay gradient */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

        {/* Featured badge */}
        {restaurant.is_featured && (
          <span className="absolute bottom-3 start-3 inline-flex items-center gap-1 bg-speed-gradient text-white text-[10px] px-2.5 py-1 rounded-pill font-bold shadow-speed-glow">
            <Sparkles className="w-3 h-3" />
            {featuredLabel}
          </span>
        )}

        {/* Rating badge — top left */}
        <span className="absolute top-3 start-3 inline-flex items-center gap-1 bg-bg-card/95 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-pill font-bold border border-edge-light">
          <Star className="w-3 h-3 fill-accent text-accent" />
          {hasVerifiedRating ? rating.toFixed(1) : (locale === 'ar' ? 'جديد' : locale === 'de' ? 'Neu' : 'New')}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-white text-base truncate flex-1 group-hover:text-brand-red-500 transition-colors">
            {restaurant.name}
          </h3>
        </div>

        {description && (
          <p className="text-xs text-text-muted line-clamp-2 mb-3 leading-relaxed">
            {description}
          </p>
        )}

        {restaurant.cuisine && restaurant.cuisine.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {Array.from(new Set((restaurant.cuisine ?? []).map(localizeCuisine))).slice(0, 3).map((c) => (
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
            <span>{deliveryTime}</span>
          </div>
          <div className="flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 text-success" />
            <span>{restaurant.delivery_fee === 0 ? (locale === 'ar' ? 'مجاني' : locale === 'de' ? 'Kostenlos' : 'Free') : formatEUR(restaurant.delivery_fee)}</span>
          </div>
          <div className="text-text-muted">
            {reviewCount > 0
              ? `${reviewCount.toLocaleString(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US')} ${locale === 'ar' ? 'تقييم' : locale === 'de' ? 'Bewertungen' : 'reviews'}`
              : (locale === 'ar' ? 'لا تقييمات بعد' : locale === 'de' ? 'Noch keine Bewertungen' : 'No reviews yet')}
          </div>
        </div>
      </div>
      </Link>
      <FavoriteButton
        restaurantId={restaurant.id}
        initialFavorited={initialFavorited}
        onChange={onFavoriteChange}
        className="absolute end-3 top-3 z-20 shadow-lg"
      />
    </article>
  );
});
