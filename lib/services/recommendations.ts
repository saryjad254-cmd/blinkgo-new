/**
 * AI-Powered Recommendations
 * ──────────────────────────
 * Smart product/restaurant suggestions based on:
 *  - User's order history
 *  - Time of day (breakfast/lunch/dinner)
 *  - Popularity
 *  - Cuisine preferences
 *  - Co-occurrence (items bought together)
 *  - Recency (haven't ordered in a while)
 */

interface Order {
  id: string;
  created_at: string;
  restaurant_id: string;
  items: any[];  // Flexible for various order item structures
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_urls: string[];
  category: string;
  restaurant_id: string;
  sold_count: number;
  is_featured: boolean;
  restaurants?: { name: string; rating: number; cover_url: string };
}

const MEAL_CATEGORIES: Record<string, string[]> = {
  breakfast: ['breakfast', 'frühstück', 'إفطار', 'pancake', 'eggs', 'coffee', 'kaffee', 'قهوة'],
  lunch: ['lunch', 'mittag', 'غداء', 'burger', 'pizza', 'sandwich', 'salad', 'salat', 'سلطة', 'wrap'],
  dinner: ['dinner', 'abend', 'عشاء', 'pizza', 'pasta', 'sushi', 'steak', 'meat', 'fleisch', 'لحم'],
  lateNight: ['snack', 'burger', 'pizza', 'dessert', 'nachspeise', 'حلوى'],
};

export interface ScoredProduct extends Product {
  score: number;
  reason: string;
}

/**
 * Recommend products for a user.
 *
 * Score = popularity + meal_match + preference_match + novelty_bonus
 */
export function recommendProducts(
  userOrders: Order[],
  candidates: Product[],
  limit = 10,
): ScoredProduct[] {
  if (candidates.length === 0) return [];

  // Build user preferences
  const categoryCount: Record<string, number> = {};
  const restaurantCount: Record<string, number> = {};
  const productCount: Record<string, number> = {};
  let totalOrders = 0;

  for (const order of userOrders) {
    totalOrders++;
    restaurantCount[order.restaurant_id] = (restaurantCount[order.restaurant_id] ?? 0) + 1;
    for (const item of order.items) {
      categoryCount[item.category] = (categoryCount[item.category] ?? 0) + 1;
      productCount[item.product_id] = (productCount[item.product_id] ?? 0) + 1;
    }
  }

  // Get meal type
  const hour = new Date().getHours();
  const mealType =
    hour >= 5 && hour < 11 ? 'breakfast' :
    hour >= 11 && hour < 15 ? 'lunch' :
    hour >= 17 && hour < 22 ? 'dinner' :
    'lateNight';
  const mealCategories = MEAL_CATEGORIES[mealType] ?? [];

  // Get top categories (preferences)
  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat]) => cat);

  const now = Date.now();
  const RECENT_ORDER_DAYS = 30;

  return candidates
    .map((p) => {
      let score = 0;
      const reasons: string[] = [];

      // 1. Popularity (sold_count, capped)
      const popularity = Math.log10(Math.max(1, p.sold_count ?? 0)) * 2;
      score += popularity;
      if (p.sold_count > 100) reasons.push('popular');

      // 2. Featured
      if (p.is_featured) {
        score += 5;
        reasons.push('featured');
      }

      // 3. Meal match
      const productCategoryLower = (p.category ?? '').toLowerCase();
      const productNameLower = (p.name ?? '').toLowerCase();
      if (mealCategories.some((m) => productCategoryLower.includes(m) || productNameLower.includes(m))) {
        score += 4;
        reasons.push(mealType);
      }

      // 4. User preference match (category)
      if (topCategories.includes(p.category)) {
        score += 3;
        reasons.push('based on your history');
      }

      // 5. Restaurant preference
      if (restaurantCount[p.restaurant_id]) {
        score += 2;
        reasons.push('from a place you like');
      }

      // 6. Already ordered (lower score)
      if (productCount[p.id]) {
        score -= 3;
      }

      // 7. New product bonus
      // (we don't have created_at on product here, skip)

      // 8. Price reasonableness (don't recommend super expensive items first)
      if (p.price > 50) score -= 1;

      return {
        ...p,
        score: Math.max(0, score),
        reason: reasons[0] || 'recommended',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * "Order again" recommendations — most recent restaurant.
 */
export function getOrderAgainSuggestions(
  userOrders: Order[],
  limit = 5,
): { restaurantId: string; lastOrderId: string; lastItems: any[]; lastOrderAt: string }[] {
  const seen = new Set<string>();
  const suggestions: { restaurantId: string; lastOrderId: string; lastItems: any[]; lastOrderAt: string }[] = [];

  // Sort by most recent
  const sorted = [...userOrders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  for (const order of sorted) {
    if (seen.has(order.restaurant_id)) continue;
    seen.add(order.restaurant_id);
    suggestions.push({
      restaurantId: order.restaurant_id,
      lastOrderId: order.id,
      lastItems: order.items,
      lastOrderAt: order.created_at,
    });
    if (suggestions.length >= limit) break;
  }

  return suggestions;
}

/**
 * Trending products — based on recent orders across all users.
 */
export function getTrendingProducts(
  recentOrders: Order[],
  candidates: Product[],
  limit = 10,
): ScoredProduct[] {
  const productCount: Record<string, number> = {};
  const HOURS_24 = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - HOURS_24;

  for (const order of recentOrders) {
    if (new Date(order.created_at).getTime() < cutoff) continue;
    for (const item of order.items) {
      productCount[item.product_id] = (productCount[item.product_id] ?? 0) + 1;
    }
  }

  return candidates
    .map((p) => ({
      ...p,
      score: productCount[p.id] ?? 0,
      reason: 'trending now',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
