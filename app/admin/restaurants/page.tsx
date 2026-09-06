/**
 * Admin Restaurants
 * ────────────────
 */
import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminRestaurantsClient, type RestaurantRecord } from '@/components/admin/AdminRestaurantsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface VerificationRow {
  restaurant_id: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
  legal_name?: string | null;
  representative_name?: string | null;
  trade_register_name?: string | null;
  trade_register_number?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
}

async function loadRestaurants() {
  const supabase = createServiceClient();
  const [restaurantsResult, verificationsResult] = await Promise.all([
    supabase
      .from('restaurants')
      .select(`
        id, name, type, description, address, phone, category, is_active, is_paused, is_hidden,
        busy_mode, rating, review_count, delivery_fee, min_order_amount, delivery_radius_km,
        commission_pct, latitude, longitude, logo_url, cover_url, opening_hours, archived_at,
        created_at, owner:owner_id(name, email)
      `)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('restaurant_verifications')
      .select('restaurant_id,status,legal_name,representative_name,trade_register_name,trade_register_number,submitted_at,reviewed_at,rejection_reason')
      .limit(500),
  ]);

  const restaurants = restaurantsResult.data || [];
  const verificationByRestaurant = new Map(
    ((verificationsResult.data || []) as VerificationRow[]).map((entry) => [entry.restaurant_id, entry]),
  );

  const normalized: RestaurantRecord[] = restaurants.map((restaurant) => ({
    ...restaurant,
    cuisine_type: restaurant.category || null,
    minimum_order: restaurant.min_order_amount ?? 0,
    delivery_radius_km: Number(restaurant.delivery_radius_km ?? 5),
    commission_pct: Number(restaurant.commission_pct ?? 15),
    owner: Array.isArray(restaurant.owner) ? restaurant.owner[0] || null : restaurant.owner || null,
    verification: verificationByRestaurant.get(restaurant.id) || null,
  }));
  return { restaurants: normalized };
}

export default async function AdminRestaurantsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole('admin');
  const data = await loadRestaurants();
  const { q = '' } = await searchParams;
  return <AdminRestaurantsClient initialRestaurants={data.restaurants} initialSearch={q.slice(0, 100)} userName={user.name || user.email || 'Admin'} />;
}
