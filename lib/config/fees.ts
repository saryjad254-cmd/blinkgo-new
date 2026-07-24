/**
 * Platform fee configuration
 * ──────────────────────────
 * Single source of truth for all fee/commission rates.
 * Used by order-service, operations-service, analytics-service.
 */

export const COMMISSION_RATE = 0.15; // Platform commission on order subtotal
export const PLATFORM_COMMISSION_RATE = 0.15; // Alias for COMMISSION_RATE (semantic clarity)
export const STANDARD_DELIVERY_FEE = 3.99; // Default delivery fee in EUR
export const SERVICE_FEE_RATE = 0.05; // Service fee (5% of subtotal)
export const DRIVER_DELIVERY_SHARE = 0.8; // Driver gets 80% of delivery fee
