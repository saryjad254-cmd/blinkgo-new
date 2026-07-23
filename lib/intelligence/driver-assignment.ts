/**
 * Smart Driver Assignment
 * ───────────────────────
 * Multi-factor scoring algorithm for matching drivers to orders.
 *
 * Score factors (higher = better match):
 * - Distance to restaurant (closer is better)
 * - Current workload (fewer active orders is better)
 * - Idle time (longer idle = priority for fairness)
 * - Direction of travel (in direction = bonus)
 * - Acceptance history (reliable drivers = bonus, but never penalty)
 * - Driver rating (high-rated = small bonus)
 *
 * All factors are normalized 0-1 and combined with weights.
 * Returns ranked list of driver candidates.
 */

import { haversineDistance, type LatLng } from '@/lib/maps/distance';

export interface DriverCandidate {
  id: string;
  name?: string;
  currentLocation: LatLng | null;
  /** Number of active orders currently being delivered. */
  activeOrderCount: number;
  /** Minutes since last delivery (idle time). */
  minutesSinceLastDelivery: number;
  /** Whether driver is heading generally toward the restaurant. */
  headingTowardRestaurant: boolean;
  /** Driver's historical acceptance rate 0-1. */
  acceptanceRate: number;
  /** Driver's rating 1-5. */
  rating: number;
  /** Estimated speed factor (1 = baseline, 0.8 = slow, 1.2 = fast). */
  speedFactor: number;
}

export interface AssignmentContext {
  restaurantLocation: LatLng;
  /** Time when order was placed (for fairness). */
  orderPlacedAt: Date;
  /** Urgency multiplier 0-1: 1 = very urgent, 0 = can wait. */
  urgency?: number;
}

export interface ScoredDriver {
  driver: DriverCandidate;
  score: number;
  factors: {
    distanceScore: number;
    workloadScore: number;
    idleScore: number;
    directionScore: number;
    reliabilityScore: number;
    ratingScore: number;
  };
  distanceToRestaurantMeters: number;
  estimatedArrivalSeconds: number;
  reasons: string[];
}

const WEIGHTS = {
  distance: 0.30,
  workload: 0.20,
  idle: 0.15,
  direction: 0.10,
  reliability: 0.10,
  rating: 0.15,
};

/**
 * Score and rank drivers for an order.
 */
export function scoreDrivers(
  drivers: DriverCandidate[],
  ctx: AssignmentContext
): ScoredDriver[] {
  const results: ScoredDriver[] = drivers.map((driver) => {
    const distance = driver.currentLocation
      ? haversineDistance(driver.currentLocation, ctx.restaurantLocation)
      : 9999; // far if unknown

    // Normalize factors 0-1 (1 = best)
    const distanceScore = Math.max(0, 1 - distance / 10000); // 10km = 0 score
    const workloadScore = Math.max(0, 1 - driver.activeOrderCount / 5); // 5+ orders = 0
    const idleScore = Math.min(1, driver.minutesSinceLastDelivery / 30); // 30min+ = 1
    const directionScore = driver.headingTowardRestaurant ? 1 : 0;
    const reliabilityScore = Math.max(0.3, driver.acceptanceRate); // never below 0.3
    const ratingScore = Math.max(0, (driver.rating - 3) / 2); // 3-5 star range

    // Weighted total
    const score =
      distanceScore * WEIGHTS.distance +
      workloadScore * WEIGHTS.workload +
      idleScore * WEIGHTS.idle +
      directionScore * WEIGHTS.direction +
      reliabilityScore * WEIGHTS.reliability +
      ratingScore * WEIGHTS.rating;

    // Apply urgency boost: more urgent = more weight to distance
    const urgency = ctx.urgency ?? 0.5;
    const urgencyBoost = urgency > 0.7 ? (distanceScore - 0.5) * 0.2 : 0;
    const finalScore = Math.max(0, Math.min(1, score + urgencyBoost));

    // ETA estimate (rough): distance / 30 km/h
    const estimatedArrivalSeconds = Math.max(
      60,
      Math.round((distance / 1000 / 30) * 3600 * 1.3) // 1.3x buffer
    );

    // Reasons (top 3 factors)
    const reasons: string[] = [];
    if (distanceScore > 0.7) reasons.push('Nearby');
    else if (distanceScore < 0.3) reasons.push('Far away');
    if (workloadScore > 0.8) reasons.push('Free');
    else if (workloadScore < 0.3) reasons.push('Busy');
    if (idleScore > 0.7) reasons.push('Long idle');
    if (directionScore > 0) reasons.push('Heading toward restaurant');
    if (reliabilityScore > 0.9) reasons.push('Reliable');
    if (ratingScore > 0.8) reasons.push('High rating');

    return {
      driver,
      score: finalScore,
      factors: {
        distanceScore,
        workloadScore,
        idleScore,
        directionScore,
        reliabilityScore,
        ratingScore,
      },
      distanceToRestaurantMeters: distance,
      estimatedArrivalSeconds,
      reasons,
    };
  });

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Pick the best driver from a list.
 * Returns null if no driver meets minimum threshold.
 */
export function pickBestDriver(
  drivers: DriverCandidate[],
  ctx: AssignmentContext,
  minScore: number = 0.2
): ScoredDriver | null {
  const scored = scoreDrivers(drivers, ctx);
  if (scored.length === 0 || scored[0].score < minScore) return null;
  return scored[0];
}

/**
 * Compute fairness metric: how balanced is the workload?
 * Returns 0-1 (1 = perfectly balanced, 0 = very imbalanced).
 */
export function computeFairness(drivers: DriverCandidate[]): number {
  if (drivers.length === 0) return 1;
  const loads = drivers.map((d) => d.activeOrderCount);
  const mean = loads.reduce((s, l) => s + l, 0) / loads.length;
  if (mean === 0) return 1;
  const variance = loads.reduce((s, l) => s + Math.pow(l - mean, 2), 0) / loads.length;
  const stdDev = Math.sqrt(variance);
  // Lower std dev / mean = more balanced
  const cv = stdDev / Math.max(1, mean);
  return Math.max(0, 1 - cv / 2);
}
