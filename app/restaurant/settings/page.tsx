import { Settings as SettingsIcon } from 'lucide-react';
import { requireRestaurantId } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { RestaurantSettingsForm } from '@/components/restaurant/RestaurantSettingsForm';
import { WorkingHoursForm } from '@/components/restaurant/WorkingHoursForm';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';
import type { Restaurant } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getRestaurant(restaurantId: string): Promise<Restaurant | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();
  if (error || !data) return null;
  return data as Restaurant;
}

export default async function SettingsPage() {
  const { restaurantId } = await requireRestaurantId();
  const restaurant = await getRestaurant(restaurantId);

  // Detect locale from cookies
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const locale = getServerLocale(cookieHeader);
  const isAr = locale === 'ar';

  // Translations (kept here as a small inline dict to avoid touching
  // shared i18n types for a page that already mixes server-only data)
  const T = isAr
    ? {
        title: 'الإعدادات',
        subtitle: 'معلومات المطعم الأساسية',
        info: 'معلومات المطعم',
        stats: 'إحصائيات',
        rating: 'التقييم',
        reviewCount: 'عدد التقييمات',
        lastUpdated: 'آخر تحديث',
        verifiedYes: '✅ نعم',
        verifiedNo: '❌ لا',
        notFound: 'خطأ: لم يتم العثور على المطعم',
        updatedLocale: 'ar-EG',
      }
    : {
        title: 'Einstellungen',
        subtitle: 'Grundlegende Restaurantinformationen',
        info: 'Restaurant-Informationen',
        stats: 'Statistiken',
        rating: 'Bewertung',
        reviewCount: 'Anzahl Bewertungen',
        lastUpdated: 'Zuletzt aktualisiert',
        verifiedYes: '✅ Ja',
        verifiedNo: '❌ Nein',
        notFound: 'Fehler: Restaurant nicht gefunden',
        updatedLocale: 'de-DE',
      };

  if (!restaurant) {
    return (
      <>
        <PageHeader title={T.title} />
        <div className="max-w-2xl mx-auto p-6 text-center text-danger">
          {T.notFound}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={T.title} subtitle={T.subtitle} />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="card">
          <h2 className="font-bold text-text mb-4 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-brand" />
            {T.info}
          </h2>
          <RestaurantSettingsForm restaurant={restaurant} />
        </div>

        <div className="card card-glass border-blue-500/20">
          <h3 className="font-bold text-text mb-2">📊 {T.stats}</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-blue-400">{T.rating}:</span>{' '}
              <strong>⭐ {Number(restaurant.rating ?? 0).toFixed(1)}</strong>
            </div>
            <div>
              <span className="text-blue-400">{T.reviewCount}:</span>{' '}
              <strong>{restaurant.review_count ?? 0}</strong>
            </div>
            <div>
              <span className="text-blue-400">{T.lastUpdated}:</span>{' '}
              <strong>
                {new Date(restaurant.updated_at ?? Date.now()).toLocaleDateString(T.updatedLocale)}
              </strong>
            </div>
            <div>
              <span className="text-blue-400">{T.title.split(' ')[0]}:</span>{' '}
              <strong>{restaurant.is_verified ? T.verifiedYes : T.verifiedNo}</strong>
            </div>
          </div>
        </div>

        {/* v29: Working hours */}
        <WorkingHoursForm initial={(restaurant.opening_hours ?? []) as any} />
      </div>
    </>
  );
}