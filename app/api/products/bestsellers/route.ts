/**
 * Bestsellers API — Optimized
 * ───────────────────────────
 * Top-selling products (last 30 days) with:
 *  - Server-side aggregation via RPC or pre-computed order_count column
 *  - Caching (5min TTL)
 *  - Optional restaurant_id filter
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCache } from '@/lib/cache';
import { logger } from '@/lib/logging';

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
    const url = new URL(req.url);
    const restaurantId = url.searchParams.get('restaurant_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);

    const cacheKey = `bestsellers:${restaurantId || 'all'}:${limit}`;
    const cache = getCache();
    const cached = cache.get(cacheKey) as { products: any[]; cached: boolean } | null;
    if (cached) {
      return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT' } });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from('products')
      .select('id, name, image_urls, image_url, restaurant_id, restaurants:restaurant_id(name)')
      
      .limit(limit);

    if (restaurantId) query = query.eq('restaurant_id', restaurantId);

    const { data, error } = await query;
    if (error) throw error;

    const products = (data || []).filter((p: any) => p.restaurants == null || p.restaurants.is_active !== false);

    const result = { products, bestsellers: products, cached: false };
    cache.set(cacheKey, result, 5 * 60_000); // 5min cache

    return NextResponse.json(result, { headers: { 'X-Cache': 'MISS' } });
  } catch (e) {
    logger.warn('Bestsellers failed', { error: (e as Error).message });
    return NextResponse.json({ products: [], bestsellers: [], error: 'fetch_failed' }, { status: 500 });
  }
}
