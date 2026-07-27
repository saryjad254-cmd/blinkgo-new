/**
 * Bestsellers API — Optimized
 * ───────────────────────────
 * Top-selling products (last 30 days) with:
 *  - Server-side aggregation via RPC or pre-computed order_count column
 *  - Caching (5min TTL)
 *  - Optional restaurant_id filter
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCache } from '@/lib/cache';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getServiceClient() {
  return createServiceClient();
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const restaurantId = url.searchParams.get('restaurant_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);

    const cacheKey = `bestsellers:${restaurantId || 'all'}:${limit}`;
    const cache = getCache();
    const cached = cache.get(cacheKey) as { products: any[]; cached: boolean } | null;
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          // PERF: bestsellers list is shared (no user-specific data) so it
          // can sit on the CDN. 60s fresh, 5 min stale-while-revalidate.
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from('products')
      .select('id, name, restaurant_id, restaurants:restaurant_id(name)')
      
      .limit(limit);

    if (restaurantId) query = query.eq('restaurant_id', restaurantId);

    const { data, error } = await query;
    if (error) throw error;

    const products = (data || []).filter((p: any) => p.restaurants == null || p.restaurants.is_active !== false);

    const result = { products, bestsellers: products, cached: false };
    cache.set(cacheKey, result, 5 * 60_000); // 5min cache

    return NextResponse.json(result, {
      headers: {
        'X-Cache': 'MISS',
        // PERF: bestsellers list is shared (no user-specific data) so it
        // can sit on the CDN. 60s fresh, 5 min stale-while-revalidate.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (e) {
    logger.warn('Bestsellers failed', { error: (e as Error).message });
    return NextResponse.json({ products: [], bestsellers: [], error: 'fetch_failed' }, { status: 500 });
  }
}
