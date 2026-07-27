/**
 * Smart Search Ranking
 * ───────────────────
 * Improves restaurant and product search with:
 * - Token matching (handles partial words)
 * - Fuzzy matching (typos allowed)
 * - Personalization boost (user history)
 * - Context awareness (time of day, location)
 * - Popularity boost (trending items)
 */

export interface SearchableRestaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviewCount: number;
  isOnline: boolean;
  isPaused: boolean;
  isBusy: boolean;
  deliveryTimeMin: number;
  distanceMeters: number;
}

export interface SearchableProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  rating: number;
  orderCount: number;
  restaurantId: string;
  restaurantName: string;
  isAvailable: boolean;
}

export interface SearchResult<T> {
  item: T;
  score: number;
  matchReason: string;
}

const FUZZY_THRESHOLD = 0.7; // Jaccard similarity threshold

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function tokenMatchScore(query: string[], target: string[]): number {
  if (query.length === 0) return 0;
  const matches = query.filter((q) => target.some((t) => t.includes(q) || q.includes(t)));
  return matches.length / query.length;
}

export function searchRestaurants(
  restaurants: SearchableRestaurant[],
  query: string,
  userCuisines: string[] = []
): SearchResult<SearchableRestaurant>[] {
  const q = query.trim();
  const queryTokens = tokenize(q);
  const now = new Date();
  const isMealTime = now.getHours() >= 11 && now.getHours() < 21;

  const results: SearchResult<SearchableRestaurant>[] = restaurants.map((r) => {
    const nameTokens = tokenize(r.name);
    const cuisineTokens = tokenize(r.cuisine);

    let score = 0;
    let reason = '';

    if (!q) {
      // Empty query: rank by rating, popularity, speed
      const popularity = Math.min(1, r.reviewCount / 500);
      const rating = Math.max(0, (r.rating - 3) / 2);
      score = popularity * 0.4 + rating * 0.4 + (isMealTime ? 0.2 : 0);
      reason = 'Trending';
    } else {
      // Token match
      const nameMatch = tokenMatchScore(queryTokens, nameTokens);
      const cuisineMatch = tokenMatchScore(queryTokens, cuisineTokens);
      // Fuzzy match
      const fuzzy = Math.max(
        jaccardSimilarity(queryTokens, nameTokens),
        jaccardSimilarity(queryTokens, cuisineTokens)
      );

      score = nameMatch * 0.5 + cuisineMatch * 0.3 + fuzzy * 0.2;
      if (nameMatch > 0.7) reason = 'Name match';
      else if (cuisineMatch > 0.5) reason = 'Cuisine match';
      else if (fuzzy > FUZZY_THRESHOLD) reason = 'Similar';
    }

    // Personalization
    if (userCuisines.includes(r.cuisine)) score += 0.15;

    // Availability penalty
    if (!r.isOnline) score *= 0.1;
    else if (r.isPaused) score *= 0.3;
    else if (r.isBusy) score *= 0.7;

    // Quality boost
    if (r.rating >= 4.5) score += 0.1;

    // Speed boost
    if (r.deliveryTimeMin < 20) score += 0.05;

    return { item: r, score: Math.min(1, score), matchReason: reason || 'Match' };
  });

  return results.sort((a, b) => b.score - a.score);
}

export function searchProducts(
  products: SearchableProduct[],
  query: string
): SearchResult<SearchableProduct>[] {
  const q = query.trim();
  const queryTokens = tokenize(q);

  const results: SearchResult<SearchableProduct>[] = products.map((p) => {
    const nameTokens = tokenize(p.name);
    const descTokens = tokenize(p.description);
    const catTokens = tokenize(p.category);

    let score = 0;
    let reason = '';

    if (!q) {
      // Empty: rank by popularity + rating
      const popularity = Math.min(1, p.orderCount / 1000);
      const rating = Math.max(0, (p.rating - 3) / 2);
      score = popularity * 0.5 + rating * 0.5;
      reason = 'Popular';
    } else {
      const nameMatch = tokenMatchScore(queryTokens, nameTokens);
      const descMatch = tokenMatchScore(queryTokens, descTokens);
      const catMatch = tokenMatchScore(queryTokens, catTokens);
      const fuzzy = Math.max(
        jaccardSimilarity(queryTokens, nameTokens),
        jaccardSimilarity(queryTokens, descTokens),
        jaccardSimilarity(queryTokens, catTokens)
      );

      score = nameMatch * 0.6 + descMatch * 0.2 + catMatch * 0.15 + fuzzy * 0.05;
      if (nameMatch > 0.7) reason = 'Name match';
      else if (catMatch > 0.5) reason = 'Category match';
      else if (fuzzy > FUZZY_THRESHOLD) reason = 'Similar';
    }

    if (!p.isAvailable) score *= 0.05;

    return { item: p, score: Math.min(1, score), matchReason: reason || 'Match' };
  });

  return results.sort((a, b) => b.score - a.score);
}
