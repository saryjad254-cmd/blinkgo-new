'use client';

/**
 * HomeClient — EXACT VISUAL (v4)
 *
 * Customer home matching the 4 reference images exactly:
 * - AppHeader with rich rider logo + wordmark
 * - Search bar with filter icon
 * - HeroBanner (5-slide carousel with full rider illustration)
 * - 5 categories (Burger/Pizza/Sushi/Pharmacy/Market) with hand-drawn SVG icons
 * - "Popular near you" restaurant grid (3-up on mobile)
 * - LiveOrderCard with 4-stage progress (when order is in progress)
 * - SideDrawer (opens from hamburger)
 * - BottomNavigation (5 tabs)
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Search from 'lucide-react/dist/esm/icons/search.js';
import SlidersHorizontal from 'lucide-react/dist/esm/icons/sliders-horizontal.js';
import Star from 'lucide-react/dist/esm/icons/star.js';
import { useI18n, useT } from '@/lib/i18n/I18nProvider';
import { AppHeader } from '@/components/customer/AppHeader';
import { SideDrawer } from '@/components/customer/SideDrawer';
import { BottomNavigation } from '@/components/customer/BottomNavigation';
import { HeroBanner, type HeroSlide } from '@/components/customer/HeroBanner';
import { ActiveOrderCard, type OrderStage } from '@/components/customer/ActiveOrderCard';
import { CategoryIcon, type CategoryType } from '@/components/brand/CategoryIcon';
import { CatalogImage } from '@/components/customer/CatalogImage';
import { FavoriteButton } from '@/components/customer/FavoriteButton';
import { CustomerMarketplaceNav } from '@/components/customer/CustomerMarketplaceNav';
import { useToast } from '@/components/ui/Toast';

interface HomeClientProps {
  initialUser?: {
    id: string;
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
  unreadCount?: number;
  deliveryLocation?: string | null;
  popularRestaurants?: PopularRestaurant[];
  activeOrder?: ActiveOrderData | null;
}

export interface PopularRestaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviews: string;
  eta: string;
  priceTier: string;
  minOrder: string;
  imageUrl: string;
  href: string;
  isFavorite: boolean;
}

export interface ActiveOrderData {
  id: string;
  restaurantName: string;
  status: string;
  etaMinutes: number;
  stage: OrderStage;
  imageUrl?: string;
  href: string;
}

const CATEGORIES: { type: CategoryType; key: string; href: string }[] = [
  { type: 'burger',   key: 'burger',   href: '/search?category=burger' },
  { type: 'pizza',    key: 'pizza',    href: '/search?category=pizza' },
  { type: 'sushi',    key: 'sushi',    href: '/search?category=sushi' },
  { type: 'pharmacy', key: 'pharmacy', href: '/market?category=pharmacy' },
  { type: 'market',   key: 'market',   href: '/market' },
];

export function HomeClient({ initialUser, unreadCount = 0, deliveryLocation = null, popularRestaurants = [], activeOrder = null }: HomeClientProps) {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCtaClick = (slide: HeroSlide) => {
    const destinations: Record<string, string> = {
      'live-now': '/restaurants',
      new: '/restaurants',
      explore: '/restaurants',
      availability: '/search?open_now=1',
      groceries: '/market',
    };
    router.push(destinations[slide.id] ?? '/search');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/search');
    }
  };

  const categoryLabel = (key: string): string => {
    const map: Record<string, { en: string; de: string; ar: string }> = {
      burger:   { en: 'Burger',   de: 'Burger',   ar: 'برجر' },
      pizza:    { en: 'Pizza',    de: 'Pizza',    ar: 'بيتزا' },
      sushi:    { en: 'Sushi',    de: 'Sushi',    ar: 'سوشي' },
      pharmacy: { en: 'Pharmacy', de: 'Apotheke', ar: 'صيدلية' },
      market:   { en: 'Market',   de: 'Markt',    ar: 'سوق' },
    };
    return map[key]?.[locale] || map[key]?.en || key;
  };

  const localizeCuisine = (value: string) => {
    if (locale !== 'ar') return value;
    return value
      .replace(/Burgers?/gi, 'برغر').replace(/American/gi, 'أمريكي')
      .replace(/Pizza/gi, 'بيتزا').replace(/Italian/gi, 'إيطالي')
      .replace(/Sushi/gi, 'سوشي').replace(/Japanese/gi, 'ياباني')
      .replace(/Caf[eé]/gi, 'مقهى').replace(/Breakfast/gi, 'فطور');
  };

  const localizeEta = (value: string) => locale === 'ar' ? value.replace(/min\.?/gi, 'دقيقة') : value;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1180px] bg-canvas pb-24 shadow-[0_0_80px_rgba(0,0,0,.45)]">
      {/* Header */}
      <AppHeader onOpenDrawer={() => setDrawerOpen(true)} unreadCount={unreadCount} deliveryLocation={deliveryLocation} />

      {/* Search bar */}
      <div className="mt-2 px-4">
        <form
          onSubmit={handleSearch}
          className="relative flex items-center h-12 rounded-2xl bg-surface-1 border border-[var(--border)] focus-within:border-text-muted transition-colors"
        >
          <button
            type="submit"
            aria-label={t.common?.search || 'Search'}
            className="absolute start-0.5 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <Search className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
          </button>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.common?.searchPlaceholder || 'Search for restaurants, cuisines…'}
            className="flex-1 h-full bg-transparent ps-11 pe-12 text-ink-primary text-[14px] placeholder:text-text-muted focus:outline-none"
            aria-label="Search"
          />
          <button
            type="button"
            aria-label={t.common?.filter || 'Filter'}
            onClick={() => router.push('/search?filter=1')}
            className="absolute end-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <SlidersHorizontal className="w-4 h-4" strokeWidth={2} aria-hidden />
          </button>
        </form>
      </div>

      {/* Three clear customer storefronts: food, daily essentials, retail. */}
      <CustomerMarketplaceNav className="mt-3" />

      {/* Hero promo carousel */}
      <HeroBanner onCtaClick={handleCtaClick} />

      {/* Categories row */}
      <div className="mt-5 px-4">
        <ul className="grid grid-cols-5 gap-2" role="list">
          {CATEGORIES.map((cat) => (
            <li key={cat.type}>
              <Link
                href={cat.href}
                className="flex flex-col items-center gap-1.5 group"
                aria-label={categoryLabel(cat.key)}
              >
                <CategoryIcon type={cat.type} className="transition-transform group-hover:scale-105" />
                <span className="text-ink-primary text-[12px] font-semibold leading-none text-center">
                  {categoryLabel(cat.key)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Popular near you */}
      <div className="mt-6 px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-ink-primary font-extrabold text-[17px]">
            {t.home?.popularNearYou || 'Popular near you'}
          </h3>
          <Link
            href="/search?sort=popular"
            className="text-brand text-[13px] font-semibold hover:underline"
          >
            {t.home?.seeAll || 'See all'}
          </Link>
        </div>

        {popularRestaurants.length === 0 ? (
          <div className="rounded-2xl bg-surface-1 border border-[var(--border)] p-6 text-center">
            <p className="text-text-secondary text-[14px]">
              {t.home?.noRestaurantsYet || 'No restaurants available right now.'}
            </p>
          </div>
        ) : (
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3" role="list">
            {popularRestaurants.slice(0, 3).map((r) => (
              <li key={r.id} className="w-[78vw] max-w-[320px] shrink-0 snap-start sm:w-auto sm:max-w-none">
                <article className="relative min-w-0 overflow-hidden rounded-[20px] border border-[var(--border)] bg-surface-1 shadow-[0_12px_32px_rgba(0,0,0,.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-[0_18px_40px_rgba(0,0,0,.2)] motion-reduce:transform-none">
                  <Link href={r.href} className="group block">
                  {/* Image */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
                    <CatalogImage
                      src={r.imageUrl}
                      alt={r.name}
                      name={r.name}
                      kind="restaurant"
                      className="group-hover:scale-[1.045]"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" aria-hidden />
                  </div>
                  {/* Card body */}
                  <div className="p-3.5">
                    <h4 className="truncate text-[16px] font-extrabold text-ink-primary">
                      {r.name}
                    </h4>
                    <p className="mt-0.5 truncate text-[12px] text-text-secondary">
                      {localizeCuisine(r.cuisine)}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-[12px] text-text-secondary">
                      <Star className="w-3.5 h-3.5 fill-brand-yellow text-brand-yellow" aria-hidden />
                      <span className="text-ink-primary font-semibold tabular-nums">{r.rating}</span>
                      <span className="text-text-muted">({r.reviews})</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-text-secondary tabular-nums">
                      <span>{localizeEta(r.eta)}</span>
                      <span className="text-text-muted">·</span>
                      <span>{r.priceTier}</span>
                      <span className="text-text-muted">·</span>
                      <span>{t.common?.minOrder || 'Minimum order'}: {r.minOrder}</span>
                    </div>
                  </div>
                  </Link>
                  <div className="absolute end-2 top-2 z-10">
                    <FavoriteButton
                      restaurantId={r.id}
                      initialFavorited={r.isFavorite}
                      size="sm"
                      onChange={(isFav) => {
                        toast.success(
                          isFav ? (t.home?.addedToFavorites || 'Added to favorites') : (t.home?.removedFromFavorites || 'Removed from favorites'),
                          r.name,
                        );
                      }}
                    />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Live order tracking card */}
      {activeOrder && (
        <ActiveOrderCard
          restaurantName={activeOrder.restaurantName}
          status={activeOrder.status}
          etaMinutes={activeOrder.etaMinutes}
          stage={activeOrder.stage}
          imageUrl={activeOrder.imageUrl}
          onClick={() => router.push(activeOrder.href)}
        />
      )}

      {/* Bottom navigation */}
      <BottomNavigation />

      {/* Side drawer */}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={initialUser}
        unreadCount={unreadCount}
      />
    </div>
  );
}
