import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { getRestaurantKPIs } from '@/lib/services/restaurant-analytics';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';

export const dynamic = 'force-dynamic';

type RestaurantDashboardRow = {
  id: string;
  is_active: boolean | null;
  is_paused: boolean | null;
  busy_mode: boolean | null;
  busy_mode_until: string | null;
  rating: number | null;
  review_count: number | null;
};

type ActiveOrderRow = {
  id: string;
  order_number: string | null;
  status: string;
  total: number | string | null;
  created_at: string;
  delivery_address: unknown;
  customer_id: string | null;
  accepted_at: string | null;
  prepared_at: string | null;
};

/**
 * GET /api/restaurant/dashboard
 * Returns live stats and active orders for the current restaurant.
 */
export async function GET() {
  const user = await requireApiRole('restaurant');
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }
  try {
    const { service: svc, restaurantId } = await resolveOwnedRestaurant(user.id);
    if (!restaurantId) return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
    const { data: restaurantData, error: restaurantError } = await svc
      .from('restaurants')
      .select('id, is_active, is_paused, busy_mode, busy_mode_until, rating, review_count')
      .eq('id', restaurantId)
      .maybeSingle();

    if (restaurantError) {
      return NextResponse.json(
        { ok: false, error: 'RESTAURANT_LOOKUP_FAILED' },
        { status: 500 }
      );
    }
    if (!restaurantData) {
      return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
    }
    const restaurant = restaurantData as RestaurantDashboardRow;

    const [stats, activeOrdersRes] = await Promise.all([
      getRestaurantKPIs(restaurant.id),
      svc
        .from('orders')
        .select('id, order_number, status, total, created_at, delivery_address, customer_id, accepted_at, prepared_at')
        .eq('restaurant_id', restaurant.id)
        .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
        .order('created_at', { ascending: true })
        // The dashboard count and list must not disagree during a rush. A
        // hard limit of 20 hid newly placed orders whenever an operational
        // backlog exceeded that number, so merchants could not accept them.
        .limit(100),
    ]);

    // Customer name lookup for active orders
    const customerIds = Array.from(
      new Set(
        ((activeOrdersRes.data ?? []) as ActiveOrderRow[])
          .map((order) => order.customer_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    const customerMap = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers } = await svc
        .from('users')
        .select('id, name')
        .in('id', customerIds);
      for (const c of customers ?? []) {
        customerMap.set(c.id, c.name ?? '');
      }
    }

    const activeOrders = ((activeOrdersRes.data ?? []) as ActiveOrderRow[]).map((o) => ({
      id: o.id,
      order_number: o.order_number ?? o.id.slice(0, 8),
      status: o.status,
      total: Number(o.total ?? 0),
      created_at: o.created_at,
      delivery_address: o.delivery_address,
      accepted_at: o.accepted_at,
      prepared_at: o.prepared_at,
      customer_name: o.customer_id ? (customerMap.get(o.customer_id) ?? '') : '',
      estimated_prep_minutes: 20,
    }));

    return NextResponse.json({
      ok: true,
      stats: {
        restaurantId: restaurant.id,
        todayCount: stats.todayOrders,
        todayRevenue: stats.todayRevenue,
        rating: stats.avgRating,
        activeNow: stats.activeOrders,
        isActive: Boolean(restaurant.is_active),
        isPaused: Boolean(restaurant.is_paused),
        busyMode: Boolean(restaurant.busy_mode),
        busyModeUntil: restaurant.busy_mode_until,
      },
      activeOrders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
