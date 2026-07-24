/**
 * Operations Service — Backward-compatible facade
 * ───────────────────────────────────────────────
 * This module is preserved for backward compatibility. The implementation
 * has been split into focused services:
 *
 *  - lib/services/kpi-service.ts          → getLiveKPIs
 *  - lib/services/business-intelligence.ts → getBusinessIntelligence
 *  - lib/services/finance-service.ts      → getFinanceSummary
 *  - lib/services/restaurant-analytics.ts → getRestaurantKPIs
 *  - lib/services/audit-service.ts        → logAuditEvent
 *  - lib/services/order-operations.ts     → reassignOrderToDriver, emergencyCancelOrder
 *  - lib/services/restaurant-operations.ts → setRestaurantPaused
 *
 * New code should import directly from the focused services.
 */

// Re-exports for backward compatibility
export { getLiveKPIs, clearKPICache, type LiveKPIs } from './kpi-service';
export { getBusinessIntelligence, type BusinessIntelligence, type PeakHour } from './business-intelligence';
export { getFinanceSummary, type FinanceSummary } from './finance-service';
export { getRestaurantKPIs, type RestaurantKPIs } from './restaurant-analytics';
export { logAuditEvent, type AuditEvent } from './audit-service';
export { reassignOrderToDriver, emergencyCancelOrder } from './order-operations';
export { setRestaurantPaused } from './restaurant-operations';
