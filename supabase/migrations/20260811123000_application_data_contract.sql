-- Canonical data contract required by the BlinkGo application repositories.
-- This reconciles historical naming drift without deleting existing columns.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core compatibility columns used by current API routes and repository code.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rating numeric(3,2) NOT NULL DEFAULT 0;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS total_deliveries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_lat numeric,
  ADD COLUMN IF NOT EXISTS current_lng numeric,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS zone_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_unique
  ON public.drivers(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.driver_status
  ADD COLUMN IF NOT EXISTS active_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_lat numeric,
  ADD COLUMN IF NOT EXISTS current_lng numeric,
  ADD COLUMN IF NOT EXISTS bearing numeric,
  ADD COLUMN IF NOT EXISTS last_location_lat numeric,
  ADD COLUMN IF NOT EXISTS last_location_lng numeric,
  ADD COLUMN IF NOT EXISTS last_location_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.sync_driver_status_compat()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.current_order_id := COALESCE(NEW.current_order_id, NEW.active_order_id);
  NEW.active_order_id := NEW.current_order_id;
  NEW.latitude := COALESCE(NEW.latitude, NEW.current_lat, NEW.last_location_lat);
  NEW.longitude := COALESCE(NEW.longitude, NEW.current_lng, NEW.last_location_lng);
  NEW.current_lat := NEW.latitude;
  NEW.current_lng := NEW.longitude;
  NEW.last_location_lat := NEW.latitude;
  NEW.last_location_lng := NEW.longitude;
  NEW.last_location_at := COALESCE(NEW.last_location_at, NEW.updated_at, now());
  NEW.heading := COALESCE(NEW.heading, NEW.bearing);
  NEW.bearing := NEW.heading;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_driver_status_compat ON public.driver_status;
CREATE TRIGGER trg_driver_status_compat BEFORE INSERT OR UPDATE ON public.driver_status
FOR EACH ROW EXECUTE FUNCTION public.sync_driver_status_compat();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_instructions text,
  ADD COLUMN IF NOT EXISTS restaurant_latitude numeric,
  ADD COLUMN IF NOT EXISTS restaurant_longitude numeric,
  ADD COLUMN IF NOT EXISTS customer_latitude numeric,
  ADD COLUMN IF NOT EXISTS customer_longitude numeric,
  ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avg_prep_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS prep_variance_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS total_orders integer NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS modifiers jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS min_order_amount numeric,
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS max_uses integer,
  ADD COLUMN IF NOT EXISTS current_uses integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_coupon_compat()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.discount_type := COALESCE(NEW.discount_type, NEW.type);
  NEW.type := NEW.discount_type;
  NEW.discount_value := COALESCE(NEW.discount_value, NEW.value);
  NEW.value := NEW.discount_value;
  NEW.min_order := COALESCE(NEW.min_order, NEW.min_order_amount, 0);
  NEW.min_order_amount := NEW.min_order;
  NEW.usage_limit := COALESCE(NEW.usage_limit, NEW.max_uses);
  NEW.max_uses := NEW.usage_limit;
  NEW.usage_count := COALESCE(NEW.usage_count, NEW.current_uses, 0);
  NEW.current_uses := NEW.usage_count;
  NEW.valid_from := COALESCE(NEW.valid_from, NEW.start_date, now());
  NEW.start_date := NEW.valid_from;
  NEW.valid_until := COALESCE(NEW.valid_until, NEW.end_date);
  NEW.end_date := NEW.valid_until;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_coupon_compat ON public.coupons;
CREATE TRIGGER trg_coupon_compat BEFORE INSERT OR UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.sync_coupon_compat();

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS price numeric(10,2),
  ADD COLUMN IF NOT EXISTS unit_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS category text;

CREATE OR REPLACE FUNCTION public.sync_order_item_compat()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.product_name := COALESCE(NEW.product_name, NEW.name);
  NEW.name := NEW.product_name;
  NEW.product_price := COALESCE(NEW.product_price, NEW.price, NEW.unit_price);
  NEW.price := NEW.product_price;
  NEW.unit_price := NEW.product_price;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_order_item_compat ON public.order_items;
CREATE TRIGGER trg_order_item_compat BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_compat();

-- Customer and operational tables referenced by the current application.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, actor_email text, action text, target_type text, target_id text,
  event_type text, severity text, user_id uuid, user_email text, user_role text,
  ip_address text, user_agent text, resource text, resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 99),
  variant_ids uuid[] NOT NULL DEFAULT '{}', extra_ids uuid[] NOT NULL DEFAULT '{}',
  notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, customer_id, order_id)
);

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id text PRIMARY KEY, type text NOT NULL, name text NOT NULL, email text NOT NULL,
  account_email text, details text, ip text, user_agent text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected')),
  handled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  handled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), driver_id uuid NOT NULL,
  lat numeric NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric NOT NULL CHECK (lng BETWEEN -180 AND 180),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), driver_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL, end_time time NOT NULL, is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(driver_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.driver_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), driver_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  tip_cents integer NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  delivery_fee_cents integer NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR', earned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
  description text, schedule text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz, next_run_at timestamptz, last_status text,
  last_error text, run_count integer NOT NULL DEFAULT 0, failure_count integer NOT NULL DEFAULT 0,
  avg_duration_ms integer, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL, completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0), status text NOT NULL,
  error text, result jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_config (
  id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true,
  earn_rate_eur_per_point numeric NOT NULL DEFAULT 1,
  redeem_rate_points_per_eur numeric NOT NULL DEFAULT 100,
  min_redeem_points integer NOT NULL DEFAULT 100,
  program_name text NOT NULL DEFAULT 'BlinkGo Rewards', terms_url text NOT NULL DEFAULT '/legal/loyalty',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.loyalty_config(id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe', provider_payment_method_id text,
  type text NOT NULL, last4 text, brand text, exp_month integer, exp_year integer,
  is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL, price_adjustment numeric(10,2) NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false, is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL, price_adjustment numeric(10,2) NOT NULL DEFAULT 0,
  max_choices integer NOT NULL DEFAULT 1 CHECK (max_choices > 0), sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.search_analytics_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  type text NOT NULL, query text NOT NULL, result_id text, result_type text, result_count integer,
  filter_cuisine text, filter_sort text, session_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.search_analytics_aggregates (
  event_type text NOT NULL, query text NOT NULL, count bigint NOT NULL DEFAULT 0,
  last_seen timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_type, query)
);

CREATE OR REPLACE FUNCTION public.aggregate_search_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE aggregate_key text;
BEGIN
  aggregate_key := CASE WHEN NEW.type IN ('search_to_restaurant','search_to_product')
    THEN COALESCE(NEW.result_id, NEW.query) ELSE NEW.query END;
  INSERT INTO public.search_analytics_aggregates(event_type, query, count, last_seen)
  VALUES (NEW.type, aggregate_key, 1, NEW.created_at)
  ON CONFLICT(event_type, query) DO UPDATE
    SET count = public.search_analytics_aggregates.count + 1, last_seen = EXCLUDED.last_seen;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_aggregate_search_event ON public.search_analytics_events;
CREATE TRIGGER trg_aggregate_search_event AFTER INSERT ON public.search_analytics_events
FOR EACH ROW EXECUTE FUNCTION public.aggregate_search_event();

CREATE TABLE IF NOT EXISTS public.stripe_payment_intents (
  id text PRIMARY KEY, customer_id uuid, draft_id text, amount_cents bigint,
  currency text NOT NULL DEFAULT 'EUR', status text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  message text NOT NULL, subject text, body text, status text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0), currency text NOT NULL DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes used by current hot paths.
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_recorded ON public.driver_locations(driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_working_hours_driver ON public.driver_working_hours(driver_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_customer ON public.coupon_usages(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_views_user ON public.product_views(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_type_created ON public.search_analytics_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_started ON public.job_runs(job_id, started_at DESC);

-- Every newly introduced table is RLS protected. Service routes own writes.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'audit_log','cart_items','coupon_usages','data_subject_requests','driver_locations',
    'driver_working_hours','driver_earnings','jobs','job_runs','loyalty_config','payment_methods',
    'product_variants','product_extras','product_views','search_analytics_events',
    'search_analytics_aggregates','stripe_payment_intents','support_messages','wallets'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON public.%I', table_name);
    EXECUTE format('CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END;
$$;

CREATE POLICY cart_items_self ON public.cart_items FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY payment_methods_self_read ON public.payment_methods FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY product_views_self ON public.product_views FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY wallets_self_read ON public.wallets FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY working_hours_self_read ON public.driver_working_hours FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = driver_id);
CREATE POLICY driver_locations_self_read ON public.driver_locations FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = driver_id);
CREATE POLICY driver_earnings_self_read ON public.driver_earnings FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = driver_id);
CREATE POLICY coupon_usages_self_read ON public.coupon_usages FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = customer_id);
CREATE POLICY support_messages_ticket_participant ON public.support_messages FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND (t.user_id = (SELECT auth.uid()) OR t.assigned_to = (SELECT auth.uid()))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT SELECT ON public.payment_methods, public.wallets, public.driver_working_hours,
  public.driver_locations, public.driver_earnings, public.coupon_usages, public.support_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_views TO authenticated;

-- Browser roles never need schema-level bypass capabilities.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

