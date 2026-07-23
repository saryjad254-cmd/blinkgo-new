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
import { Store, Search, Heart } from 'lucide-react';
import type { Restaurant } from '@/lib/types';
import { restaurantCoverUrl } from '@/lib/images';

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
    q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%,cuisine.cs.{${query}}`);
  }

  if (category) {
    q = q.contains('cuisine', [category]);
  }

  const { data, error } = await q;
  if (error) {
    console.error('getRestaurants:', error);
    return [];
  }

  let restaurants = ((data ?? []) as Restaurant[]).map((r) => ({ ...r, cover_url: restaurantCoverUrl(r as any) }));

  // Filter favorites if requested
  if (favoritesOnly && userId) {
    const supabaseAdmin = await import('@supabase/supabase-js').then(m => 
      m.createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    );
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
  const allCuisines = Array.from(new Set(
    (await (await import('@/lib/supabase/server')).createServerClient()
      .from('restaurants')
      .select('cuisine')
      .eq('is_active', true))
      .data?.flatMap(r => Array.isArray(r.cuisine) ? r.cuisine : []) ?? []
  )).sort();

  return (
    <>
      <PageHeader
        title={t.nav.restaurants}
        subtitle={`${restaurants.length} ${t.customer.restaurantsAvailable}`}
      />

      {/* Search bar — dark glass sticky */}
      <div className="sticky top-16 md:top-16 z-10 bg-bg-card/80 backdrop-blur-xl border-b border-edge-light shadow-speed-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3">
          <form className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <input
                type="search"
                name="q"
                defaultValue={query ?? ''}
                placeholder={t.customer.searchPlaceholder}
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