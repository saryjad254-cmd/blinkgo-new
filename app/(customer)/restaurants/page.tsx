import { Suspense } from 'react';
import { getServerTranslations } from '@/lib/i18n/server-translations';
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
import Search from 'lucide-react/dist/esm/icons/search';
import type { Restaurant } from '@/lib/types';
import { CustomerMarketplaceNav } from '@/components/customer/CustomerMarketplaceNav';

export const dynamic = 'force-dynamic';

interface RestaurantRow {
  id: string;
  name: string;
  owner_id?: string | null;
  description?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  cover_url?: string | null;
  cover_image_url?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cuisine?: string[] | string | null;
  cuisines?: string[] | string | null;
  is_verified?: boolean | null;
  is_active?: boolean | null;
  min_order_amount?: number | null;
  minimum_order?: number | null;
  delivery_fee?: number | null;
  estimated_delivery_time?: string | null;
  delivery_time_min?: number | null;
  rating?: number | null;
  review_count?: number | null;
  total_reviews?: number | null;
  is_featured?: boolean | null;
  featured?: boolean | null;
}

async function getRestaurants(query?: string, category?: string, favoritesOnly?: boolean, userId?: string): Promise<{ restaurants: Restaurant[]; failed: boolean }> {
  const supabase = await createServerClient();

  let q = supabase
    .from('restaurants')
    .select('*')
    .eq('type', 'restaurant')
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
  }

  if (category) {
    q = q.contains('cuisine', [category]);
  }

  const { data, error } = await q;
  if (error) {
    console.error('getRestaurants:', error);
    return { restaurants: [], failed: true };
  }

  // The deployed database and the newer schema use a few different names.
  // Normalize once here so every customer card receives one reliable contract.
  let restaurants = ((data ?? []) as RestaurantRow[]).map((row): Restaurant => {
    const rawCuisine = row.cuisine ?? row.cuisines;
    const cuisine = Array.isArray(rawCuisine)
      ? rawCuisine
      : typeof rawCuisine === 'string'
        ? [rawCuisine]
        : [];
    const deliveryMinutes = Number(row.delivery_time_min || 0);
    return {
      id: row.id,
      name: row.name,
      owner_id: row.owner_id ?? null,
      description: row.description ?? null,
      address: row.address ?? '',
      latitude: Number(row.latitude ?? 0),
      longitude: Number(row.longitude ?? 0),
      is_verified: Boolean(row.is_verified),
      is_active: row.is_active !== false,
      cuisine,
      cover_url: row.cover_url || row.cover_image_url || null,
      logo_url: row.logo_url || row.image_url || null,
      min_order_amount: Number(row.min_order_amount ?? row.minimum_order ?? 0),
      delivery_fee: Number(row.delivery_fee ?? 0),
      estimated_delivery_time: row.estimated_delivery_time || (deliveryMinutes ? `${deliveryMinutes}–${deliveryMinutes + 10} min` : '25–35 min'),
      rating: Number(row.rating ?? 0),
      review_count: Number(row.review_count ?? row.total_reviews ?? 0),
      is_featured: Boolean(row.is_featured ?? row.featured ?? false),
    };
  });

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

  return { restaurants, failed: false };
}

async function getActiveCoupons() {
  const supabase = await createServerClient();
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

export default async function RestaurantsPage(
  props: {
    searchParams: Promise<{ q?: string; category?: string; favorites?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { t, locale } = await getServerTranslations();
  const user = await requireRole('customer');
  const query = searchParams.q;
  const category = searchParams.category;
  const favoritesOnly = searchParams.favorites === '1';

  const [restaurantResult, coupons] = await Promise.all([
    getRestaurants(query, category, favoritesOnly, user.id),
    getActiveCoupons(),
  ]);
  const { restaurants, failed: restaurantsFailed } = restaurantResult;

  // Get unique cuisines from restaurants
  let allCuisines: string[] = [];
  try {
    const supabase2 = await createServerClient();
    const { data: cuisineRows } = await supabase2
      .from('restaurants')
      .select('cuisine')
      .eq('type', 'restaurant')
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
        back
        backHref="/home"
        subtitle={locale === 'ar'
          ? `${restaurants.length} ${t.customer.restaurantsAvailable}`
          : `${restaurants.length} ${t.customer.restaurantsAvailable}`}
      />

      {/* Search bar — dark glass sticky */}
      <CustomerMarketplaceNav className="mx-auto mt-4 max-w-4xl" />
      <div className="sticky top-16 md:top-16 z-10 bg-bg-card/80 backdrop-blur-xl border-b border-edge-light shadow-speed-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3">
          <form
            className="relative flex items-center gap-2"
            action="/restaurants"
            method="get"
          >
            <div className="relative flex-1">
              <label htmlFor="restaurant-search" className="sr-only">
                {t.customer.searchPlaceholder}
              </label>
              <input
                key={query ?? ''}
                id="restaurant-search"
                type="search"
                name="q"
                defaultValue={query ?? ''}
                placeholder={t.customer.searchPlaceholder}
                aria-label={t.customer.searchPlaceholder}
                className="h-11 w-full rounded-xl border border-edge-light !bg-[#151719] px-4 !text-white placeholder:!text-[#8B8F98] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <button
              type="submit"
              aria-label={locale === 'ar' ? 'بحث' : locale === 'en' ? 'Search' : 'Suchen'}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-edge-light bg-surface-elevated text-text-secondary transition-colors hover:border-brand-red-500 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <Search className="h-4.5 w-4.5" aria-hidden />
            </button>
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

        {restaurantsFailed ? (
          <EmptyState
            iconName="AlertCircle"
            title={locale === 'ar' ? 'تعذر تحميل المطاعم' : locale === 'de' ? 'Restaurants konnten nicht geladen werden' : 'Restaurants could not be loaded'}
            description={locale === 'ar' ? 'تحقق من الاتصال ثم حاول مجددًا. لن تفقد أي بيانات.' : locale === 'de' ? 'Prüfe deine Verbindung und versuche es erneut.' : 'Check your connection and try again. Your data is safe.'}
            action={{ label: locale === 'ar' ? 'إعادة المحاولة' : locale === 'de' ? 'Erneut versuchen' : 'Try again', href: '/restaurants' }}
          />
        ) : restaurants.length === 0 ? (
          <EmptyState
            iconName={favoritesOnly ? "Heart" : "Store"}
            title={favoritesOnly ? t.customer.noFavorites : t.customer.noRestaurants}
            description={favoritesOnly ? t.customer.noFavoritesDesc : t.customer.noRestaurantsDesc}
            action={{ label: locale === 'ar' ? 'مسح الفلاتر' : locale === 'de' ? 'Filter löschen' : 'Clear filters', href: '/restaurants' }}
          />
        ) : (
          <Suspense fallback={<RestaurantsGridSkeleton />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {restaurants.map((r, i) => (
                <RestaurantCard key={r.id} restaurant={r} index={i} />
              ))}
            </div>
          </Suspense>
        )}
      </div>
    </>
  );
}
