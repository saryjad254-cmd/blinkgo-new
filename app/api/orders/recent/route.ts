/**
 * Recent Orders API — for "Order again" section
 * Returns user's recent completed orders (last 30 days)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { restaurantCoverUrl } from '@/lib/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * FIX (v86) — two proven production defects in this route:
 *
 * 1. HTTP 500. This route built its own client with the raw
 *    `createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)`. When that
 *    variable is absent from the runtime environment, supabase-js throws
 *    `Error: supabaseKey is required.` *synchronously*. The throw happens
 *    inside withErrorHandling, which maps it to INTERNAL_ERROR → **500**
 *    (reproduced: "Unhandled API error / code: INTERNAL_ERROR /
 *    raw: supabaseKey is required.").
 *
 * 2. Silently empty results. This project's service-role key is the new
 *    `sb_secret_*` format. Raw createClient sends it as
 *    `Authorization: Bearer sb_secret_…`, which PostgREST tries to verify as
 *    a JWT and rejects (PGRST301, "unrecognized JWT kid <nil> for algorithm
 *    ES256"). lib/supabase/service.ts exists precisely to handle that key
 *    format; this route bypassed it, so every query failed and the error was
 *    swallowed into an empty list with no logging.
 *
 * Using the shared, hardened client fixes both. Configuration problems are
 * surfaced as logs + a typed `degraded` response instead of a 500, because
 * "Order again" is an optional discovery widget.
 */
function getServiceClient() {
  return createServiceClient();
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const ss = createServerClient();
    const { data: { user } } = await ss.auth.getUser();
    if (!user) throw new AuthenticationError('Login required');

    let supabase;
    try {
      supabase = getServiceClient();
    } catch (e) {
      // createServiceClient throws when SUPABASE_SERVICE_ROLE_KEY / URL are
      // missing. This is the exact exception that produced the production 500.
      logger.error('Recent orders: service client unavailable (check SUPABASE_SERVICE_ROLE_KEY)', {
        error: (e as Error).message,
      });
      return ok({ orders: [], degraded: true });
    }
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);

    // Get recent completed orders with restaurant info
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, status, total, created_at,
        restaurant_id,
        restaurants:restaurant_id(*)
      `)
      .eq('customer_id', user.id)
      .in('status', ['delivered', 'completed'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      // Never swallow silently: record the exact failure so a broken key or a
      // schema drift surfaces in logs instead of looking like "no orders yet".
      logger.error('Recent orders query failed', {
        code: (error as any).code,
        message: error.message,
      });
      return ok({ orders: [], degraded: true });
    }

    // Dedupe by restaurant (keep most recent order per restaurant)
    const seen = new Set<string>();
    const unique: any[] = [];
    for (const o of orders || []) {
      if (!o.restaurant_id || seen.has(o.restaurant_id)) continue;
      seen.add(o.restaurant_id);
      unique.push({
        ...o,
        restaurants: o.restaurants
          ? { ...o.restaurants, cover_url: restaurantCoverUrl(o.restaurants as any) }
          : o.restaurants,
      });
    }

    return ok({ orders: unique });
  });
}
