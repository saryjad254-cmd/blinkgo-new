-- v40 — Critical Tables discovered missing during QA
-- ───────────────────────────────────────────────────────
-- Adds tables that the application code expects but were never
-- created in any prior migration.

-- 1) Favorites
CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, restaurant_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON public.favorites (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_restaurant ON public.favorites (restaurant_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS favorites_user_read ON public.favorites;
CREATE POLICY favorites_user_read ON public.favorites FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS favorites_user_write ON public.favorites;
CREATE POLICY favorites_user_write ON public.favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS favorites_service ON public.favorites;
CREATE POLICY favorites_service ON public.favorites FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Recently viewed
CREATE TABLE IF NOT EXISTS public.recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  viewed_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON public.recently_viewed (user_id, viewed_at DESC);

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recently_viewed_user ON public.recently_viewed;
CREATE POLICY recently_viewed_user ON public.recently_viewed FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS recently_viewed_service ON public.recently_viewed;
CREATE POLICY recently_viewed_service ON public.recently_viewed FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Account lockout fields on users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS failed_login_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_failed_login_at timestamptz;

-- 4) Customer addresses (if missing)
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  address text NOT NULL,
  lat numeric(10,7),
  lng numeric(10,7),
  door text,
  floor text,
  instructions text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON public.customer_addresses (customer_id, is_default DESC, created_at DESC);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_addresses_all ON public.customer_addresses;
CREATE POLICY customer_addresses_all ON public.customer_addresses FOR ALL TO authenticated USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS customer_addresses_service ON public.customer_addresses;
CREATE POLICY customer_addresses_service ON public.customer_addresses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) Login attempts (security log)
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid,
  ip_address text,
  user_agent text,
  success boolean NOT NULL,
  failure_reason text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON public.login_attempts (ip_address, created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS login_attempts_service ON public.login_attempts;
CREATE POLICY login_attempts_service ON public.login_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) Active sessions (for active-devices feature + forced logout)
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL,
  ip_address text,
  user_agent text,
  device_info text,
  is_revoked boolean DEFAULT false,
  revoked_at timestamptz,
  revoked_reason text,
  last_used_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON public.active_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON public.active_sessions (refresh_token_hash) WHERE is_revoked = false;

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS active_sessions_service ON public.active_sessions;
CREATE POLICY active_sessions_service ON public.active_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7) Email OTPs (for v39 OTP store)
CREATE TABLE IF NOT EXISTS public.email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid,
  code_hash text NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_lookup ON public.email_otps (email, purpose, used_at, expires_at DESC);

ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_otps_service ON public.email_otps;
CREATE POLICY email_otps_service ON public.email_otps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8) API audit log
CREATE TABLE IF NOT EXISTS public.api_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_address text,
  user_agent text,
  method text,
  path text,
  status_code integer,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_audit_user ON public.api_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_audit_path ON public.api_audit_log (path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_audit_ip ON public.api_audit_log (ip_address, created_at DESC);

ALTER TABLE public.api_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_audit_log_service ON public.api_audit_log;
CREATE POLICY api_audit_log_service ON public.api_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9) Push notification subscriptions (referenced in code)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  device_info text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions (user_id) WHERE is_active = true;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subs_user ON public.push_subscriptions;
CREATE POLICY push_subs_user ON public.push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS push_subs_service ON public.push_subscriptions;
CREATE POLICY push_subs_service ON public.push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
