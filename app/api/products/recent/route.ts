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

interface ProductViewRow {
  product_id: string;
}

interface RecentProductRow extends Record<string, unknown> {
  id: string;
  restaurants?: Record<string, unknown> | Record<string, unknown>[] | null;
}

interface RecentProductsResponse {
  products: RecentProductRow[];
  recent: RecentProductRow[];
  cached: boolean;
}

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getServiceClient() {
  return createServiceClient();
}

export async function GET(req: NextRequest) {
  try {
    const ss = await createServerClient();
    const { data: { user } } = await ss.auth.getUser();
    if (!user) {
      return NextResponse.json({ products: [], recent: [], cached: false });
    }

    const requestedLimit = Number.parseInt(new URL(req.url).searchParams.get('limit') || '10', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 10;
    const cacheKey = `recent-products:${user.id}:${limit}`;
    const cache = getCache();
    const cached = cache.get(cacheKey) as RecentProductsResponse | null;
    if (cached) {
      return NextResponse.json({ ...cached, cached: true }, {
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
        .limit(Math.min(100, limit * 3));
      productIds = Array.from(new Set((views as ProductViewRow[] | null ?? []).map((view) => view.product_id))).slice(0, limit);
    } catch {
      // table missing
    }

    if (productIds.length === 0) {
      return NextResponse.json({ products: [], recent: [], cached: false });
    }

    let products: RecentProductRow[] = [];
    try {
      const res = await supabase
        .from('products')
        .select('id, name, description, price, discount_price, image_urls, badges, category, restaurant_id, sold_count, is_featured, restaurants:restaurant_id(id,name,is_active,rating,cover_url)')
        .in('id', productIds)
        .eq('approval_status', 'approved')
        .is('archived_at', null)
        .eq('is_active', true)
        .eq('is_available', true);
      if (res.error) throw res.error;
      products = res.data as RecentProductRow[] | null ?? [];
    } catch {
      products = [];
    }

    const filtered = products
      .filter((product) => {
        const relation = Array.isArray(product.restaurants) ? product.restaurants[0] : product.restaurants;
        return relation == null || relation.is_active !== false;
      })
      .sort((a, b) => productIds.indexOf(a.id) - productIds.indexOf(b.id));
    const result: RecentProductsResponse = { products: filtered, recent: filtered, cached: false };
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
