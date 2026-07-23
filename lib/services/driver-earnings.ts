/**
 * Driver Earnings — single source of truth.
 *
 * The driver sees their earnings on:
 *  - Available orders list ("estimated earnings")
 *  - Dashboard available order cards
 *  - Active order hero card
 *  - Earnings dashboard (today/week/month/all-time)
 *  - Order history
 *
 * Previously each of these computed its own number, leading to
 * inconsistent values. This module is the only place that knows how to
 * turn an `orders` row into a "what the driver earns from this delivery".
 *
 * Formula (configurable per platform):
 *   base = delivery_fee × 0.8 + tip
 *
 * - `delivery_fee` is what the customer pays for delivery.
 *   The driver gets 80% of it; the platform keeps 20%.
 * - `tip` is the customer's tip, 100% to the driver.
 * - The `0.8` and 100% defaults are the Wolt / Uber Eats industry standard
 *   and are exposed via `DRIVER_DELIVERY_SHARE` for future tuning.
 */

const DRIVER_DELIVERY_SHARE = 0.8;

export interface EarningsBreakdown {
  base: number;       // delivery_fee share (0.8 × delivery_fee)
  tip: number;        // full tip
  total: number;      // sum of base + tip
  share: number;      // configurable share (0.8)
}

export function computeEarnings(input: {
  delivery_fee?: number | null;
  tip?: number | null;
}): EarningsBreakdown {
  const fee = Number(input.delivery_fee ?? 0) || 0;
  const tip = Number(input.tip ?? 0) || 0;
  const base = fee * DRIVER_DELIVERY_SHARE;
  return {
    base: round2(base),
    tip: round2(tip),
    total: round2(base + tip),
    share: DRIVER_DELIVERY_SHARE,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const DRIVER_EARNINGS_CONFIG = {
  deliveryShare: DRIVER_DELIVERY_SHARE,
  /** Min total a driver must earn to qualify for a weekly bonus (per driver-configurable). */
  defaultWeeklyGoal: 500,
  /** Daily bonus threshold (configurable per driver in the future). */
  defaultBonusThreshold: 200,
};
