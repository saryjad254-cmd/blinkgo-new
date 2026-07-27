-- ════════════════════════════════════════════════════════════════
-- BlinkGo v82 — Scheduled Orders Background Worker
-- ════════════════════════════════════════════════════════════════
-- Workflow audit fix (SENIOR-QA-8):
--
--   Scheduled orders are accepted at /api/orders (with `scheduled_for`)
--   but nothing ever fires them. The order sits in 'pending' forever
--   until the customer manually re-opens the cart and pays.
--
--   This migration:
--   1. Provides a `dispatch_scheduled_orders()` function that finds
--      all orders where scheduled_for <= now() AND status = 'pending'
--      AND payment_status IN ('paid', 'succeeded') and transitions
--      them to 'confirmed' (so the restaurant can start preparing).
--   2. Creates a pg_cron job (if available) that runs every minute.
--   3. Falls back to a HTTP trigger via /api/cron/scheduled-orders
--      for installations that don't have pg_cron enabled.
-- ════════════════════════════════════════════════════════════════

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
  v_grace CONSTANT INTERVAL := INTERVAL '2 minutes'; -- allow up to 2 min late
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
      -- Only fire once: skip orders that have already been picked up
      -- by the dispatch loop on a previous run.
      AND NOT EXISTS (
        SELECT 1 FROM public.order_tracking_events e
        WHERE e.order_id = o.id
          AND e.event_type = 'scheduled_dispatched'
      )
    ORDER BY o.scheduled_for ASC
    LIMIT 100  -- batch size — keep worker runtime bounded
  ),
  upd AS (
    UPDATE public.orders o
    SET status = 'confirmed',
        accepted_at = v_now,
        updated_at = v_now
    FROM due
    WHERE o.id = due.id
    RETURNING o.id
  )
  SELECT d.id, d.order_number, d.restaurant_id, d.customer_id, d.scheduled_for, d.dispatch_lag_sec
  FROM due d
  INNER JOIN upd ON upd.id = d.id;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_scheduled_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_scheduled_orders() TO service_role;

COMMENT ON FUNCTION public.dispatch_scheduled_orders() IS
  'Finds scheduled orders whose scheduled_for has passed (with a 2-minute ' ||
  'grace window), transitions them from pending → confirmed, and returns ' ||
  'the dispatched orders so the caller can fire notifications.';

-- Try to install a pg_cron job. Many hosted Supabase projects have it
-- enabled; if not, the worker is a no-op and the HTTP fallback
-- (/api/cron/scheduled-orders) is the only trigger.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any prior version of the job to keep this idempotent.
    PERFORM cron.unschedule('blinkgo-scheduled-orders');
    PERFORM cron.schedule(
      'blinkgo-scheduled-orders',
      '* * * * *',  -- every minute
      $cron$SELECT 1 FROM public.dispatch_scheduled_orders();$cron$
    );
    RAISE NOTICE '✅ pg_cron job blinkgo-scheduled-orders installed (every minute)';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — use /api/cron/scheduled-orders (HTTP)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron install skipped: %', SQLERRM;
END $$;

-- Index that makes the worker query O(log n) instead of O(n).
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_dispatch
  ON public.orders (scheduled_for)
  WHERE status = 'pending'
    AND scheduled_for IS NOT NULL;

SELECT '✅ Migration 52-scheduled-orders-cron applied' AS status;
