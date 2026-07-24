import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import { RestaurantCard } from '@/components/customer/RestaurantCard';
import { getServerTranslations } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

/**
 * Favorites page — premium, defensive.
 * If the `favorites` table is missing (PGRST205) or any other DB error
 * occurs, we show the empty state with a friendly message instead of
 * a raw error. The empty state is the correct UX even when the table
 * is missing — there are no favorites to show.
 */
export default async function FavoritesPage() {
  const user = await requireRole('customer');
  const { t, locale } = await getServerTranslations();
  const supabase = createServerClient();

  const { data: favs, error } = await supabase
    .from('favorites')
    .select(`
      id, created_at,
      restaurants:restaurant_id (
        id, name, address, latitude, longitude, rating, review_count,
        *
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Treat "table missing" as "no favorites" — much better UX than an error.
  const tableMissing =
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    (error?.message || '').toLowerCase().includes('does not exist');

  if (error && !tableMissing) {
    return (
      <>
        <PageHeader title={t.customer.favorites} back />
        <div className="max-w-3xl mx-auto px-4 py-6">
          <EmptyState
            iconName="AlertCircle"
            title={t.errors?.generic ?? 'Fehler beim Laden'}
            description={error.message}
            action={(
              <Link
                href="/restaurants"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white font-extrabold text-sm shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                {t.customer.browseRestaurants}
              </Link>
            )}
          />
        </div>
      </>
    );
  }

  // Flatten restaurant data
  const restaurants = (favs ?? [])
    .map((f: any) => f.restaurants)
    .filter((r: any) => r && r.is_active);

  return (
    <>
      <PageHeader
        title={t.customer.favorites}
        subtitle={
          restaurants.length > 0
            ? locale === 'ar'
              ? `${restaurants.length} ${restaurants.length === 1 ? 'مطعم' : 'مطاعم'}`
              : locale === 'en'
              ? `${restaurants.length} ${restaurants.length === 1 ? 'restaurant' : 'restaurants'}`
              : `${restaurants.length} ${restaurants.length === 1 ? 'Restaurant' : 'Restaurants'}`
            : ''
        }
        back
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {restaurants.length === 0 ? (
          <EmptyState
            iconName="Heart"
            title={t.customer.noFavorites ?? (locale === 'ar' ? 'لا توجد مطاعم مفضلة بعد' : locale === 'en' ? 'No favorite restaurants yet' : '❤️ Noch keine Lieblingsrestaurants')}
            description={
              locale === 'ar'
                ? 'احفظ مطاعمك المفضلة لتجدها بسهولة هنا'
                : locale === 'en'
                ? 'Start exploring restaurants and save your favorites.'
                : '❤️ Noch keine Lieblingsrestaurants. Entdecke Restaurants und speichere deine Favoriten.'
            }
            action={(
              <Link
                href="/restaurants"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white font-extrabold text-sm shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                {t.customer.browseRestaurants ?? (locale === 'ar' ? 'استكشاف المطاعم' : locale === 'en' ? 'Explore Restaurants' : 'Restaurants entdecken')}
              </Link>
            )}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {restaurants.map((r: any) => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
