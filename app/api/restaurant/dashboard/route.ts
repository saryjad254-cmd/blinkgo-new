import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantKPIs } from '@/lib/services/restaurant-analytics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/restaurant/dashboard
 * Returns live stats and active orders for the current restaurant.
 */
/**
 * Canonical operational status buckets — the single definition shared by the
 * dashboard counters and the active order list, so one order can never be
 * counted in two incompatible buckets and SSR/realtime totals agree.
 */
const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready'] as const;

/** Orders older than this are excluded from LIVE queues (not deleted). */
const STALE_ACTIVE_HOURS = 24;

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
      .select('*')  // tolerant: is_online may not exist until migration 47 is applied
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
        // CANONICAL ACTIVE BUCKET (must match the order list and the counters):
        // pending | confirmed | preparing | ready.
        // delivered / cancelled / picked_up / delivering are NOT active for a
        // restaurant — the food has left the kitchen.
        .in('status', ACTIVE_STATUSES)
        // Stale guard: orders stuck in a non-terminal state for more than
        // STALE_ACTIVE_HOURS are excluded from the LIVE queue so old test rows
        // cannot inflate counters or drive absurd timers. Nothing is deleted —
        // history pages still show them.
        .gte('created_at', new Date(Date.now() - STALE_ACTIVE_HOURS * 3600_000).toISOString())
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
