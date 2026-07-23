/**
 * Recent Products API — Optimized
 * ─────────────────────────────────
 * Recently viewed products by current user, with caching.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getCache } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
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
      return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT' } });
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

    const { data: products } = await supabase
      .from('products')
      .select('id, name, image_urls, image_url, restaurant_id, restaurants:restaurant_id(name)')
      .in('id', productIds)
      .eq('is_active', true);

    const filtered = (products || []).filter((p: any) => p.restaurants == null || p.restaurants.is_active !== false);
    const result = { products: filtered, cached: false };
    cache.set(cacheKey, result, 60_000);

    return NextResponse.json(result, { headers: { 'X-Cache': 'MISS' } });
  } catch (e) {
    console.error('Recent products failed:', e);
    return NextResponse.json({ products: [], error: 'fetch_failed' }, { status: 500 });
  }
}
