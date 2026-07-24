-- ============================================================
-- 47. RESTAURANT OPERATIONAL AVAILABILITY (is_online)
-- ============================================================
-- Evidence for this minimal schema change (Phase 8.1):
--   * The restaurant dashboard exposes an Online/Offline control that is
--     distinct from Pause and Busy mode.
--   * public.restaurants has NO column for it: 14-complete-schema.sql defines
--     only is_active / is_featured, and 26-ops-v38.sql adds is_paused /
--     busy_mode. The `is_online` column in the schema belongs to driver_status.
--   * The dashboard therefore READ `is_active` while the control POSTed
--     `is_online` to a route that did not exist, so the toggle always reverted.
--   * Reusing `is_active` is not acceptable: it is the account/listing flag,
--     so going "offline" for an evening would deactivate the listing entirely.
--
-- One boolean column, defaulting to TRUE so every existing restaurant keeps
-- its current operational behaviour after the migration.
--
-- Idempotent: safe to run repeatedly.
-- ============================================================

BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.restaurants.is_online IS
  'Operational availability, owner-controlled. Distinct from is_active (account/listing state), is_paused (short pause) and busy_mode (extended prep times).';

-- Partial index for the customer-facing "currently orderable" query.
CREATE INDEX IF NOT EXISTS idx_restaurants_is_online
  ON public.restaurants (is_online)
  WHERE is_online = true;

COMMIT;

-- Verification:
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='restaurants' AND column_name='is_online';
