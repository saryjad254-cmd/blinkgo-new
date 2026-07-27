-- ════════════════════════════════════════════════════════════════
-- BlinkGo v83 — Refund Uniqueness + Active Refund RPC
-- ════════════════════════════════════════════════════════════════
-- Round-3 audit fix (SENIOR-QA-V83-1):
--
--   The customer refund request route (app/api/orders/[id]/refund)
--   does a "check then insert" pattern: it queries refunds for an
--   existing row, then inserts a new one. Two parallel requests from
--   the same customer (or one customer + an admin's manual request)
--   can both pass the existence check and both create a refund row,
--   resulting in a duplicate refund attempt against Stripe.
--
--   Fix:
--   1. Add a PARTIAL UNIQUE INDEX on refunds(order_id) WHERE status
--      NOT IN ('rejected', 'failed', 'cancelled') so only one
--      ACTIVE refund request can exist per order. Rejected / failed
--      rows are ignored so the customer can resubmit if the first
--      one was denied.
--   2. Provide an atomic request_refund(p_order_id, p_reason, p_amount)
--      RPC that does the existence check + insert in a single
--      statement, eliminating the read-then-write race entirely.
--   3. Provide a reconcile_refunds() view for the v83 audit script.
--
--   The original refunds.order_id was UNIQUE for a long time then
--   relaxed; the new partial unique index is the correct middle
--   ground (only ACTIVE refunds are unique).
-- ════════════════════════════════════════════════════════════════

-- 1) Partial unique index — one ACTIVE refund request per order.
--    Rejected / failed / cancelled rows are ignored so a customer
--    can submit again after an admin denial or a Stripe failure.
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_active_per_order
  ON public.refunds (order_id)
  WHERE status IS NULL
     OR status NOT IN ('rejected', 'failed', 'cancelled');

-- 2) Atomic request_refund RPC. Replaces the check-then-insert in
--    the TypeScript route. Returns the existing row if one is
--    already active (idempotent) or the newly created row.
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
  -- Lookup the order (for the FK on refunds.order_id) so the
  -- insert doesn't fail with a 23503.
  PERFORM 1 FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_refund: order % not found', p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Check for an existing ACTIVE refund (the partial unique index
  -- also guards this, but a clean existence check gives a friendlier
  -- error before the index trips).
  SELECT id, amount, reason, status INTO v_existing
    FROM public.refunds
   WHERE order_id = p_order_id
     AND (status IS NULL OR status NOT IN ('rejected', 'failed', 'cancelled'))
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing.id,
      p_order_id,
      v_existing.amount,
      v_existing.reason,
      v_existing.status,
      TRUE;
    RETURN;
  END IF;

  -- Create the new refund request. The partial unique index will
  -- catch any race between two concurrent callers.
  INSERT INTO public.refunds (order_id, amount, reason, status, created_at, updated_at)
    VALUES (p_order_id, p_amount, p_reason, 'pending', now(), now())
    RETURNING id INTO v_new_id;

  RETURN QUERY SELECT
    v_new_id,
    p_order_id,
    p_amount,
    p_reason,
    'pending'::TEXT,
    FALSE;
EXCEPTION
  WHEN unique_violation THEN
    -- Two concurrent callers raced us. Re-fetch the winner.
    SELECT id, amount, reason, status INTO v_existing
      FROM public.refunds
     WHERE order_id = p_order_id
       AND (status IS NULL OR status NOT IN ('rejected', 'failed', 'cancelled'))
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT
        v_existing.id,
        p_order_id,
        v_existing.amount,
        v_existing.reason,
        v_existing.status,
        TRUE;
    ELSE
      RAISE;  -- unknown — re-raise
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.request_refund(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.request_refund IS
  'Atomically creates a refund request (or returns the existing active
   request) using a partial unique index to prevent duplicate active
   refunds on the same order. Idempotent on retries. Used by
   /api/orders/[id]/refund. Service-role only.';

-- 3) Reconciliation view for the v83 audit script — surface
--    duplicate ACTIVE refunds (should always be zero rows after this
--    migration is in place) and any past duplicates that escaped the
--    new constraint.
CREATE OR REPLACE VIEW public.v_duplicate_refunds AS
SELECT order_id, COUNT(*) AS active_refund_count
  FROM public.refunds
 WHERE status IS NULL OR status NOT IN ('rejected', 'failed', 'cancelled')
 GROUP BY order_id
HAVING COUNT(*) > 1;

GRANT SELECT ON public.v_duplicate_refunds TO service_role;

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM public.v_duplicate_refunds;
  IF dup_count > 0 THEN
    RAISE NOTICE '⚠️  % orders already have duplicate ACTIVE refunds — '
      'the migration will still install the unique index, but you should '
      'reconcile these manually before the next refund is created.', dup_count;
  ELSE
    RAISE NOTICE '✅ no duplicate active refunds found; index is safe to install';
  END IF;
END $$;

SELECT '✅ Migration 54-refunds-unique-constraint applied' AS status;
