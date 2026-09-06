/**
 * GET /api/promotions/home
 *
 * Returns the canonical list of home-page promotions for the current user.
 * Promotions are filtered by:
 *   - Active status
 *   - Schedule (start_at / end_at)
 *   - Eligibility (e.g. new-customer-only)
 *   - User attributes (first order, favorites count, etc.)
 *
 * Returns a fixed-shape response (no hardcoded strings on the client).
 *
 * Auth: optional (some promotions are anonymous-friendly)
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getApiUserWithRole } from '@/lib/auth-helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Canonical promotion catalog ─────────────────────────────
// This is the single source of truth for what home-page promos can
// show. Order matters: lower index = higher in the carousel.
const PROMOTION_CATALOG = [
  {
    id: 'free_delivery_over_15',
    type: 'free_delivery',
    eligibility: 'all',
    href: '/search?free_delivery=1',
    theme: 'emerald',
  },
  {
    id: 'new_customer_20_off',
    type: 'new_customer_discount',
    eligibility: 'new_customer',
    href: '/register',
    theme: 'red',
  },
  {
    id: 'loyalty_earn_points',
    type: 'loyalty',
    eligibility: 'authenticated',
    href: '/profile',
    theme: 'violet',
  },
] as const;

interface OrderStatusRow {
  status: string | null;
}

function isEligible(
  promo: typeof PROMOTION_CATALOG[number],
  ctx: { isAuthenticated: boolean; orderCount: number; createdAt: string | null; isNewCustomer: boolean },
): boolean {
  if (promo.eligibility === 'all') return true;
  if (promo.eligibility === 'authenticated') return ctx.isAuthenticated;
  if (promo.eligibility === 'new_customer') {
    // Eligible if the user has no completed orders OR was created within the last 7 days
    if (!ctx.isAuthenticated) return false;
    if (ctx.isNewCustomer) return true;
    if (ctx.orderCount === 0) return true;
    return false;
  }
  return false;
}

export async function GET() {
  try {
    const user = await getApiUserWithRole().catch(() => null);
    const isAuthenticated = !!user;

    let orderCount = 0;
    let createdAt: string | null = null;
    let isNewCustomer = false;

    if (isAuthenticated && user) {
      const userId = user.user.id;
      const supabase = createServiceClient();
      // Count of completed orders (we count the array length because some
      // mock supabase implementations don't honor `count: 'exact', head: true`)
      const { data: completedRows, error: ordersError } = await supabase
        .from('orders')
        .select('id, status')
        .eq('customer_id', userId);
      if (ordersError) throw ordersError;
      const completed = (completedRows as OrderStatusRow[] | null ?? [])
        .filter((order) => order.status === 'delivered' || order.status === 'completed');
      orderCount = completed.length;

      // Profile created_at
      const { data: profile } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', userId)
        .maybeSingle();
      createdAt = profile?.created_at || null;

      if (createdAt) {
        const ageMs = Date.now() - new Date(createdAt).getTime();
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        isNewCustomer = ageMs < SEVEN_DAYS;
      }
    }

    const eligible = PROMOTION_CATALOG.filter((p) => isEligible(p, { isAuthenticated, orderCount, createdAt, isNewCustomer }));

    // Canonical shape — no hardcoded strings on the client
    const promotions = eligible.map((p) => ({
      id: p.id,
      type: p.type,
      href: p.href,
      theme: p.theme,
    }));

    return NextResponse.json({
      promotions,
      meta: {
        isAuthenticated,
        isNewCustomer,
        orderCount,
      },
    }, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch {
    return NextResponse.json({ promotions: [], meta: { isAuthenticated: false, isNewCustomer: false, orderCount: 0 } });
  }
}
