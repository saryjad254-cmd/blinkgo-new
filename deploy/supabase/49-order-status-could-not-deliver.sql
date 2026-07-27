-- =============================================================================
-- BlinkGo v80 — Migration 49: Add 'could_not_deliver' to order_status enum
-- =============================================================================
-- Picked_up / delivering no longer allow direct transition to 'cancelled' —
-- instead the driver transitions to 'could_not_deliver' which triggers the
-- refund + driver-status-reset flow. This migration adds the new enum value
-- to support that.
--
-- This is IDEMPOTENT and safe to re-run. The ALTER TYPE ... ADD VALUE IF NOT
-- EXISTS pattern is supported on Postgres 12+.
-- =============================================================================

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'could_not_deliver';

-- Documentation
COMMENT ON TYPE order_status IS
  'Order lifecycle: pending → confirmed → preparing → ready → picked_up → delivering → delivered.
   Pre-preparation states may transition to ''cancelled'' (with Stripe refund for card payments).
   Post-preparation states may transition to ''could_not_deliver'' (driver-initiated failure path
   that triggers refund). Terminal: delivered, cancelled, refunded.';

-- =============================================================================
-- END OF MIGRATION 49
-- =============================================================================
