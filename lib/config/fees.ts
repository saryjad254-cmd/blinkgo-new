/**
 * Platform fee configuration
 * ──────────────────────────
 * Single source of truth for all fee/commission rates.
 * Used by order-service, operations-service, analytics-service,
 * /api/cart/quote (Phase 7E), /api/checkout/draft (Phase 7F).
 */

export const COMMISSION_RATE = 0.15; // Platform commission on order subtotal
export const PLATFORM_COMMISSION_RATE = 0.15; // Alias for COMMISSION_RATE (semantic clarity)
export const STANDARD_DELIVERY_FEE = 3.99; // Default delivery fee in EUR
export const SERVICE_FEE_RATE = 0.05; // Service fee (5% of subtotal)
export const DRIVER_DELIVERY_SHARE = 0.8; // Driver gets 80% of delivery fee
// A customer promotion may reduce the visible delivery fee to zero. The
// courier contract still guarantees a base payout for completed work.
export const DRIVER_MINIMUM_BASE_PAYOUT = 2.5;
// Courier compensation is independent from customer promotions. Distance is
// measured from the merchant to the customer using server-owned order data.
export const DRIVER_DISTANCE_RATE_PER_KM = 0.85;
export const DRIVER_MAX_PRICED_DISTANCE_KM = 50;
export const DRIVER_MAX_PICKUP_DISTANCE_KM = 15;
export const DRIVER_MAX_OFFER_ROUTE_KM = 40;

// Order input clamps (single source of truth, used by API boundaries)
export const MIN_TIP = 0;          // cents
export const MAX_TIP = 500;        // cents (€5.00)
export const MIN_QUANTITY = 1;     // per line
export const MAX_QUANTITY = 99;    // per line (matches /api/orders)

// Loyalty points configuration
export const POINTS_PER_EUR = 100;        // earn 100 points per €1 spent
export const POINTS_VALUE_EUR = 0.01;     // 1 point = €0.01 when redeemed
export const MAX_REDEEMABLE_PERCENT = 0.5; // max 50% of subtotal in points
