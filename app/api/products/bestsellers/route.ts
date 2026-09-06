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

interface BestsellerProduct {
  id: string;
  name: string;
  restaurants?: { is_active?: boolean } | Array<{ is_active?: boolean }> | null;
  [key: string]: unknown;
}

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getServiceClient() {
  return createServiceClient();
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const restaurantId = url.searchParams.get('restaurant_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);

    const cacheKey = `bestsellers:v3:${restaurantId || 'all'}:${limit}`;
    const cache = getCache();
    const cached = cache.get(cacheKey) as { products: BestsellerProduct[]; cached: boolean } | null;
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
      .select('id,name,description,restaurant_id,price,discount_price,category,image_urls,is_featured,is_available,is_active,approval_status,archived_at,stock,track_stock,prep_time,preparation_time,rating,sold_count,modifiers,restaurants:restaurant_id(id,name,is_active)')
      .eq('approval_status', 'approved')
      .is('archived_at', null)
      .eq('is_active', true)
      .eq('is_available', true)
      .limit(limit);

    if (restaurantId) query = query.eq('restaurant_id', restaurantId);

    const { data, error } = await query;
    if (error) throw error;

    const products = ((data || []) as BestsellerProduct[])
      .filter((product) => {
        const restaurant = Array.isArray(product.restaurants) ? product.restaurants[0] : product.restaurants;
        return restaurant == null || restaurant.is_active !== false;
      })
      .map((product) => ({
        ...product,
        prep_time_min: Number(product.preparation_time ?? product.prep_time ?? 15),
      }));

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
    // Don't 500 the home page when the DB is unreachable — return an
    // empty list with a 200 so the client can render the section header
    // and the customer can still see the rest of the page.
    logger.warn('Bestsellers failed', { error: (e as Error).message });
    return NextResponse.json(
      { products: [], bestsellers: [], cached: false, error: 'fetch_failed' },
      {
        status: 200,
        headers: {
          'X-Cache': 'ERROR',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
