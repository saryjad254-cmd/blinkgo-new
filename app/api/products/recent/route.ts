/**
 * Recent Products API — Optimized
 * ─────────────────────────────────
 * Recently viewed products by current user, with caching.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCache } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getServiceClient() {
  return createServiceClient();
}

export async function GET(req: NextRequest) {
  try {
    const ss = createServerClient();
    const { data: { user } } = await ss.auth.getUser();
    if (!user) {
      return NextResponse.json({ products: [] });
    }

    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '10'), 50);
    const cacheKey = `recent-products:${user.id}:${limit}`;
    const cache = getCache();
    const cached = cache.get(cacheKey) as { products: any[]; cached: boolean } | null;
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          // PERF: per-user list — keep it out of the shared CDN but allow
          // the browser to cache briefly. SWR=120s lets the browser reuse
          // a stale list for 2 min while revalidating.
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        },
      });
    }

    const supabase = getServiceClient();
    // Get recent product views from a views table (graceful fallback if missing)
    let productIds: string[] = [];
    try {
      const { data: views } = await supabase
        .from('product_views')
        .select('product_id')
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(limit);
      productIds = (views || []).map((v: any) => v.product_id);
    } catch {
      // table missing
    }

    if (productIds.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // Defensive fallback: if the production DB is missing the
    // `is_active` column, run without the filter so the route still
    // returns the user's recent products.
    let products: any[] = [];
    try {
      const res = await supabase
        .from('products')
        .select('id, name, restaurant_id, restaurants:restaurant_id(name)')
        .in('id', productIds)
        .eq('is_active', true);
      if (res.error && /column .* does not exist/i.test(res.error.message)) {
        const fallback = await supabase
          .from('products')
          .select('id, name, restaurant_id, restaurants:restaurant_id(name)')
          .in('id', productIds);
        products = fallback.data || [];
      } else {
        products = res.data || [];
      }
    } catch {
      products = [];
    }

    const filtered = (products || []).filter((p: any) => p.restaurants == null || p.restaurants.is_active !== false);
    const result = { products: filtered, cached: false };
    cache.set(cacheKey, result, 60_000);

    return NextResponse.json(result, {
      headers: {
        'X-Cache': 'MISS',
        // PERF: per-user list — private browser cache + SWR.
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
      },
    });
  } catch (e) {
    console.error('Recent products failed:', e);
    return NextResponse.json({ products: [], error: 'fetch_failed' }, { status: 500 });
  }
}
