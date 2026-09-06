/**
 * AI Recommendations API
 * ───────────────────────
 * GET /api/recommendations?type=products
 * Returns personalized product/restaurant recommendations.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import {
  recommendProducts,
  getOrderAgainSuggestions,
  getTrendingProducts,
  type RecommendationOrder,
  type RecommendationOrderItem,
  type RecommendationProduct,
} from '@/lib/services/recommendations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOURS_24 = 24 * 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeOrders(value: unknown): RecommendationOrder[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rawOrder) => {
    const order = record(rawOrder);
    if (typeof order.id !== 'string' || typeof order.created_at !== 'string') return [];
    const items: RecommendationOrderItem[] = Array.isArray(order.items)
      ? order.items.flatMap((rawItem) => {
          const item = record(rawItem);
          if (typeof item.product_id !== 'string') return [];
          return [{
            product_id: item.product_id,
            name: typeof item.name === 'string' ? item.name : null,
            category: typeof item.category === 'string' ? item.category : null,
          }];
        })
      : [];
    return [{
      id: order.id,
      created_at: order.created_at,
      restaurant_id: typeof order.restaurant_id === 'string' ? order.restaurant_id : '',
      items,
    }];
  });
}

function normalizeProducts(value: unknown): RecommendationProduct[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rawProduct) => {
    const product = record(rawProduct);
    if (typeof product.id !== 'string' || typeof product.name !== 'string' || typeof product.restaurant_id !== 'string') return [];
    const relationValue = Array.isArray(product.restaurants) ? product.restaurants[0] : product.restaurants;
    const restaurant = record(relationValue);
    return [{
      id: product.id,
      name: product.name,
      description: typeof product.description === 'string' ? product.description : null,
      price: Number(product.price ?? 0),
      image_urls: Array.isArray(product.image_urls) ? product.image_urls.filter((url): url is string => typeof url === 'string') : null,
      category: typeof product.category === 'string' ? product.category : null,
      restaurant_id: product.restaurant_id,
      sold_count: Number(product.sold_count ?? 0),
      is_featured: product.is_featured === true,
      restaurants: typeof restaurant.name === 'string' ? {
        name: restaurant.name,
        rating: Number(restaurant.rating ?? 0),
        cover_url: typeof restaurant.cover_url === 'string' ? restaurant.cover_url : null,
      } : null,
    }];
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') ?? 'products';
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(20, Math.max(1, requestedLimit)) : 10;

    const supabase = await createServerClient();

    if (type === 'products') {
      // User history (if logged in)
      const { data: { user } } = await supabase.auth.getUser();
      let userOrders: RecommendationOrder[] = [];
      if (user) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, created_at, restaurant_id, items:order_items(product_id, name, category)')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        userOrders = normalizeOrders(orders);
      }

      const service = createServiceClient();

      // Get recent orders for trending
      const cutoff = new Date(Date.now() - HOURS_24).toISOString();
      const { data: recentOrders, error: recentOrdersError } = await service
        .from('orders')
        .select('id, created_at, items:order_items(product_id, name, category)')
        .gte('created_at', cutoff)
        .limit(200);

      // Candidates: bestsellers + recent
      const { data: candidates, error: candidatesError } = await service
        .from('products')
        .select('id, name, description, price, image_urls, category, restaurant_id, sold_count, is_featured, restaurants(name, rating, cover_url)')
        .eq('approval_status', 'approved')
        .is('archived_at', null)
        .eq('is_active', true)
        .eq('is_available', true)
        .order('sold_count', { ascending: false })
        .limit(50);

      // Normalize: restaurants is array → object
      if (recentOrdersError) throw recentOrdersError;
      if (candidatesError) throw candidatesError;
      const normalized = normalizeProducts(candidates);
      const normalizedRecentOrders = normalizeOrders(recentOrders);

      const personalized = recommendProducts(userOrders, normalized, limit);
      const trending = getTrendingProducts(normalizedRecentOrders, normalized, 5);
      const orderAgain = getOrderAgainSuggestions(userOrders, 3);

      return ok({ personalized, trending, orderAgain });
    }

    return NextResponse.json({ ok: false, error: 'unknown_recommendation_type' }, { status: 400 });
  });
}
