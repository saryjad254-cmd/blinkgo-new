import { Suspense } from 'react';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import { RestaurantCard } from '@/components/customer/RestaurantCard';
import { VoiceSearch } from '@/components/customer/VoiceSearch';
import { CategoryFilter } from '@/components/customer/CategoryFilter';
import { FavoritesToggle } from '@/components/customer/FavoritesToggle';
import { ActiveOffers } from '@/components/customer/ActiveOffers';
import { SkeletonRestaurantCard } from '@/components/ui/Skeleton';
import Store from 'lucide-react/dist/esm/icons/store';
import Search from 'lucide-react/dist/esm/icons/search';
import Heart from 'lucide-react/dist/esm/icons/heart';
import type { Restaurant } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getRestaurants(query?: string, category?: string, favoritesOnly?: boolean, userId?: string): Promise<Restaurant[]> {
  const supabase = createServerClient();

  let q = supabase
    .from('restaurants')
    .select('*')
    .eq('is_active', true)
    .order('rating', { ascending: false })
    .limit(50);

  if (query) {
    // v80 audit fix: escape user input (PostgREST filter injection)
    // v81: also use PostgREST's array form for the cuisine `cs` (contains)
    // operator so the value cannot escape the `{...}` array literal even
    // if escapeIlike is bypassed. The previous template-literal form
    // (`cuisine.cs.{${safe}}`) relied on escapeIlike to also escape `{` and
    // `}` — which it does not, so a query like `},is_active.eq.true` could
    // inject extra OR clauses. The `contains` form is parameterised and
    // safe by construction.
    const { escapeIlike } = await import('@/lib/api/escape-ilike');
    const safe = escapeIlike(query);
    q = q.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
    // Apply cuisine match with the safe array form
    q = q.contains('cuisine', [query.trim()]);
  }

  if (category) {
    q = q.contains('cuisine', [category]);
  }

  const { data, error } = await q;
  if (error) {
    console.error('getRestaurants:', error);
    return [];
  }

  let restaurants = (data ?? []) as Restaurant[];

  // Filter favorites if requested
  if (favoritesOnly && userId) {
    // F3 fix: use the canonical service-role client (sb_secret_* compatible).
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabaseAdmin = createServiceClient();
    const { data: favs } = await supabaseAdmin
      .from('favorites')
      .select('restaurant_id')
      .eq('user_id', userId);
    const favIds = new Set((favs || []).map(f => f.restaurant_id));
    restaurants = restaurants.filter(r => favIds.has(r.id));
  }

  return restaurants;
}

async function getActiveCoupons() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true)
    .limit(10);
  return data ?? [];
}

function RestaurantsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonRestaurantCard key={i} />
      ))}
    </div>
  );
}

export default async function RestaurantsPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string; favorites?: string };
}) {
  const { t, locale } = await getServerTranslations();
  const user = await requireRole('customer');
  const query = searchParams.q;
  const category = searchParams.category;
  const favoritesOnly = searchParams.favorites === '1';

  const [restaurants, coupons] = await Promise.all([
    getRestaurants(query, category, favoritesOnly, user.id),
    getActiveCoupons(),
  ]);

  // Get unique cuisines from restaurants
  let allCuisines: string[] = [];
  try {
    const supabase2 = createServerClient();
    const { data: cuisineRows } = await supabase2
      .from('restaurants')
      .select('cuisine')
      .eq('is_active', true);
    allCuisines = Array.from(new Set(
      (cuisineRows ?? []).flatMap(r => Array.isArray(r.cuisine) ? r.cuisine : [])
    )).sort() as string[];
  } catch (e) {
    // Non-fatal: just show no cuisine filter
    console.error('Failed to fetch cuisines', e);
  }

  return (
    <>
      <PageHeader
        title={t.nav.restaurants}
        subtitle={locale === 'ar'
          ? `${restaurants.length} ${t.customer.restaurantsAvailable}`
          : `${restaurants.length} ${t.customer.restaurantsAvailable}`}
      />

      {/* Search bar — dark glass sticky */}
      <div className="sticky top-16 md:top-16 z-10 bg-bg-card/80 backdrop-blur-xl border-b border-edge-light shadow-speed-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3">
          <form
            className="relative flex items-center gap-2"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="relative flex-1">
              <label htmlFor="restaurant-search" className="sr-only">
                {t.customer.searchPlaceholder}
              </label>
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <input
                id="restaurant-search"
                type="search"
                name="q"
                defaultValue={query ?? ''}
                placeholder={t.customer.searchPlaceholder}
                aria-label={t.customer.searchPlaceholder}
                className="input pe-10 w-full"
              />
            </div>
            <VoiceSearch />
          </form>

          {/* Category filter + favorites toggle */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <CategoryFilter categories={allCuisines} active={category} />
            <FavoritesToggle active={favoritesOnly} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Active offers */}
        {coupons.length > 0 && (
          <ActiveOffers coupons={coupons} />
        )}

        {restaurants.length === 0 ? (
          <EmptyState
            iconName={favoritesOnly ? "Heart" : "Store"}
            title={favoritesOnly ? t.customer.noFavorites : t.customer.noRestaurants}
            description={favoritesOnly ? t.customer.noFavoritesDesc : t.customer.noRestaurantsDesc}
          />
        ) : (
          <Suspense fallback={<RestaurantsGridSkeleton />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {restaurants.map((r, i) => (
                <RestaurantCard key={r.id} restaurant={r} />
              ))}
            </div>
          </Suspense>
        )}
      </div>
    </>
  );
}