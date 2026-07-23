-- ════════════════════════════════════════════════════════════════
-- BlinkGo — driver_status table (critical missing table)
-- ════════════════════════════════════════════════════════════════
-- WHY THIS MIGRATION EXISTS
-- Several parts of the app already assumed this table existed:
--   - RPC get_admin_stats()          -> SELECT COUNT(*) FROM driver_status WHERE is_online = true
--   - RPC find_nearby_drivers()      -> JOIN driver_status ds ON ...
--   - RPC suggest_drivers_for_order()-> JOIN driver_status ds ON ...
--   - hooks/useAdmin.ts              -> .from('users').select('... driver_status(...)')
--   - components/driver/OnlineToggle.tsx      -> .from('driver_status').upsert(...)
--   - components/driver/AcceptOrderButton.tsx -> .from('driver_status').upsert(...)
-- but the table itself was never created in any prior migration/schema
-- file (verified by searching every .sql file in this repo — no
-- CREATE TABLE driver_status exists anywhere before this file), so every
-- one of the above silently failed against a live database
-- ("relation driver_status does not exist"). This migration creates it
-- and backfills it from data already in auth.users.user_metadata (the
-- source of truth used by /api/driver/online and /api/driver/location).
--
-- Column names below match EXACTLY what every existing caller already
-- expects: driver_id, is_online, is_on_delivery, latitude, longitude
-- (see deploy/supabase/03-helpers.sql and supabase-fixes/11-perf-features.sql).
-- current_order_id / heading / speed / accuracy are additive columns used
-- by the app's own API routes and don't conflict with anything.
--
-- Safe to run even if some pieces already exist — every statement is
-- idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- Run this once in the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════

-- Defined with CREATE OR REPLACE so this file doesn't depend on
-- supabase-fixes/11-perf-features.sql having been run first. Harmless
-- no-op if it already exists with this exact body.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.driver_status (
  driver_id       UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_online       BOOLEAN NOT NULL DEFAULT false,
  is_on_delivery  BOOLEAN NOT NULL DEFAULT false,
  current_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  heading         DOUBLE PRECISION,
  speed           DOUBLE PRECISION,
  accuracy        DOUBLE PRECISION,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_status_online
  ON public.driver_status(is_online) WHERE is_online = true;

ALTER TABLE public.driver_status ENABLE ROW LEVEL SECURITY;

-- A driver can read/write only their own row.
DROP POLICY IF EXISTS driver_status_self ON public.driver_status;
CREATE POLICY driver_status_self ON public.driver_status FOR ALL TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- Admins and restaurants need to see all drivers' live status/location
-- (dispatch board, admin drivers page, "drivers near me" lookups).
DROP POLICY IF EXISTS driver_status_read_staff ON public.driver_status;
CREATE POLICY driver_status_read_staff ON public.driver_status FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'restaurant'))
);

DROP TRIGGER IF EXISTS trg_touch_driver_status ON public.driver_status;
CREATE TRIGGER trg_touch_driver_status BEFORE UPDATE ON public.driver_status
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_status;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Backfill from auth.users.user_metadata, which is the data actually
-- written by /api/driver/online and /api/driver/location today.
INSERT INTO public.driver_status (driver_id, is_online, latitude, longitude, updated_at)
SELECT
  u.id,
  COALESCE((au.raw_user_meta_data ->> 'is_online')::boolean, false),
  (au.raw_user_meta_data ->> 'last_location_lat')::double precision,
  (au.raw_user_meta_data ->> 'last_location_lng')::double precision,
  now()
FROM public.users u
JOIN auth.users au ON au.id = u.id
WHERE u.role = 'driver'
ON CONFLICT (driver_id) DO NOTHING;

COMMENT ON TABLE public.driver_status IS 'Live driver online/on-delivery state + last known GPS position. Written by /api/driver/online and /api/driver/location; read by admin dashboard, find_nearby_drivers(), suggest_drivers_for_order(), get_admin_stats().';
