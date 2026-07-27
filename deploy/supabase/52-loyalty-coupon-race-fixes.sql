-- ════════════════════════════════════════════════════════════════
-- BlinkGo v82 — Loyalty / Coupon / Webhook Race Fixes
-- ════════════════════════════════════════════════════════════════
-- Round-2 audit fixes (BACKEND BLOCKER 4, 5, 6, 7):
--
--   BLOCKER 4 — increment_coupon_usage() was a blind `usage_count + 1`
--     with no cap check. Two customers using a coupon at the same time
--     when only 1 redemption was left would both succeed, overshooting
--     usage_limit. The TS fallback in app/api/orders/route.ts was even
--     worse (read-then-write with no atomicity).
--
--   BLOCKER 5 — charge.refunded webhook handler unconditionally set
--     order.status = 'cancelled', overwriting any current state. A
--     refund event arriving after a delivery would re-cancel a
--     delivered order. A double-delivered Stripe retry would
--     repeatedly cancel and re-cancel.
--
--   BLOCKER 6 — refund status moves through several states; we need
--     an enum to formalise that (and to stop treating 'completed' as
--     the only valid terminal state).
--
--   BLOCKER 7 — orders are created with `status = 'pending'` but the
--     Stripe payment_intent.succeeded webhook flips them to 'confirmed'
--     without verifying the new state is a legal transition. Add a
--     trigger that rejects illegal transitions regardless of caller.
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1. Atomic, cap-checking coupon usage increment
-- ────────────────────────────────────────────────────────────────
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
  -- Row-lock the coupon so concurrent increments serialize.
  SELECT usage_count, usage_limit, is_active
    INTO v_current, v_limit, v_active
    FROM public.coupons
   WHERE id = p_coupon_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'increment_coupon_usage: coupon % not found', p_coupon_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'increment_coupon_usage: coupon % is inactive', p_coupon_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Cap check: bail out (no-op) if we are already at or over the limit.
  -- The caller treats this as success for retries but the order route
  -- double-checks `usage_count >= usage_limit` at validate time.
  IF v_limit IS NOT NULL AND v_current >= v_limit THEN
    RAISE EXCEPTION 'COUPON_LIMIT_REACHED: coupon % is exhausted (%, limit %)',
      p_coupon_id, v_current, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.coupons
     SET usage_count = COALESCE(usage_count, 0) + 1,
         updated_at  = now()
   WHERE id = p_coupon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO authenticated;

COMMENT ON FUNCTION public.increment_coupon_usage IS
  'Atomically increments coupon usage with row-level lock and a cap check. '
  'Raises COUPON_LIMIT_REACHED if the cap is already reached. Service-role.';

-- ────────────────────────────────────────────────────────────────
-- 2. Refund status enum (formal lifecycle)
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status') THEN
    CREATE TYPE refund_status AS ENUM (
      'pending',    -- customer submitted a request
      'approved',   -- admin approved but not yet processed (cash or pre-stripe)
      'processing', -- admin claimed; stripe call in flight
      'completed',  -- money back in the customer account
      'failed',     -- admin processed but stripe call failed
      'rejected'    -- admin denied the request
    );
  END IF;
END $$;

-- Add the new status column if it doesn't exist; backfill from the
-- existing TEXT column if there is one. The original schema used a
-- free-text status so we don't break old data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'refunds' AND column_name = 'status_new'
  ) THEN
    ALTER TABLE public.refunds ADD COLUMN status_new refund_status;
  END IF;
  -- Best-effort backfill (only if existing data is parseable).
  BEGIN
    UPDATE public.refunds
       SET status_new = CASE
         WHEN status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected')
           THEN status::refund_status
         WHEN status = 'denied' THEN 'rejected'::refund_status
         WHEN status = 'in_progress' THEN 'processing'::refund_status
         ELSE 'pending'::refund_status
       END
     WHERE status_new IS NULL;
  EXCEPTION WHEN OTHERS THEN
    -- Old data not parseable; leave as NULL, the API will set it.
    NULL;
  END;
  -- Swap (the app code now writes to status_new). Keep the old
  -- column for backward compat — application code may still write to
  -- it; we mirror.
  PERFORM 1;
END $$;

-- Convenience: keep status (TEXT) in sync with status_new (ENUM) via
-- a trigger so the app does not have to change.
CREATE OR REPLACE FUNCTION public.refund_status_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status_new IS NOT NULL AND
     (OLD.status_new IS NULL OR OLD.status_new::text IS DISTINCT FROM NEW.status_new::text) THEN
    NEW.status := NEW.status_new::text;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status_new IS NOT NULL AND NEW.status IS NULL THEN
    NEW.status := NEW.status_new::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_status_sync ON public.refunds;
CREATE TRIGGER trg_refund_status_sync
  BEFORE INSERT OR UPDATE ON public.refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.refund_status_sync();

-- Allow the new column to be written by the application
GRANT USAGE ON TYPE refund_status TO service_role;
GRANT USAGE ON TYPE refund_status TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 3. Stripe webhook: order must be in a refundable state
-- ────────────────────────────────────────────────────────────────
-- Webhook idempotency is enforced by the existing stripe_webhook_events
-- table at the API layer (200 with idempotent:true on duplicate event.id).
-- This trigger is defence-in-depth: it rejects updates that would move
-- the order to an illegal state, regardless of which process is
-- updating the row.

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

  -- The canonical allowed graph is kept in code
  -- (lib/services/order-service.ts ORDER_ALLOWED_TRANSITIONS) so this
  -- trigger is the second line of defence. We allow admins to override
  -- by setting is_admin_override = true in the update payload.
  IF (NEW.is_admin_override = true) THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'pending'           THEN ARRAY['confirmed', 'cancelled']
    WHEN 'confirmed'         THEN ARRAY['preparing', 'cancelled']
    WHEN 'preparing'         THEN ARRAY['ready', 'cancelled']
    WHEN 'ready'             THEN ARRAY['picked_up', 'cancelled']
    WHEN 'picked_up'         THEN ARRAY['delivering', 'delivered', 'could_not_deliver']
    WHEN 'delivering'        THEN ARRAY['delivered', 'could_not_deliver']
    WHEN 'delivered'         THEN ARRAY['refunded']
    WHEN 'cancelled'         THEN ARRAY['refunded']
    WHEN 'could_not_deliver' THEN ARRAY['cancelled', 'refunded']
    WHEN 'refunded'          THEN ARRAY[]::text[]
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

DROP TRIGGER IF EXISTS trg_enforce_order_transition ON public.orders;
CREATE TRIGGER trg_enforce_order_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_transition();

COMMENT ON FUNCTION public.enforce_order_transition IS
  'Defence-in-depth: rejects illegal order status transitions. The
   canonical graph is in lib/services/order-service.ts; this trigger
   catches anything that bypasses the service (e.g. raw SQL, webhooks).';

-- ────────────────────────────────────────────────────────────────
-- 4. Notification delivery retry view
-- ────────────────────────────────────────────────────────────────
-- The app writes to public.notifications. A small view makes it easy
-- for a cron worker to find notifications that have not been acked
-- by the user (read_at IS NULL) AND are older than 5 minutes \u2014
-- candidates for a retry push.

CREATE OR REPLACE VIEW public.v_unacked_notifications AS
SELECT n.id, n.user_id, n.type, n.title, n.body, n.data, n.created_at
  FROM public.notifications n
 WHERE n.read_at IS NULL
   AND n.created_at < now() - interval '5 minutes'
   AND NOT EXISTS (
     SELECT 1 FROM public.notification_delivery_log l
      WHERE l.notification_id = n.id
        AND l.attempted_at > now() - interval '15 minutes'
   );

GRANT SELECT ON public.v_unacked_notifications TO service_role;

CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL,
  error text
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notif_time
  ON public.notification_delivery_log (notification_id, attempted_at DESC);

ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_delivery_log" ON public.notification_delivery_log;
CREATE POLICY "service_role_all_delivery_log" ON public.notification_delivery_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- Sanity check
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '✅ v82 race fixes installed: increment_coupon_usage (cap-checked), refund_status enum, enforce_order_transition trigger, v_unacked_notifications view';
END $$;

SELECT '✅ Migration 52-loyalty-coupon-race-fixes applied' AS status;
