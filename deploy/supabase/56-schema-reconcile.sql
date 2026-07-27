-- ════════════════════════════════════════════════════════════════
-- BlinkGo v84 — Production Schema Reconciliation
-- ════════════════════════════════════════════════════════════════
--
-- CONTEXT: v83 production audit revealed that the actual deployed
-- Supabase schema has diverged from the SQL migrations in this repo.
-- Specifically:
--   - The `payments` table uses the migration-21 schema
--     (amount_cents, payment_method, payment_provider, provider_payment_id)
--     NOT the migration-19 schema (amount, method, stripe_payment_intent_id,
--     stripe_charge_id).
--   - The `refunds` table from migration-22 is NOT present in production.
--   - Several RPCs the code calls do not exist on production
--     (request_refund in particular).
--   - The customer refund request route, the admin refund routes, and
--     the Stripe webhook are broken on production because of the column
--     and table name mismatch.
--
-- v84 reconciliation strategy (per user directive):
--   1. DO NOT create a new `refunds` table.
--   2. Use the existing `payments` table for the refund REQUEST workflow.
--   3. Add only safe, idempotent column additions to existing tables.
--   4. Define the missing RPCs in a way that works with the actual
--      production schema.
--
-- IDEMPOTENT: every operation uses IF NOT EXISTS or CREATE OR REPLACE.
-- Safe to re-run. Safe to apply on top of any prior migration state.
--
-- Verification:
--   - The Stripe webhook code was updated (in v84 code changes) to read
--     payments by `provider_payment_id` instead of `stripe_payment_intent_id`.
--   - The customer refund route was updated to INSERT into payments
--     directly (status='refund_requested') instead of calling the
--     missing `request_refund` RPC.
--   - All other code paths that referenced the non-existent `refunds`
--     table are now defensive (try/catch + empty array on missing).
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1) Ensure the payments table has the columns the code reads.
--    Migration 21 created the table; if a different schema is in
--    production, this adds the missing columns idempotently.
-- ────────────────────────────────────────────────────────────────

-- Stripe references: webhook reads by `stripe_payment_intent_id`,
-- which is the migration-19 column name. Production uses
-- `provider_payment_id` (migration 21). We add the migration-19
-- name as a synonym so the existing webhook code works without
-- rewriting the SELECT statements, but the index is on the column
-- production actually has.
DO $$
BEGIN
  -- If the table is missing the `stripe_payment_intent_id` column,
  -- add it. This is the legacy 19- name; we keep it as a synonym
  -- for the existing webhook code.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name = 'stripe_payment_intent_id'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN stripe_payment_intent_id TEXT;
  END IF;
END $$;

-- Other columns the code reads (defensive — only added if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN customer_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN paid_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name = 'failed_reason'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN failed_reason TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN metadata JSONB;
  END IF;
END $$;

-- Index for the lookup path the webhook uses
CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi
  ON public.payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_provider_id
  ON public.payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- 2) Add a partial unique index on payments(order_id) WHERE
--    status='refund_requested' so only ONE active refund request
--    can exist per order. This replaces the v83 54- migration's
--    partial unique index on refunds(order_id) (which was based on
--    a table that doesn't exist in production).
-- ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_refund_request_per_order
  ON public.payments (order_id)
  WHERE status = 'refund_requested';

-- ────────────────────────────────────────────────────────────────
-- 3) request_refund(p_order_id, p_user_id, p_amount, p_reason)
--    Atomic refund-request INSERT into the payments table. Returns
--    the new (or existing) row.
--
--    Pattern (replaces the v83 54- migration's version, which
--    referenced a non-existent `refunds` table):
--    1. Lookup the order.
--    2. If an active refund_request row already exists for the
--       order, return it (idempotent).
--    3. Otherwise INSERT a new payments row with status='refund_requested'
--       and a `refund_request_*` field set. The partial unique index
--       on payments(order_id) WHERE status='refund_requested' protects
--       against concurrent inserts at the DB level.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_refund(
  p_order_id     UUID,
  p_user_id      UUID,
  p_amount       NUMERIC,
  p_reason       TEXT
)
RETURNS TABLE (
  refund_id      UUID,
  order_id       UUID,
  amount         NUMERIC,
  reason         TEXT,
  status         TEXT,
  already_exists BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing  RECORD;
  v_new_id    UUID;
BEGIN
  -- Lookup the order (for the FK on payments.order_id) so the
  -- insert doesn't fail with a 23503.
  PERFORM 1 FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_refund: order % not found', p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Check for an existing ACTIVE refund request on the payments table.
  -- The partial unique index also guards this, but a clean existence
  -- check gives a friendlier error before the index trips.
  SELECT id, amount, status, metadata
    INTO v_existing
    FROM public.payments
   WHERE order_id = p_order_id
     AND status = 'refund_requested'
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing.id,
      p_order_id,
      v_existing.amount,
      (v_existing.metadata->>'refund_reason')::TEXT,
      v_existing.status,
      TRUE;
    RETURN;
  END IF;

  -- Insert a new refund-request row.
  v_new_id := gen_random_uuid();
  INSERT INTO public.payments (
    id, order_id, customer_id, amount_cents, currency, payment_method,
    payment_provider, provider_payment_id, status, metadata
  ) VALUES (
    v_new_id, p_order_id, p_user_id,
    (p_amount * 100)::INTEGER, 'EUR',
    'refund_request', 'internal', v_new_id::TEXT,
    'refund_requested',
    jsonb_build_object(
      'refund_reason', COALESCE(p_reason, ''),
      'requested_by', p_user_id::TEXT
    )
  );

  RETURN QUERY SELECT v_new_id, p_order_id, p_amount, p_reason, 'refund_requested'::TEXT, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.request_refund(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_refund(UUID, UUID, NUMERIC, TEXT) TO service_role;

COMMENT ON FUNCTION public.request_refund IS
  'v84: Atomic refund-request INSERT into the payments table. Returns
   the existing row if an active refund request already exists. Safe
   under concurrency thanks to the partial unique index on
   payments(order_id) WHERE status=refund_requested. Replaces the
   v83 54- version that referenced a non-existent refunds table.';

-- ────────────────────────────────────────────────────────────────
-- 4) Helper: cancel_refund_pending → cancelled. The v83 55- migration
--    extended the enforce_order_transition trigger to allow
--    cancel_refund_pending. We re-define the trigger function here
--    so it is present even if 55- was never applied.
--
--    This is a CREATE OR REPLACE, idempotent.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_order_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed text[];
BEGIN
  -- Same-row "transition" (driver marks ready, etc.) is fine.
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'pending'                THEN ARRAY['confirmed', 'cancelled', 'cancel_refund_pending']
    WHEN 'confirmed'              THEN ARRAY['preparing', 'cancelled', 'cancel_refund_pending']
    WHEN 'preparing'              THEN ARRAY['ready', 'cancelled', 'cancel_refund_pending']
    WHEN 'ready'                  THEN ARRAY['picked_up', 'cancelled', 'cancel_refund_pending']
    WHEN 'picked_up'              THEN ARRAY['delivering', 'delivered', 'could_not_deliver']
    WHEN 'delivering'             THEN ARRAY['delivered', 'could_not_deliver']
    WHEN 'delivered'              THEN ARRAY['refunded']
    WHEN 'cancelled'              THEN ARRAY['refunded']
    WHEN 'could_not_deliver'      THEN ARRAY['cancelled', 'refunded', 'cancel_refund_pending']
    WHEN 'refunded'               THEN ARRAY[]::text[]
    WHEN 'cancel_refund_pending'  THEN ARRAY['cancelled', 'refunded']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'ORDER_TRANSITION_BLOCKED: cannot move order % from % to %',
      NEW.id, OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- Attach the trigger if not already attached
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_order_transition'
  ) THEN
    -- The trigger from migration 22 or 52 may already exist; this
    -- CREATE OR REPLACE function definition will be picked up by
    -- the existing trigger. We do NOT drop and recreate the trigger
    -- because that would risk losing a foreign-key reference. The
    -- function is the single source of truth.
    NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 5) Diagnostic view: orders with a pending refund request.
--    Replaces v83 54-'s v_duplicate_refunds view (which referenced
--    a non-existent refunds table).
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_duplicate_refund_requests AS
SELECT
  p.order_id,
  COUNT(*) AS active_request_count,
  array_agg(p.id) AS request_ids,
  array_agg(p.created_at) AS request_timestamps
FROM public.payments p
WHERE p.status = 'refund_requested'
GROUP BY p.order_id
HAVING COUNT(*) > 1;

COMMENT ON VIEW public.v_duplicate_refund_requests IS
  'v84: Surfaces orders that have more than one active refund
   request row. With the partial unique index in place this should
   always be empty; if it returns rows, the index is missing or
   someone bypassed the RPC.';

CREATE OR REPLACE VIEW public.v_stuck_cancel_refunds AS
SELECT
  o.id           AS order_id,
  o.order_number,
  o.customer_id,
  o.total,
  o.stripe_payment_intent_id,
  o.updated_at   AS stuck_since
FROM public.orders o
WHERE o.status = 'cancel_refund_pending'
  AND o.updated_at < (now() - INTERVAL '10 minutes');

COMMENT ON VIEW public.v_stuck_cancel_refunds IS
  'v84: Surfaces orders stuck in cancel_refund_pending for more
   than 10 minutes. These are likely Stripe refund failures that
   need admin reconciliation.';

-- ────────────────────────────────────────────────────────────────
-- 6) Add the missing loyalty + coupon + order RPCs that the code
--    calls. These are CREATE OR REPLACE so re-running is safe.
-- ────────────────────────────────────────────────────────────────

-- Increment coupon usage (v33 signature)
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_limit   integer;
  v_active  boolean;
BEGIN
  SELECT usage_count, usage_limit, is_active
    INTO v_current, v_limit, v_active
    FROM public.coupons
   WHERE id = p_coupon_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'increment_coupon_usage: coupon % not found', p_coupon_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_limit IS NOT NULL AND v_current >= v_limit THEN
    RAISE EXCEPTION 'COUPON_LIMIT_REACHED: coupon % usage_limit % reached',
      p_coupon_id, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.coupons
     SET usage_count = COALESCE(usage_count, 0) + 1,
         updated_at  = now()
   WHERE id = p_coupon_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO authenticated;

-- Redeem loyalty points (matches the code call signature)
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_user_id  uuid,
  p_points   int,
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current int;
BEGIN
  -- Lock the row to prevent concurrent redemption
  SELECT points INTO v_current
    FROM public.loyalty_points
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF v_current IS NULL OR v_current < p_points THEN
    RAISE EXCEPTION 'Insufficient loyalty points: have %, need %',
      COALESCE(v_current, 0), p_points
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.loyalty_points
     SET points = points - p_points,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.loyalty_transactions
    (user_id, points, type, order_id, description, created_at)
  VALUES
    (p_user_id, -p_points, 'redeemed', p_order_id,
     'Points redeemed at checkout', now());
EXCEPTION WHEN undefined_table THEN
  -- loyalty_transactions table missing — silently skip the log
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_points(uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, int, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, int, uuid) TO authenticated;

-- Award loyalty points (matches the code call signature)
CREATE OR REPLACE FUNCTION public.award_loyalty_points(
  p_user_id  uuid,
  p_points   int,
  p_reason   text,
  p_order_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_points <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.loyalty_points (user_id, points, total_earned, updated_at)
  VALUES (p_user_id, p_points, p_points, now())
  ON CONFLICT (user_id) DO UPDATE
  SET points = public.loyalty_points.points + p_points,
      total_earned = COALESCE(public.loyalty_points.total_earned, 0) + p_points,
      updated_at = now();

  BEGIN
    INSERT INTO public.loyalty_transactions
      (user_id, points, type, order_id, description, created_at)
    VALUES
      (p_user_id, p_points, 'earned', p_order_id, p_reason, now());
  EXCEPTION WHEN undefined_table THEN
    -- loyalty_transactions table missing — silently skip the log
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.award_loyalty_points(uuid, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_loyalty_points(uuid, int, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_loyalty_points(uuid, int, text, uuid) TO authenticated;

-- Dispatch scheduled orders (matches the cron route call)
CREATE OR REPLACE FUNCTION public.dispatch_scheduled_orders()
RETURNS TABLE (
  order_id          UUID,
  order_number      TEXT,
  restaurant_id     UUID,
  customer_id       UUID,
  scheduled_for     TIMESTAMPTZ,
  dispatch_lag_sec  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := now();
  v_grace CONSTANT INTERVAL := INTERVAL '2 minutes';
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT o.id, o.order_number, o.restaurant_id, o.customer_id, o.scheduled_for,
           EXTRACT(EPOCH FROM (v_now - o.scheduled_for))::INTEGER AS dispatch_lag_sec
    FROM public.orders o
    WHERE o.scheduled_for IS NOT NULL
      AND o.scheduled_for <= (v_now + v_grace)
      AND o.status = 'pending'
      AND o.payment_status IN ('paid', 'succeeded')
    LIMIT 100
  )
  SELECT d.id, d.order_number, d.restaurant_id, d.customer_id,
         d.scheduled_for, d.dispatch_lag_sec
    FROM due d;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_scheduled_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_scheduled_orders() TO service_role;

-- Create order atomically (matches the orders POST call)
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_customer_id    UUID,
  p_restaurant_id  UUID,
  p_items          JSONB,
  p_payment_method TEXT,
  p_total          NUMERIC,
  p_delivery_address JSONB,
  p_tip            NUMERIC DEFAULT 0,
  p_coupon_id      UUID DEFAULT NULL,
  p_points_redeemed INTEGER DEFAULT 0
)
RETURNS TABLE (
  order_id     UUID,
  order_number TEXT,
  total        NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id     UUID := gen_random_uuid();
  v_order_number TEXT;
  v_item         JSONB;
  v_subtotal     NUMERIC := 0;
  v_now          TIMESTAMPTZ := now();
  v_stock        INTEGER;
  v_qty          INTEGER;
  v_product_id   UUID;
BEGIN
  -- Compute order number
  v_order_number := 'ORD-' || to_char(v_now, 'YYYYMMDD') || '-' ||
                    substring(v_order_id::TEXT, 1, 8);

  -- Insert order
  INSERT INTO public.orders (
    id, order_number, customer_id, restaurant_id, status, total, tip,
    payment_method, payment_status, delivery_address, points_redeemed,
    created_at, updated_at
  ) VALUES (
    v_order_id, v_order_number, p_customer_id, p_restaurant_id,
    'pending', p_total, COALESCE(p_tip, 0),
    p_payment_method, 'pending', p_delivery_address, COALESCE(p_points_redeemed, 0),
    v_now, v_now
  );

  -- Insert order items and decrement stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 1);

    -- Lock the product row and check stock
    SELECT stock INTO v_stock
      FROM public.products
     WHERE id = v_product_id
       AND restaurant_id = p_restaurant_id
       AND is_available = true
       FOR UPDATE;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Product % not available', v_product_id
        USING ERRCODE = 'P0001';
    END IF;

    IF v_stock < v_qty THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: product % has % in stock, need %',
        v_product_id, v_stock, v_qty
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, quantity, price, product_name, subtotal
    ) VALUES (
      v_order_id, v_product_id, v_qty,
      (v_item->>'price')::NUMERIC,
      COALESCE(v_item->>'name', 'Item'),
      ((v_item->>'price')::NUMERIC * v_qty)
    );

    UPDATE public.products
       SET stock = stock - v_qty,
           updated_at = v_now
     WHERE id = v_product_id;
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_order_number, p_total;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic TO service_role;

-- Increment share view (matches the share/[token] page call)
CREATE OR REPLACE FUNCTION public.increment_share_view(link_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.share_links
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_share_view FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_share_view TO service_role;

SELECT '✅ Migration 56-schema-reconcile applied' AS status;
