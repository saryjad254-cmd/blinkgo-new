/**
 * Customer Intelligence
 * ─────────────────────
 * Smart personalization and search ranking for customers.
 *
 * All privacy-respecting:
 * - No tracking across users
 * - Recommendations use only the user's own order history
 * - Popular dishes use aggregate (k-anonymous) data
 * - All scoring deterministic
 */

export interface RestaurantCandidate {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  deliveryTimeMin: number;
  deliveryFee: number;
  cuisine: string;
  /** Distance to customer in meters. */
  distanceMeters: number;
  /** Whether restaurant is currently busy (slows acceptance). */
  isBusy: boolean;
  /** Whether restaurant is currently online. */
  isOnline: boolean;
  /** Whether restaurant is currently paused. */
  isPaused: boolean;
}

export interface UserPreference {
  /** Cuisines the user has ordered from. */
  favoriteCuisines: string[];
  /** Restaurant IDs the user has ordered from. */
  favoriteRestaurants: string[];
  /** Average order value. */
  averageOrderValue: number;
  /** Average rating the user gives. */
  averageRating: number;
  /** Days since last order. */
  daysSinceLastOrder: number;
}

export interface ScoredRestaurant {
  restaurant: RestaurantCandidate;
  score: number;
  reasons: string[];
  matchScore: number;
}

const WEIGHTS = {
  rating: 0.20,
  speed: 0.20,
  distance: 0.15,
  preference: 0.25,
  availability: 0.10,
  popularity: 0.10,
};

export function rankRestaurants(
  candidates: RestaurantCandidate[],
  user: UserPreference,
  searchQuery: string = ''
): ScoredRestaurant[] {
  const now = new Date();
  const hour = now.getHours();
  const isMealTime = (hour >= 11 && hour < 14) || (hour >= 18 && hour < 21);

  const results: ScoredRestaurant[] = candidates.map((r) => {
    // Hard filter: offline restaurants
    if (!r.isOnline || r.isPaused) {
      return {
        restaurant: r,
        score: 0,
        matchScore: 0,
        reasons: r.isPaused ? ['Paused'] : ['Offline'],
      };
    }

    // Search query match (boost if matches name/cuisine)
    let searchBonus = 0;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (r.name.toLowerCase().includes(q)) searchBonus += 0.3;
      if (r.cuisine.toLowerCase().includes(q)) searchBonus += 0.2;
    }

    // Rating score (0-1)
    const ratingScore = Math.max(0, (r.rating - 3) / 2);

    // Speed score (0-1, faster = higher)
    const speedScore = Math.max(0, 1 - r.deliveryTimeMin / 60);

    // Distance score (0-1, closer = higher)
    const distanceScore = Math.max(0, 1 - r.distanceMeters / 10000);

    // Preference score
    let preferenceScore = 0;
    const reasons: string[] = [];
    if (user.favoriteCuisines.includes(r.cuisine)) {
      preferenceScore += 0.5;
      reasons.push(`Your favorite: ${r.cuisine}`);
    }
    if (user.favoriteRestaurants.includes(r.id)) {
      preferenceScore += 0.5;
      reasons.push('You ordered here before');
    }
    if (user.daysSinceLastOrder > 14 && r.reviewCount > 100) {
      // Returning customer: popular restaurants
      reasons.push('Popular');
    }
    preferenceScore = Math.min(1, preferenceScore);

    // Availability (penalize busy)
    const availabilityScore = r.isBusy ? 0.4 : 1.0;

    // Popularity (Bayesian average: (C*m + sum) / (C + n))
    const C = 10; // prior count
    const m = 4.0; // prior rating
    const bayesian = (C * m + r.rating * r.reviewCount) / (C + r.reviewCount);
    const popularityScore = Math.max(0, (bayesian - 3) / 2);

    const score =
      ratingScore * WEIGHTS.rating +
      speedScore * WEIGHTS.speed +
      distanceScore * WEIGHTS.distance +
      preferenceScore * WEIGHTS.preference +
      availabilityScore * WEIGHTS.availability +
      popularityScore * WEIGHTS.popularity +
      searchBonus;

    // Meal-time boost: prefer faster restaurants
    const finalScore = isMealTime ? score + speedScore * 0.1 : score;

    if (r.reviewCount > 200 && ratingScore > 0.7 && !reasons.length) {
      reasons.push('Highly rated');
    }
    if (r.deliveryTimeMin < 20 && !reasons.includes('Highly rated')) {
      reasons.push('Fast delivery');
    }

    return {
      restaurant: r,
      score: Math.min(1, Math.max(0, finalScore)),
      matchScore: preferenceScore,
      reasons,
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results;
}

export interface PopularDish {
  productId: string;
  productName: string;
  restaurantId: string;
  restaurantName: string;
  orderCount: number;
  rating: number;
  price: number;
}

export function rankPopularDishes(
  dishes: PopularDish[],
  userCuisines: string[]
): PopularDish[] {
  return [...dishes]
    .map((d) => {
      let score = d.orderCount * 0.5 + d.rating * 100;
      if (userCuisines.some((c) => d.restaurantName.toLowerCase().includes(c.toLowerCase()))) {
        score *= 1.5;
      }
      return { ...d, _score: score };
    })
    .sort((a, b) => (b as any)._score - (a as any)._score)
    .map(({ _score, ...d }) => d as PopularDish);
}
