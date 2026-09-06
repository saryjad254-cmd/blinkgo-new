/**
 * Customer Home — Server Component (data + layout)
 *
 * Data sources (real Supabase):
 *   - Restaurants: restaurants table (is_active = true)
 *   - Active order: orders table (in-progress statuses)
 *   - User profile: users table (email, avatar_url, name)
 *   - Notifications: notifications table (unread count)
 *   - Favorites: user_favorites table
 *
 * Auth via layout, server-side data fetching for SSR content.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/rbac';
import { HomeClient, type PopularRestaurant, type ActiveOrderData } from './HomeClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RestaurantRecord {
  id: string;
  name: string;
  cuisine: string[] | string | null;
  rating: number | string | null;
  review_count: number | null;
  delivery_time: number | null;
  delivery_fee: number | string | null;
  min_order_amount: number | string | null;
  cover_url: string | null;
}

interface OrderRestaurantRelation {
  id: string;
  name: string;
  cover_url: string | null;
  logo_url: string | null;
}

const SAMPLE_RESTAURANTS: PopularRestaurant[] = [
  {
    id: 'sample-burger-house',
    name: 'Burger House',
    cuisine: 'Burgers · American',
    rating: 4.6,
    reviews: '2.5k+',
    eta: '20–30 min',
    priceTier: '€€',
    minOrder: '€10.00',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop&auto=format',
    href: '/search?q=Burger%20House',
    isFavorite: false,
  },
  {
    id: 'sample-pizza-palace',
    name: 'Pizza Palace',
    cuisine: 'Pizza · Italian',
    rating: 4.7,
    reviews: '1.8k+',
    eta: '25–35 min',
    priceTier: '€€',
    minOrder: '€9.00',
    imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=400&fit=crop&auto=format',
    href: '/search?q=Pizza%20Palace',
    isFavorite: false,
  },
  {
    id: 'sample-sushi-world',
    name: 'Sushi World',
    cuisine: 'Sushi · Japanese',
    rating: 4.8,
    reviews: '2.1k+',
    eta: '20–30 min',
    priceTier: '€€',
    minOrder: '€12.00',
    imageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=400&fit=crop&auto=format',
    href: '/search?q=Sushi%20World',
    isFavorite: false,
  },
];

async function fetchHomeData(userId: string) {
  const supabase = createServiceClient();

  // ── Restaurants (real, with fallback to sample) ──
  // Show only real active partners. Empty inventory has an honest empty state.
  let popularRestaurants: PopularRestaurant[] = [];
  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, cuisine, rating, review_count, delivery_time, delivery_fee, min_order_amount, is_active, cover_url')
      .eq('type', 'restaurant')
      .eq('is_active', true)
      .order('rating', { ascending: false })
      .limit(3);

    if (!error && data && data.length > 0) {
      popularRestaurants = (data as RestaurantRecord[]).map((r) => ({
        id: r.id,
        name: r.name,
        cuisine: Array.isArray(r.cuisine) ? r.cuisine.slice(0, 2).join(' · ') : (r.cuisine || 'Cuisine'),
        rating: Number(r.rating) || 0,
        reviews: r.review_count
          ? r.review_count > 1000
            ? `${(r.review_count / 1000).toFixed(1)}k+`
            : `${r.review_count}+`
          : 'new',
        eta: `${r.delivery_time || 25}–${(r.delivery_time || 25) + 10} min`,
        priceTier: Number(r.delivery_fee || 0) > 3 ? '€€€' : '€€',
        minOrder: `€${Number(r.min_order_amount || 0).toFixed(2)}`,
        imageUrl: r.cover_url || SAMPLE_RESTAURANTS[0].imageUrl,
        href: `/restaurants/${r.id}`,
        isFavorite: false,
      }));
    }
  } catch {
    // Use sample data on error
  }

  // ── Active order (real, with fallback to sample for showcase) ──
  // Operational order data must never fall back to a fabricated showcase.
  let activeOrder: ActiveOrderData | null = null;
  try {
    const { data: aRow } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, total, created_at, restaurant_id,
        restaurants:restaurant_id(id, name, cover_url, logo_url)
      `)
      .eq('customer_id', userId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (aRow) {
      const rest = aRow.restaurants as OrderRestaurantRelation | OrderRestaurantRelation[] | null;
      const restaurantObj = Array.isArray(rest) ? rest[0] : rest;
      const minutesSincePlaced = Math.max(0, Math.floor((Date.now() - new Date(aRow.created_at).getTime()) / 60000));
      const eta_minutes = Math.max(0, 30 - minutesSincePlaced);

      // Map status to 4-stage progress
      const stageMap: Record<string, ActiveOrderData['stage']> = {
        pending: 'confirmed',
        confirmed: 'confirmed',
        preparing: 'preparing',
        ready: 'preparing',
        assigned: 'on_the_way',
        picked_up: 'on_the_way',
        delivering: 'arriving',
      };

      activeOrder = {
        id: aRow.id,
        restaurantName: restaurantObj?.name || 'Restaurant',
        status: statusLabel(aRow.status),
        etaMinutes: eta_minutes,
        stage: stageMap[aRow.status] || 'on_the_way',
        imageUrl: restaurantObj?.cover_url || restaurantObj?.logo_url || undefined,
        href: `/orders/${aRow.id}/track`,
      };
    }
  } catch {
    // Keep sample for showcase
  }

  return { popularRestaurants, activeOrder };
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Order placed',
    confirmed: 'Order confirmed',
    preparing: 'Being prepared',
    ready: 'Ready for pickup',
    assigned: 'Driver assigned',
    picked_up: 'Driver picked up',
    delivering: 'On the way',
  };
  return labels[status] || status;
}

export default async function HomePage() {
  // Auth check
  const user = await requireRole(['customer', 'admin', 'super_admin', 'manager']);
  // Fetch home data
  const data = await fetchHomeData(user.id);

  // Fetch unread notifications count (best-effort)
  let unreadCount = 0;
  try {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    unreadCount = count || 0;
  } catch {
    // best-effort
  }

  // Fetch user profile for avatar + name
  let userEmail: string | null = null;
  let userFullName: string | null = null;
  let userAvatar: string | null = null;
  let deliveryLocation: string | null = null;
  try {
    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('users')
      .select('email, name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (profile) {
      userEmail = profile.email || null;
      userFullName = profile.name || null;
      userAvatar = profile.avatar_url || null;
    }
  } catch {
    // best-effort
  }

  // Resolve the customer's real default address for the home header. If no
  // address exists, the client renders an explicit address-selection action.
  try {
    const supabase = createServiceClient();
    const { data: defaultAddress } = await supabase
      .from('customer_addresses')
      .select('label, address')
      .eq('customer_id', user.id)
      .eq('is_default', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (defaultAddress?.address) {
      deliveryLocation = defaultAddress.label
        ? `${defaultAddress.label} · ${defaultAddress.address}`
        : defaultAddress.address;
    }
  } catch {
    // best-effort; an address-selection action is shown instead
  }

  return (
    <HomeClient
      initialUser={{
        id: user.id,
        email: userEmail || user.email || '',
        full_name: userFullName || (user as { name?: string | null }).name || null,
        avatar_url: userAvatar,
      }}
      unreadCount={unreadCount}
      deliveryLocation={deliveryLocation}
      popularRestaurants={data.popularRestaurants}
      activeOrder={data.activeOrder}
    />
  );
}
