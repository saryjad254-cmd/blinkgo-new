-- =============================================================================
-- BlinkGo v79.2 — Operator Accounts Setup
-- =============================================================================
-- Wires the three pre-launch operator accounts (admin, driver, restaurant)
-- to their canonical public.users rows and the Goldener Burger Wesseling
-- restaurant. This migration is IDEMPOTENT and can be re-run.
--
-- Auth-side provisioning (passwords, email_confirm) is done via the
-- GoTrue Admin API by scripts/setup-operator-accounts.mjs. PostgreSQL
-- cannot bcrypt, so the Admin API is the only way to set a password.
--
-- Strategy: pivot from .de to .com for operator emails because the
-- .de operator rows in public.users are orphaned (their auth.users
-- counterparts were soft-deleted in a prior deployment and the
-- users_email_key UNIQUE INDEX still blocks re-creation).
--
-- Live account map (matches existing public.users rows):
--   admin@blinkgo.com       → 00000000-0000-0000-0000-000000000004
--   driver@blinkgo.com      → 62e81b22-06f3-4217-adad-8839c29d64ff
--   wesseling@blinkgo.de    → 00000000-0000-0000-0000-000000000020
--
-- The Wesseling restaurant (Goldener Burger Wesseling) is the
-- canonical BlinkGo service-area pilot. Its owner_id already equals
-- 00000000-0000-0000-0000-000000000020 (the wesseling operator), so
-- no restaurant.owner_id UPDATE is needed.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Public.users profile rows (idempotent UPSERT)
-- -----------------------------------------------------------------------------
INSERT INTO public.users (id, email, name, role, is_active, is_verified, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000004', 'admin@blinkgo.com',    'BlinkGo Admin',              'admin',     true, true, now(), now()),
  ('62e81b22-06f3-4217-adad-8839c29d64ff', 'driver@blinkgo.com',   'BlinkGo Driver',             'driver',    true, true, now(), now()),
  ('00000000-0000-0000-0000-000000000020', 'wesseling@blinkgo.de', 'Wesseling Restaurant Owner', 'restaurant', true, true, now(), now())
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  is_verified = EXCLUDED.is_verified,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 2. Public.drivers row for the driver operator (idempotent UPSERT)
-- -----------------------------------------------------------------------------
INSERT INTO public.drivers (id, full_name, phone, vehicle_type, status, is_online, is_available, city, is_active, created_at, updated_at)
VALUES
  ('62e81b22-06f3-4217-adad-8839c29d64ff', 'BlinkGo Driver', NULL, 'car', 'active', false, true, 'Wesseling', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  vehicle_type = EXCLUDED.vehicle_type,
  status = EXCLUDED.status,
  is_online = EXCLUDED.is_online,
  is_available = EXCLUDED.is_available,
  city = EXCLUDED.city,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. Restaurant ownership — Goldener Burger Wesseling
--    The owner_id is already canonical (matches the wesseling operator).
--    This UPDATE is a no-op but documents the invariant and self-heals
--    if a prior script accidentally changed it.
-- -----------------------------------------------------------------------------
UPDATE public.restaurants
SET owner_id = '00000000-0000-0000-0000-000000000020',
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000020';

-- -----------------------------------------------------------------------------
-- 4. Sanity check: confirm all three accounts are correctly mapped.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  admin_ok    boolean;
  driver_ok   boolean;
  rest_ok     boolean;
  owner_ok    boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '00000000-0000-0000-0000-000000000004'
      AND role = 'admin' AND is_active = true AND is_verified = true
  ) INTO admin_ok;

  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.drivers d ON d.id = u.id
    WHERE u.id = '62e81b22-06f3-4217-adad-8839c29d64ff'
      AND u.role = 'driver' AND u.is_active = true
      AND d.status = 'active' AND d.is_available = true
  ) INTO driver_ok;

  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '00000000-0000-0000-0000-000000000020'
      AND role = 'restaurant' AND is_active = true AND is_verified = true
  ) INTO rest_ok;

  SELECT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = '00000000-0000-0000-0000-000000000020'
      AND owner_id = '00000000-0000-0000-0000-000000000020'
  ) INTO owner_ok;

  RAISE NOTICE 'Operator account sanity check:';
  RAISE NOTICE '  admin@blinkgo.com    → public.users admin row:     %', admin_ok;
  RAISE NOTICE '  driver@blinkgo.com   → public.users + drivers row: %', driver_ok;
  RAISE NOTICE '  wesseling@blinkgo.de → public.users restaurant row: %', rest_ok;
  RAISE NOTICE '  Wesseling restaurant owner_id match: %', owner_ok;

  IF NOT (admin_ok AND driver_ok AND rest_ok AND owner_ok) THEN
    RAISE EXCEPTION 'Operator account sanity check FAILED — see NOTICE messages above';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- END OF MIGRATION 47
-- =============================================================================
