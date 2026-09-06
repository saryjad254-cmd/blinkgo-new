-- =============================================================================
-- Phase 5: Data Layer Improvements
-- =============================================================================
-- Comprehensive improvements for the data layer:
--   1. Missing performance indexes
--   2. Composite indexes for common query patterns
--   3. Partial unique indexes for "active only" uniqueness
--   4. Soft-delete consistency (deleted_at columns + indexes)
--   5. Optimistic locking columns (version)
--   6. Audit trail triggers
--   7. Updated_at triggers
--   8. Helper functions for common queries
-- =============================================================================

-- ── 1. Performance indexes ──────────────────────────────────────────────────
-- These are missing from the existing schema based on production query patterns.

-- Composite indexes for the most common ORDER BY ... WHERE patterns.
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created
  ON public.orders(customer_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_driver_status_created
  ON public.orders(driver_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created
  ON public.orders(restaurant_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders(status, created_at DESC)
  WHERE deleted_at IS NULL AND status IN ('pending', 'confirmed', 'preparing', 'ready');

CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON public.orders(payment_status)
  WHERE payment_status IS NOT NULL;

-- Restaurants
CREATE INDEX IF NOT EXISTS idx_restaurants_city_active_visible
  ON public.restaurants(city, is_active, is_visible)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_active
  ON public.restaurants(cuisine_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_rating_active
  ON public.restaurants(rating DESC)
  WHERE is_active = true AND is_visible = true AND deleted_at IS NULL;

-- Products
CREATE INDEX IF NOT EXISTS idx_products_restaurant_active
  ON public.products(restaurant_id, is_active, is_available, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_active
  ON public.products(category, is_active)
  WHERE deleted_at IS NULL;

-- Drivers
CREATE INDEX IF NOT EXISTS idx_drivers_user_id
  ON public.drivers(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_online_available
  ON public.drivers(is_online, is_available)
  WHERE is_approved = true;

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON public.users(LOWER(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_active
  ON public.users(role, is_active)
  WHERE deleted_at IS NULL;

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_order_created
  ON public.payments(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON public.payments(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_provider_id
  ON public.payments(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- Driver locations (for tracking)
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_recorded
  ON public.driver_locations(driver_id, recorded_at DESC);

-- Order items
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON public.order_items(product_id);

-- Coupons
CREATE INDEX IF NOT EXISTS idx_coupons_code_active
  ON public.coupons(code)
  WHERE is_active = true AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until >= NOW());

-- ── 2. Partial unique indexes for "active only" uniqueness ──────────────────
-- These prevent duplicate active records while allowing historical duplicates.

-- Only one ACTIVE order can exist per (customer, status='cart')
-- (use case: prevent two open cart orders per customer)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_active_cart
      ON public.orders(customer_id)
      WHERE status = 'pending' AND deleted_at IS NULL;
  END IF;
END $$;

-- Only one active email_otp per email
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_otps'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_email_otp
      ON public.email_otps(email)
      WHERE consumed_at IS NULL AND expires_at > NOW();
  END IF;
END $$;

-- Only one active password_reset token per email
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_password_reset
      ON public.password_reset_tokens(email)
      WHERE consumed_at IS NULL AND expires_at > NOW();
  END IF;
END $$;

-- Only one active magic_link token per email
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'magic_link_tokens'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_magic_link
      ON public.magic_link_tokens(email)
      WHERE consumed_at IS NULL AND expires_at > NOW();
  END IF;
END $$;

-- Only one active idempotency key per (key, scope)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'idempotency_keys'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_idempotency_key
      ON public.idempotency_keys(key, scope)
      WHERE expires_at > NOW();
  END IF;
END $$;

-- ── 3. Add deleted_at to tables that don't have it ──────────────────────────
-- Soft-delete consistency: every business table should support soft-delete.

DO $$
DECLARE
  tables_to_add text[] := ARRAY[
    'payments', 'refunds', 'order_items', 'order_tracking_events',
    'coupons', 'coupon_usages', 'notifications', 'favorites',
    'driver_locations', 'driver_payouts', 'loyalty_transactions',
    'support_tickets', 'support_messages', 'referrals'
  ];
  t text;
  has_col boolean;
BEGIN
  FOREACH t IN ARRAY tables_to_add LOOP
    -- Check if table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      -- Check if deleted_at column exists
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t
          AND column_name = 'deleted_at'
      ) INTO has_col;

      IF NOT has_col THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN deleted_at TIMESTAMPTZ', t);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_deleted_at ON public.%I(deleted_at) WHERE deleted_at IS NULL', t, t);
        RAISE NOTICE 'Added deleted_at to %', t;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── 4. Optimistic locking columns ──────────────────────────────────────────
-- Add `version` column for optimistic locking on critical write paths.

DO $$
DECLARE
  tables_to_add text[] := ARRAY['orders', 'restaurants', 'products', 'users'];
  t text;
  has_col boolean;
BEGIN
  FOREACH t IN ARRAY tables_to_add LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t
          AND column_name = 'version'
      ) INTO has_col;

      IF NOT has_col THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN version INTEGER NOT NULL DEFAULT 1', t);
        RAISE NOTICE 'Added version to %', t;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── 5. Updated_at trigger function ─────────────────────────────────────────
-- Automatically updates updated_at on every UPDATE.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.version IS NOT NULL AND OLD.version IS NOT NULL THEN
    -- Optimistic locking: refuse if version doesn't match
    IF NEW.version != OLD.version THEN
      RAISE EXCEPTION 'optimistic_lock_conflict: version % != current %', NEW.version, OLD.version
        USING ERRCODE = 'serialization_failure';
    END IF;
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
DO $$
DECLARE
  tables_to_update text[] := ARRAY[
    'orders', 'order_items', 'order_tracking_events',
    'restaurants', 'products', 'users',
    'payments', 'refunds', 'notifications', 'coupons',
    'drivers', 'driver_status', 'favorites'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables_to_update LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I', t, t);
      EXECUTE format('CREATE TRIGGER trg_%I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
    END IF;
  END LOOP;
END $$;

-- ── 6. Audit trail function (optional) ─────────────────────────────────────
-- Lightweight audit log for compliance. Writes to audit_log table.

CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  audit_user_id uuid;
  audit_action text;
  audit_row jsonb;
BEGIN
  -- Try to extract user_id from auth context
  BEGIN
    audit_user_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    audit_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    audit_action := 'INSERT';
    audit_row := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    audit_action := 'UPDATE';
    audit_row := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    audit_action := 'DELETE';
    audit_row := to_jsonb(OLD);
  END IF;

  BEGIN
    INSERT INTO public.audit_log (table_name, row_id, action, user_id, changes, created_at)
    VALUES (
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      audit_action,
      audit_user_id,
      audit_row,
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Don't block the original operation if audit fails
    RAISE WARNING 'audit_trigger: %', SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to critical tables (orders, payments, users)
DO $$
DECLARE
  tables_to_audit text[] := ARRAY['orders', 'payments', 'refunds', 'users'];
  t text;
BEGIN
  FOREACH t IN ARRAY tables_to_audit LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) AND EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_log'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_audit ON public.%I', t, t);
      EXECUTE format('CREATE TRIGGER trg_%I_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func()', t, t);
    END IF;
  END LOOP;
END $$;

-- ── 7. Helper functions for common queries ─────────────────────────────────

-- Get the current active driver for a user
CREATE OR REPLACE FUNCTION public.get_active_driver_for_user(p_user_id UUID)
RETURNS UUID AS $$
  SELECT id FROM public.drivers
  WHERE user_id = p_user_id
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Get user's role (for use in RLS policies)
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.users
  WHERE id = p_user_id
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get user's restaurant_id (for restaurant owners)
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id(p_user_id UUID)
RETURNS UUID AS $$
  SELECT id FROM public.restaurants
  WHERE owner_id = p_user_id
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Order total recomputation (used in triggers)
CREATE OR REPLACE FUNCTION public.recalc_order_total(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
  v_subtotal numeric;
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_tip numeric;
  v_discount numeric;
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(price * quantity), 0) INTO v_subtotal
  FROM public.order_items WHERE order_id = p_order_id;

  SELECT delivery_fee, service_fee, tip, discount
    INTO v_delivery_fee, v_service_fee, v_tip, v_discount
  FROM public.orders WHERE id = p_order_id;

  v_total := COALESCE(v_subtotal, 0)
           + COALESCE(v_delivery_fee, 0)
           + COALESCE(v_service_fee, 0)
           + COALESCE(v_tip, 0)
           - COALESCE(v_discount, 0);

  UPDATE public.orders
    SET subtotal = v_subtotal, total = v_total, updated_at = NOW()
    WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate order total when items change
CREATE OR REPLACE FUNCTION public.trg_order_items_recalc()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.recalc_order_total(NEW.order_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_order_total(OLD.order_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
    DROP TRIGGER IF EXISTS trg_order_items_recalc ON public.order_items;
    CREATE TRIGGER trg_order_items_recalc AFTER INSERT OR UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.trg_order_items_recalc();
  END IF;
END $$;

-- ── 8. RLS policy improvements ─────────────────────────────────────────────

-- Enable RLS on any table that doesn't have it
DO $$
DECLARE
  tables_needing_rls text[] := ARRAY[
    'order_items', 'order_tracking_events', 'order_modifications',
    'favorites', 'addresses', 'payment_methods',
    'loyalty_transactions', 'referrals', 'support_messages'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables_needing_rls LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Helper: order belongs to customer
CREATE OR REPLACE FUNCTION public.order_belongs_to_customer(p_order_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND customer_id = p_user_id
  );
$$ LANGUAGE SQL STABLE;

-- Helper: order belongs to driver
CREATE OR REPLACE FUNCTION public.order_belongs_to_driver(p_order_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.drivers d ON d.id = o.driver_id
    WHERE o.id = p_order_id AND d.user_id = p_user_id
  );
$$ LANGUAGE SQL STABLE;

-- Helper: order belongs to restaurant
CREATE OR REPLACE FUNCTION public.order_belongs_to_restaurant(p_order_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.restaurants r ON r.id = o.restaurant_id
    WHERE o.id = p_order_id AND r.owner_id = p_user_id
  );
$$ LANGUAGE SQL STABLE;

-- Helper: user is admin
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND role IN ('admin', 'super_admin')
      AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Standard policy: customer can read their own orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_customer_select'
  ) THEN
    CREATE POLICY orders_customer_select ON public.orders
      FOR SELECT TO authenticated
      USING (customer_id = auth.uid() OR driver_id IN (
        SELECT id FROM public.drivers WHERE user_id = auth.uid()
      ) OR restaurant_id IN (
        SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
      ) OR public.is_admin(auth.uid()));
  END IF;
END $$;

-- ── 9. Cleanup: drop redundant indexes ─────────────────────────────────────
-- These are dropped because the composite indexes above cover them.

DROP INDEX IF EXISTS public.idx_orders_customer_id;
DROP INDEX IF EXISTS public.idx_orders_driver_id;
DROP INDEX IF EXISTS public.idx_orders_restaurant_id;

-- ── 10. ANALYZE for query planner ──────────────────────────────────────────
ANALYZE public.orders;
ANALYZE public.users;
ANALYZE public.restaurants;
ANALYZE public.products;
ANALYZE public.notifications;
ANALYZE public.drivers;
ANALYZE public.payments;

-- =============================================================================
-- End of Phase 5 data layer improvements
-- =============================================================================
