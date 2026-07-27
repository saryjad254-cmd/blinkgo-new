-- ════════════════════════════════════════════════════════════════════════════════════════
-- BlinkGo — Operator Account Seed (real production schema)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Inserts the three canonical operator accounts into public.users, the Wesseling
-- restaurant into public.restaurants, and the driver profile into public.drivers.
--
-- CONSTRAINTS USED (from production schema)
--   public.users:
--     PRIMARY KEY (id)
--     UNIQUE      (email, firebase_uid, phone)
--     CHECK       role IN ('customer', 'restaurant', 'driver', 'admin')
--   public.restaurants:
--     FOREIGN KEY owner_id REFERENCES public.users(id) ON DELETE SET NULL
--   public.drivers:
--     FOREIGN KEY id REFERENCES auth.users(id) ON DELETE CASCADE
--
-- COLUMNS USED — every name is taken verbatim from the production schema
--   public.users      : id, email, name, role, avatar_url, is_verified, is_active,
--                       firebase_uid, last_login_at, created_at, updated_at,
--                       auth_provider, restaurant_id
--   public.restaurants: id, owner_id, name, description, logo_url, cover_url, address,
--                       latitude, longitude, phone, email, cuisine (text[]),
--                       is_verified, is_active, min_order_amount, delivery_fee,
--                       estimated_delivery_time, opening_hours (jsonb),
--                       delivery_zones (jsonb), rating, review_count, created_at,
--                       updated_at, is_online
--   public.drivers    : id, full_name, phone, status, created_at, city, is_active,
--                       is_available, vehicle_type, is_online
--
-- NOT NULL columns we MUST supply
--   public.users      : id, name, role
--   public.restaurants: id, name, address, latitude, longitude, is_online
--   public.drivers    : id
--
-- UUIDs (stable, referenced from the app's RBAC layer)
--   Admin       00000000-0000-0000-0000-000000000004
--   Driver      62e81b22-06f3-4217-adad-8839c29d64ff
--   Restaurant  00000000-0000-0000-0000-000000000020
--
-- PREREQUISITE
--   The public.drivers row references auth.users(id). The SQL below checks for
--   the existence of the auth.users row and only inserts the public.drivers
--   row if the FK target exists. If it does not exist yet, the auth.users
--   row must be created via the Supabase Admin API or Dashboard first.
--   Re-run this SQL after the auth.users row exists — the rest is idempotent.
--
-- PASSWORDS
--   This SQL does NOT set passwords (PostgreSQL cannot bcrypt). After running
--   this SQL, set the passwords via the Supabase Admin API or the Auth → Users
--   page in the Dashboard. Recommended passwords (operator must rotate before
--   commercial launch):
--     Admin       BlinkGoAdmin2026!
--     Driver      BlinkGoDriver2026!
--     Restaurant  BlinkGoWesseling2026!
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Operator 1 — ADMIN
-- ════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO public.users (
  id, email, name, role,
  is_active, is_verified, auth_provider,
  last_login_at, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  'admin@blinkgo.com',
  'BlinkGo Admin',
  'admin',
  true,
  true,
  'email',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email         = EXCLUDED.email,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  is_active     = EXCLUDED.is_active,
  is_verified   = EXCLUDED.is_verified,
  auth_provider = EXCLUDED.auth_provider,
  last_login_at = EXCLUDED.last_login_at,
  updated_at    = NOW();

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Operator 2 — DRIVER
-- ════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO public.users (
  id, email, name, role,
  is_active, is_verified, auth_provider,
  last_login_at, created_at, updated_at
)
VALUES (
  '62e81b22-06f3-4217-adad-8839c29d64ff',
  'driver@blinkgo.com',
  'BlinkGo Driver',
  'driver',
  true,
  true,
  'email',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email         = EXCLUDED.email,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  is_active     = EXCLUDED.is_active,
  is_verified   = EXCLUDED.is_verified,
  auth_provider = EXCLUDED.auth_provider,
  last_login_at = EXCLUDED.last_login_at,
  updated_at    = NOW();

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Operator 3 — RESTAURANT OWNER
-- ════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO public.users (
  id, email, name, role,
  is_active, is_verified, auth_provider,
  last_login_at, created_at, updated_at,
  restaurant_id
)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  'wesseling@blinkgo.de',
  'Wesseling Restaurant',
  'restaurant',
  true,
  true,
  'email',
  NOW(),
  NOW(),
  NOW(),
  '00000000-0000-0000-0000-000000000020'
)
ON CONFLICT (id) DO UPDATE SET
  email         = EXCLUDED.email,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  is_active     = EXCLUDED.is_active,
  is_verified   = EXCLUDED.is_verified,
  auth_provider = EXCLUDED.auth_provider,
  last_login_at = EXCLUDED.last_login_at,
  updated_at    = NOW(),
  restaurant_id = EXCLUDED.restaurant_id;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Wesseling Restaurant
-- ════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO public.restaurants (
  id, owner_id, name, address, latitude, longitude, is_online,
  description, logo_url, cover_url,
  phone, email, cuisine,
  is_active, is_verified,
  min_order_amount, delivery_fee, estimated_delivery_time,
  opening_hours, delivery_zones,
  rating, review_count,
  created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000020',
  'Wesseling Restaurant',
  'Wesseling, Deutschland',
  50.8208,
  6.9786,
  false,
  'Authentische Küche direkt aus Wesseling — frisch, schnell, zuverlässig.',
  NULL,
  NULL,
  NULL,
  'wesseling@blinkgo.de',
  ARRAY['Deutsch','Pizza','Burger']::text[],
  true,
  true,
  10.00,
  2.99,
  '25-35 min',
  '{"monday":{"open":"09:00","close":"22:00","closed":false},
    "tuesday":{"open":"09:00","close":"22:00","closed":false},
    "wednesday":{"open":"09:00","close":"22:00","closed":false},
    "thursday":{"open":"09:00","close":"22:00","closed":false},
    "friday":{"open":"09:00","close":"23:00","closed":false},
    "saturday":{"open":"10:00","close":"23:00","closed":false},
    "sunday":{"open":"11:00","close":"22:00","closed":false}}'::jsonb,
  NULL,
  4.7,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  owner_id               = EXCLUDED.owner_id,
  name                   = EXCLUDED.name,
  address                = EXCLUDED.address,
  latitude               = EXCLUDED.latitude,
  longitude              = EXCLUDED.longitude,
  is_online              = EXCLUDED.is_online,
  description            = EXCLUDED.description,
  email                  = EXCLUDED.email,
  cuisine                = EXCLUDED.cuisine,
  is_active              = EXCLUDED.is_active,
  is_verified            = EXCLUDED.is_verified,
  min_order_amount       = EXCLUDED.min_order_amount,
  delivery_fee           = EXCLUDED.delivery_fee,
  estimated_delivery_time = EXCLUDED.estimated_delivery_time,
  opening_hours          = EXCLUDED.opening_hours,
  rating                 = EXCLUDED.rating,
  updated_at             = NOW();

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Driver profile
-- (Only inserted if the corresponding auth.users row exists, because
--  public.drivers.id REFERENCES auth.users(id). After creating the
--  auth.users row in the Dashboard / via Admin API, re-run this file
--  and the public.drivers row will appear.)
-- ════════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE id = '62e81b22-06f3-4217-adad-8839c29d64ff'
  ) THEN
    INSERT INTO public.drivers (
      id, full_name, phone, status, created_at,
      city, is_active, is_available, vehicle_type, is_online
    )
    VALUES (
      '62e81b22-06f3-4217-adad-8839c29d64ff',
      'BlinkGo Driver',
      NULL,
      'active',
      NOW(),
      'Wesseling',
      true,
      true,
      'bike',
      false
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name    = EXCLUDED.full_name,
      status       = EXCLUDED.status,
      city         = EXCLUDED.city,
      is_active    = EXCLUDED.is_active,
      is_available = EXCLUDED.is_available,
      vehicle_type = EXCLUDED.vehicle_type;
  ELSE
    RAISE NOTICE 'public.drivers: skipped — auth.users row for driver not yet created. Re-run this file after creating the auth.users row.';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Self-check
-- ════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  admin_count  INTEGER;
  driver_count INTEGER;
  rest_count   INTEGER;
  rest_table_count INTEGER;
  driver_table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count  FROM public.users WHERE role = 'admin'      AND is_active = true;
  SELECT COUNT(*) INTO driver_count FROM public.users WHERE role = 'driver'     AND is_active = true;
  SELECT COUNT(*) INTO rest_count   FROM public.users WHERE role = 'restaurant' AND is_active = true;
  SELECT COUNT(*) INTO rest_table_count FROM public.restaurants WHERE id = '00000000-0000-0000-0000-000000000020';
  SELECT COUNT(*) INTO driver_table_count FROM public.drivers WHERE id = '62e81b22-06f3-4217-adad-8839c29d64ff';

  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE 'BlinkGo operator seed — self-check';
  RAISE NOTICE '  users.role=admin     active rows: %', admin_count;
  RAISE NOTICE '  users.role=driver    active rows: %', driver_count;
  RAISE NOTICE '  users.role=restaurant active rows: %', rest_count;
  RAISE NOTICE '  restaurants Wesseling row: %', rest_table_count;
  RAISE NOTICE '  drivers profile row:      %', driver_table_count;
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;

COMMIT;
