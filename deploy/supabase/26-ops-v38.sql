-- v38 — Restaurant + Admin Operations Perfection
-- ─────────────────────────────────────────────
-- New columns + tables for operations platform

-- Add operations columns to restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS busy_mode boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS busy_mode_until timestamptz,
  ADD COLUMN IF NOT EXISTS max_concurrent_orders integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS avg_preparation_minutes numeric(5,2) DEFAULT 0;

-- Add cancellation reason to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by text,  -- 'customer' | 'restaurant' | 'driver' | 'admin' | 'system'
  ADD COLUMN IF NOT EXISTS last_status_change_at timestamptz DEFAULT now();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON public.orders (restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by ON public.orders (cancelled_by) WHERE cancelled_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_status ON public.orders (customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_driver_status ON public.orders (driver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_picked_up_delivered ON public.orders (picked_up_at, delivered_at) WHERE status = 'delivered';

CREATE INDEX IF NOT EXISTS idx_restaurants_is_paused ON public.restaurants (is_paused) WHERE is_paused = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_is_active_paused ON public.restaurants (is_active, is_paused);

-- Order timeline / status history table
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  changed_by_role text,
  note text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history (order_id, created_at DESC);

-- Restaurant announcements / broadcasts
CREATE TABLE IF NOT EXISTS public.restaurant_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  is_active boolean DEFAULT true,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_restaurant_announcements_active ON public.restaurant_announcements (restaurant_id, is_active, starts_at, ends_at);

-- Bulk product operations log
CREATE TABLE IF NOT EXISTS public.product_bulk_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  operation text NOT NULL,  -- 'activate' | 'deactivate' | 'delete' | 'update_price' | 'update_category'
  affected_count integer NOT NULL,
  filters jsonb,
  performed_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Driver payouts
CREATE TABLE IF NOT EXISTS public.driver_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_orders integer DEFAULT 0,
  total_base numeric(10,2) DEFAULT 0,
  total_tips numeric(10,2) DEFAULT 0,
  total_payout numeric(10,2) DEFAULT 0,
  status text DEFAULT 'pending',  -- 'pending' | 'processing' | 'paid' | 'failed'
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver ON public.driver_payouts (driver_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_status ON public.driver_payouts (status);

-- Restaurant payouts
CREATE TABLE IF NOT EXISTS public.restaurant_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_orders integer DEFAULT 0,
  total_subtotal numeric(10,2) DEFAULT 0,
  total_commission numeric(10,2) DEFAULT 0,
  total_payout numeric(10,2) DEFAULT 0,
  status text DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_restaurant_payouts_restaurant ON public.restaurant_payouts (restaurant_id, period_start DESC);

-- Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_name text,
  actor_role text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  metadata jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON public.admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON public.admin_audit_log (resource_type, resource_id, created_at DESC);

-- Sessions table for activity tracking
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip_address text,
  user_agent text,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions (user_id, last_seen DESC);

-- Order reassignment log (for admin manual reassign)
CREATE TABLE IF NOT EXISTS public.order_reassignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_driver_id uuid,
  to_driver_id uuid NOT NULL,
  reassigned_by uuid NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_reassignments_order ON public.order_reassignments (order_id, created_at DESC);

-- Restaurant activity timeline (for activity feed)
CREATE TABLE IF NOT EXISTS public.restaurant_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  type text NOT NULL,  -- 'order_accepted' | 'order_rejected' | 'menu_updated' | 'settings_changed' | etc
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_restaurant_activity_recent ON public.restaurant_activity (restaurant_id, created_at DESC);

-- Helper view for restaurant daily stats
CREATE OR REPLACE VIEW public.restaurant_daily_stats AS
SELECT
  restaurant_id,
  date_trunc('day', created_at)::date AS day,
  count(*) AS total_orders,
  count(*) FILTER (WHERE status = 'delivered') AS completed_orders,
  count(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
  sum(total) FILTER (WHERE status = 'delivered') AS total_revenue,
  sum(delivery_fee) FILTER (WHERE status = 'delivered') AS total_delivery_fees,
  sum(tip) FILTER (WHERE status = 'delivered') AS total_tips,
  avg(EXTRACT(EPOCH FROM (prepared_at - accepted_at)) / 60) FILTER (WHERE prepared_at IS NOT NULL AND accepted_at IS NOT NULL) AS avg_prep_minutes
FROM public.orders
WHERE created_at >= now() - interval '90 days'
GROUP BY restaurant_id, day;

-- Driver activity view
CREATE OR REPLACE VIEW public.driver_daily_stats AS
SELECT
  driver_id,
  date_trunc('day', created_at)::date AS day,
  count(*) FILTER (WHERE status = 'delivered') AS completed_deliveries,
  count(*) FILTER (WHERE status = 'cancelled') AS cancelled_deliveries,
  sum(delivery_fee) FILTER (WHERE status = 'delivered') AS total_delivery_fees,
  sum(tip) FILTER (WHERE status = 'delivered') AS total_tips,
  avg(EXTRACT(EPOCH FROM (delivered_at - picked_up_at)) / 60) FILTER (WHERE delivered_at IS NOT NULL AND picked_up_at IS NOT NULL) AS avg_delivery_minutes
FROM public.orders
WHERE driver_id IS NOT NULL AND created_at >= now() - interval '90 days'
GROUP BY driver_id, day;

-- Trigger: log status changes to order_status_history
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by_role, note)
    VALUES (NEW.id, NULL, NEW.status, 'system', 'order created');
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by_role, note)
    VALUES (NEW.id, OLD.status, NEW.status,
      COALESCE(NEW.cancelled_by, 'system'),
      NEW.cancellation_reason);
    NEW.last_status_change_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_order_status_change ON public.orders;
CREATE TRIGGER trg_log_order_status_change
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

-- Helper function: get nearby active drivers (Haversine)
CREATE OR REPLACE FUNCTION public.get_nearby_drivers_v2(
  lat numeric, lng numeric, radius_km numeric DEFAULT 5
)
RETURNS TABLE (
  driver_id uuid,
  distance_km numeric,
  latitude numeric,
  longitude numeric,
  is_online boolean,
  is_on_delivery boolean,
  current_order_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.driver_id,
    (6371 * 2 * atan2(
      sqrt(power(sin(radians(ds.latitude - lat) / 2), 2) +
           cos(radians(lat)) * cos(radians(ds.latitude)) *
           power(sin(radians(ds.longitude - lng) / 2), 2)),
      sqrt(1 - (power(sin(radians(ds.latitude - lat) / 2), 2) +
                cos(radians(lat)) * cos(radians(ds.latitude)) *
                power(sin(radians(ds.longitude - lng) / 2), 2)))
    ))::numeric AS distance_km,
    ds.latitude,
    ds.longitude,
    ds.is_online,
    COALESCE(ds.is_on_delivery, false) AS is_on_delivery,
    ds.current_order_id
  FROM public.driver_status ds
  WHERE ds.is_online = true
    AND COALESCE(ds.is_on_delivery, false) = false
    AND ds.latitude IS NOT NULL
    AND ds.longitude IS NOT NULL
    AND (6371 * 2 * atan2(
        sqrt(power(sin(radians(ds.latitude - lat) / 2), 2) +
             cos(radians(lat)) * cos(radians(ds.latitude)) *
             power(sin(radians(ds.longitude - lng) / 2), 2)),
        sqrt(1 - (power(sin(radians(ds.latitude - lat) / 2), 2) +
                  cos(radians(lat)) * cos(radians(ds.latitude)) *
                  power(sin(radians(ds.longitude - lng) / 2), 2)))
      )) <= radius_km
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;

-- Helper function: restaurant stats
CREATE OR REPLACE FUNCTION public.get_restaurant_stats_v2(rest_id uuid)
RETURNS TABLE (
  total_orders bigint,
  completed bigint,
  cancelled bigint,
  total_revenue numeric,
  today_orders bigint,
  today_revenue numeric,
  avg_prep_min numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    count(*)::bigint AS total_orders,
    count(*) FILTER (WHERE status = 'delivered')::bigint AS completed,
    count(*) FILTER (WHERE status = 'cancelled')::bigint AS cancelled,
    coalesce(sum(total) FILTER (WHERE status = 'delivered'), 0)::numeric AS total_revenue,
    count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::bigint AS today_orders,
    coalesce(sum(total) FILTER (WHERE status = 'delivered' AND created_at >= date_trunc('day', now())), 0)::numeric AS today_revenue,
    coalesce(avg(EXTRACT(EPOCH FROM (prepared_at - accepted_at)) / 60)
      FILTER (WHERE prepared_at IS NOT NULL AND accepted_at IS NOT NULL), 0)::numeric AS avg_prep_min
  FROM public.orders
  WHERE restaurant_id = rest_id;
END;
$$ LANGUAGE plpgsql;

-- RLS: admins see everything; restaurant owners see their own data
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_payouts ENABLE ROW LEVEL SECURITY;

-- Service role has full access; RLS policies use auth.uid() with role checks.
-- For now, allow service_role to bypass (we use service-role client server-side).
DROP POLICY IF EXISTS admin_audit_service ON public.admin_audit_log;
CREATE POLICY admin_audit_service ON public.admin_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS driver_payouts_service ON public.driver_payouts;
CREATE POLICY driver_payouts_service ON public.driver_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS restaurant_payouts_service ON public.restaurant_payouts;
CREATE POLICY restaurant_payouts_service ON public.restaurant_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- (Order status history, restaurant announcements, bulk operations, reassignments, activity,
--  and sessions are server-managed. RLS is permissive for service_role only.)
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bulk_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_reassignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
-- v40 — Missing tables discovered during QA (favorites, recently_viewed, login_attempts,
-- email_otps, api_audit_log, active_sessions) and account-lockout fields.
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

DROP POLICY IF EXISTS order_status_history_service ON public.order_status_history;
CREATE POLICY order_status_history_service ON public.order_status_history FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS restaurant_announcements_service ON public.restaurant_announcements;
CREATE POLICY restaurant_announcements_service ON public.restaurant_announcements FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS product_bulk_operations_service ON public.product_bulk_operations;
CREATE POLICY product_bulk_operations_service ON public.product_bulk_operations FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS order_reassignments_service ON public.order_reassignments;
CREATE POLICY order_reassignments_service ON public.order_reassignments FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS restaurant_activity_service ON public.restaurant_activity;
CREATE POLICY restaurant_activity_service ON public.restaurant_activity FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS user_sessions_service ON public.user_sessions;
CREATE POLICY user_sessions_service ON public.user_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── v39 — Security hardening tables (OTP store) ───
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

-- API audit log (CRUD events for security investigations)
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

-- Login attempts log (per-email, for security)
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

-- Active sessions (for "active devices" feature and forced logout)
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
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

-- Account lockout (per-user)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS failed_login_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_failed_login_at timestamptz;
