import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantKPIs } from '@/lib/services/restaurant-analytics';

export const dynamic = 'force-dynamic';

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
    const svc = createServiceClient();
    // First try with all v38 columns, fallback to basic
    let { data: restaurant } = await svc
      .from('restaurants')
      .select('id, is_active, is_paused, busy_mode, busy_mode_until, rating, review_count')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!restaurant) {
      // Fallback: query without v38 columns
      const fallback = await svc
        .from('restaurants')
        .select('id, is_active, rating, review_count')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (!fallback.data) {
        return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
      }
      restaurant = { ...fallback.data, is_paused: false, busy_mode: false, busy_mode_until: null } as any;
    }
    const r: any = restaurant;
    if (!r) {
      return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [stats, activeOrdersRes, todayOrdersRes] = await Promise.all([
      getRestaurantKPIs(r.id),
      svc
        .from('orders')
        .select('id, order_number, status, total, created_at, delivery_address, customer_id, accepted_at, prepared_at')
        .eq('restaurant_id', r.id)
        .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
        .order('created_at', { ascending: true })
        .limit(20),
      svc
        .from('orders')
        .select('id, total, status')
        .eq('restaurant_id', r.id)
        .gte('created_at', startOfDay.toISOString()),
    ]);

    const todayCount = todayOrdersRes.data?.length ?? 0;
    const todayRevenue = (todayOrdersRes.data ?? [])
      .filter((o: any) => o.status === 'delivered')
      .reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);

    // Customer name lookup for active orders
    const customerIds = Array.from(
      new Set((activeOrdersRes.data ?? []).map((o: any) => o.customer_id).filter(Boolean))
    );
    let customerMap = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers } = await svc
        .from('users')
        .select('id, name')
        .in('id', customerIds);
      for (const c of customers ?? []) {
        customerMap.set(c.id, c.name ?? '');
      }
    }

    const activeOrders = (activeOrdersRes.data ?? []).map((o: any) => ({
      id: o.id,
      order_number: o.order_number ?? o.id.slice(0, 8),
      status: o.status,
      total: Number(o.total ?? 0),
      created_at: o.created_at,
      delivery_address: o.delivery_address,
      accepted_at: o.accepted_at,
      prepared_at: o.prepared_at,
      customer_name: customerMap.get(o.customer_id) ?? '',
      estimated_prep_minutes: 20,
    }));

    return NextResponse.json({
      ok: true,
      stats: {
        todayCount: stats.todayOrders,
        todayRevenue: stats.todayRevenue,
        rating: stats.avgRating,
        activeNow: stats.activeOrders,
        isActive: !!r.is_active,
        isPaused: !!r.is_paused,
        busyMode: !!r.busy_mode,
        busyModeUntil: r.busy_mode_until,
      },
      activeOrders,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 500 });
  }
}
