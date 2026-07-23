/**
 * AI Recommendations API
 * ───────────────────────
 * GET /api/recommendations?type=products
 * Returns personalized product/restaurant recommendations.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging';
import { recommendProducts, getOrderAgainSuggestions, getTrendingProducts } from '@/lib/services/recommendations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOURS_24 = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') ?? 'products';
    const limit = Math.min(20, parseInt(url.searchParams.get('limit') ?? '10'));

    const supabase = createServerClient();

    if (type === 'products') {
      // User history (if logged in)
      const { data: { user } } = await supabase.auth.getUser();
      let userOrders: any[] = [];
      if (user) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, created_at, restaurant_id, items:order_items(product_id, name, category)')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        userOrders = orders ?? [];
      }

      // Get recent orders for trending
      const cutoff = new Date(Date.now() - HOURS_24).toISOString();
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id, created_at, items:order_items(product_id, name, category)')
        .gte('created_at', cutoff)
        .limit(200);

      // Candidates: bestsellers + recent
      const { data: candidates } = await supabase
        .from('products')
        .select('id, name, description, price, image_urls, image_url, category, restaurant_id, sold_count, is_featured, restaurants(name, rating, cover_url:image_url)')
        .eq('is_available', true)
        .order('sold_count', { ascending: false })
        .limit(50);

      // Normalize: restaurants is array → object
      const normalized = (candidates ?? []).map((c: any) => ({
        ...c,
        restaurants: Array.isArray(c.restaurants) ? c.restaurants[0] : c.restaurants,
      }));

      const personalized = recommendProducts(userOrders, normalized, limit);
      const trending = getTrendingProducts((recentOrders ?? []) as any, normalized, 5);
      const orderAgain = getOrderAgainSuggestions(userOrders as any, 3);

      return ok({ personalized, trending, orderAgain });
    }

    return ok({ error: 'Unknown type' });
  });
}
