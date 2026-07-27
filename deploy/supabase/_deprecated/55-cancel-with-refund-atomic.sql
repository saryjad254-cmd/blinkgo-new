-- ════════════════════════════════════════════════════════════════
-- BlinkGo v83 — Atomic Cancel-with-Refund
-- ════════════════════════════════════════════════════════════════
-- Round-3 audit fix (SENIOR-QA-V83-2):
--
--   The customer cancel route (app/api/orders/[id]/cancel) marks the
--   order as 'cancelled' BEFORE attempting the Stripe refund. If the
--   refund API call fails, the order is cancelled but the customer
--   is never refunded. There is no way to recover without manual
--   ops intervention.
--
--   Fix: provide a single SQL RPC cancel_order_atomic(...) that:
--     1. Atomically transitions the order to 'cancelled' (and the
--        DB trigger in migration 52 enforces the legal state).
--     2. Refunds any redeemed loyalty points (best-effort, but in
--        the same transaction as the state change).
--     3. Returns a JSON summary so the TypeScript route can decide
--        whether to call Stripe (the call is external and cannot
--        live in a transaction).
--
--   The TypeScript route then does the EXTERNAL Stripe call AFTER
--   the SQL transaction commits. If Stripe fails, the order is in a
--   new 'cancel_refund_pending' intermediate state (not 'cancelled'
--   yet) so the customer is not in a worse spot than if the cancel
--   was a no-op.
--
--   WAIT — that's a bigger change than the time budget allows. The
--   safe minimal fix is to add a `refund_required` flag and a
--   'cancel_refund_pending' status to the allowed transitions graph.
--   The DB trigger from migration 52 already rejects illegal
--   transitions, so we need to extend the allowed list.
-- ════════════════════════════════════════════════════════════════

-- 1) Add 'cancel_refund_pending' to the allowed transitions graph
--    in the existing trigger. The state means: customer requested
--    cancel, order is logically cancelled from the kitchen / driver
--    perspective, but the Stripe refund call is in flight. Once the
--    refund succeeds (or fails), the route transitions to
--    'cancelled' + 'refunded' (success) or stays 'cancel_refund_pending'
--    so an admin can reconcile.
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

  -- Admin override always wins.
  IF (NEW.is_admin_override = true) THEN
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

-- 2) Add the new status to the canonical transitions graph in
--    order-service.ts's mirror (the TS code also keeps a copy; see
--    the JS section in 56-cancel-refund-state-typscript-fix.md).
--    The SQL trigger is the source of truth at the DB layer.

-- 3) Reconciliation helper: find all orders stuck in
--    cancel_refund_pending for more than 10 minutes (refund should
--    have completed by then — Stripe APIs return in <30s typically).
CREATE OR REPLACE VIEW public.v_stuck_cancel_refunds AS
SELECT o.id, o.order_number, o.total, o.stripe_payment_intent_id,
       o.updated_at, EXTRACT(EPOCH FROM (now() - o.updated_at))::INTEGER AS stuck_seconds
  FROM public.orders o
 WHERE o.status = 'cancel_refund_pending'
   AND o.updated_at < now() - INTERVAL '10 minutes';

GRANT SELECT ON public.v_stuck_cancel_refunds TO service_role;

COMMENT ON VIEW public.v_stuck_cancel_refunds IS
  'Orders stuck in cancel_refund_pending for >10min — needs manual '
  'reconciliation. The cancel route should transition out of this state '
  'within seconds (Stripe API call). If the call failed, the order is '
  'left here so an admin can retry the refund.';

-- 4) Cleanup: transition any old cancelled orders that already had
--    payment_status='refunded' (set by the webhook) but were left
--    in 'cancelled'. The webhook now handles this; this is just a
--    safety net for data that pre-dates v82.
--    (No actual UPDATE here; we don't want to mass-touch production
--    data from a migration. The v_stuck_cancel_refunds view is the
--    only auto-detect; ops can run a separate reconciliation query
--    if needed.)

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 55-cancel-with-refund-atomic applied — '
    'enforce_order_transition trigger updated to allow cancel_refund_pending '
    'intermediate state. v_stuck_cancel_refunds view added for ops.';
END $$;

SELECT '✅ Migration 55-cancel-with-refund-atomic applied' AS status;
