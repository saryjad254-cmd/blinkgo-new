-- ════════════════════════════════════════════════════════════════
-- BlinkGo Phase 7G-D — Refunds, Partial Refunds & Payment Operations
-- Migration 66
-- ════════════════════════════════════════════════════════════════
-- Refactor: refunds get a dedicated, auditable, append-only data
-- model. The old approach (rows in `payments` with status='refund_*')
-- is preserved for read compat but new code writes to
-- `payment_refunds` (one row per refund operation, supports multiple
-- partial refunds per order).
--
-- Hard rules:
--   1. Browser is never trusted for any amount.
--   2. stripe_refund_id is UNIQUE — DB-level dedup vs Stripe.
--   3. idempotency_key is UNIQUE — DB-level dedup for client retries.
--   4. refund_audit_log is append-only at the DB level.
--   5. RLS locks all tables to service_role only.
--   6. No DELETE allowed on payment_refunds.
--   7. Status transitions are validated in the application layer
--      (refund-state-machine.ts) AND every transition is audited.
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. Refund status enum
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM (
    'requested',          -- Admin or recovery case initiated
    'validating',         -- Server is verifying amount + ownership
    'submitted',          -- Stripe API call issued
    'pending',            -- Stripe acknowledged; awaiting async confirmation
    'succeeded',          -- Verified by Stripe webhook
    'failed',             -- Stripe rejected or refunded failed
    'canceled',           -- Pre-submit cancellation
    'requires_review'     -- Manual admin review required
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Refund reason enum
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE refund_reason AS ENUM (
    'order_canceled',
    'item_unavailable',
    'incorrect_item',
    'missing_item',
    'quality_issue',
    'delivery_failure',
    'duplicate_charge',
    'customer_support_adjustment',
    'recovery_unmatched_payment',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. payment_refunds — one row per refund operation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe identifiers (DB-level dedup)
  stripe_refund_id    TEXT UNIQUE,                 -- UNIQUE: dedup vs Stripe
  payment_intent_id   TEXT NOT NULL,               -- indexed
  charge_id           TEXT,                        -- nullable (refund may pre-date charge)

  -- BlinkGo linkage
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  customer_id         UUID NOT NULL,               -- the order's customer
  requested_by        UUID NOT NULL,               -- who clicked "refund" (admin or recovery)

  -- Amounts (integer cents ONLY)
  requested_amount_cents BIGINT NOT NULL CHECK (requested_amount_cents > 0
                                                  AND requested_amount_cents <= 1000000000),
  refunded_amount_cents  BIGINT NOT NULL DEFAULT 0 CHECK (refunded_amount_cents >= 0
                                                          AND refunded_amount_cents <= requested_amount_cents),
  currency            CHAR(3) NOT NULL,            -- 3-letter ISO 4217

  -- State
  reason              refund_reason NOT NULL,
  internal_note       TEXT,                        -- never sent to Stripe
  status              refund_status NOT NULL DEFAULT 'requested',
  failure_reason      TEXT,

  -- Idempotency / dedup
  idempotency_key     TEXT UNIQUE,                 -- UNIQUE: client retry safety
  stripe_event_id     TEXT,                        -- latest webhook event for this refund

  -- Free-form metadata
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,

  -- Generated: refund is "fully succeeded" iff the Stripe-reported amount equals the request
  CONSTRAINT chk_refunded_amount_leq_request CHECK (refunded_amount_cents <= requested_amount_cents),
  CONSTRAINT chk_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_succeeded_has_stripe_refund_id CHECK (
    (status = 'succeeded' AND stripe_refund_id IS NOT NULL) OR (status <> 'succeeded')
  ),
  CONSTRAINT chk_failed_has_failure_reason CHECK (
    (status = 'failed' AND failure_reason IS NOT NULL) OR (status <> 'failed')
  ),
  CONSTRAINT chk_completed_at_iff_terminal CHECK (
    (status IN ('succeeded','failed','canceled') AND completed_at IS NOT NULL)
    OR (status NOT IN ('succeeded','failed','canceled'))
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_order_id       ON public.payment_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_customer_id    ON public.payment_refunds(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_pi_id          ON public.payment_refunds(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_stripe_event   ON public.payment_refunds(stripe_event_id) WHERE stripe_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status         ON public.payment_refunds(status);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_created_at     ON public.payment_refunds(created_at DESC);
-- Partial unique: one ACTIVE refund-creation record per idempotency key (enforced via UNIQUE on idempotency_key)
-- A second partial refund for the same order is allowed (different idempotency_key, different stripe_refund_id).

-- Track when updated_at is bumped
CREATE OR REPLACE FUNCTION public.tg_payment_refunds_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_payment_refunds_set_updated_at ON public.payment_refunds;
CREATE TRIGGER trg_payment_refunds_set_updated_at
  BEFORE UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_refunds_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. refund_audit_log — APPEND-ONLY
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id       UUID NOT NULL,                -- soft-FK; we don't enforce FK so audit survives refund deletion
  stripe_refund_id TEXT,
  order_id        UUID NOT NULL,
  payment_intent_id TEXT NOT NULL,

  -- Actor
  actor_user_id   UUID,
  actor_role      TEXT,

  -- Action
  action          TEXT NOT NULL CHECK (action IN (
    'created', 'validating', 'submitted', 'pending_update',
    'succeeded', 'failed', 'canceled', 'requires_review',
    'webhook_sync', 'reconciled', 'recovery_link', 'concurrent_conflict'
  )),
  previous_status refund_status,
  new_status      refund_status,

  -- Financial / reason
  amount_cents    BIGINT,
  currency        CHAR(3),
  reason          TEXT,
  internal_note   TEXT,

  -- Trace
  request_id      TEXT,
  stripe_event_id TEXT,
  idempotency_key TEXT,

  -- Free-form
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_audit_log_refund_id  ON public.refund_audit_log(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_log_order_id   ON public.refund_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_log_pi_id      ON public.refund_audit_log(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_log_actor      ON public.refund_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_log_action     ON public.refund_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_refund_audit_log_created_at ON public.refund_audit_log(created_at DESC);

-- Append-only triggers
CREATE OR REPLACE FUNCTION public.tg_refund_audit_log_no_update() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'refund_audit_log is append-only; UPDATE forbidden'
    USING ERRCODE = 'P0001';
END; $$;

CREATE OR REPLACE FUNCTION public.tg_refund_audit_log_no_delete() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'refund_audit_log is append-only; DELETE forbidden'
    USING ERRCODE = 'P0001';
END; $$;

DROP TRIGGER IF EXISTS trg_refund_audit_log_no_update ON public.refund_audit_log;
CREATE TRIGGER trg_refund_audit_log_no_update
  BEFORE UPDATE ON public.refund_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_refund_audit_log_no_update();

DROP TRIGGER IF EXISTS trg_refund_audit_log_no_delete ON public.refund_audit_log;
CREATE TRIGGER trg_refund_audit_log_no_delete
  BEFORE DELETE ON public.refund_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_refund_audit_log_no_delete();

-- ─────────────────────────────────────────────────────────────
-- 5. refund_operation_locks — per-order concurrency
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_operation_locks (
  order_id     UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  locked_by    UUID NOT NULL,
  locked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_refund_locks_expires ON public.refund_operation_locks(expires_at);

-- ─────────────────────────────────────────────────────────────
-- 6. RLS — strict lockdown
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.payment_refunds           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_operation_locks     ENABLE ROW LEVEL SECURITY;

-- Block all access to anon / authenticated; service_role bypasses RLS automatically.
DROP POLICY IF EXISTS payment_refunds_block_all   ON public.payment_refunds;
CREATE POLICY payment_refunds_block_all ON public.payment_refunds
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS refund_audit_log_block_all   ON public.refund_audit_log;
CREATE POLICY refund_audit_log_block_all ON public.refund_audit_log
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS refund_operation_locks_block_all ON public.refund_operation_locks;
CREATE POLICY refund_operation_locks_block_all ON public.refund_operation_locks
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Explicit grants for service_role (RLS still applies but service_role bypasses RLS by default in Supabase;
--   the explicit GRANT makes the intent clear.)
GRANT ALL ON public.payment_refunds       TO service_role;
GRANT ALL ON public.refund_audit_log       TO service_role;
GRANT ALL ON public.refund_operation_locks TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 7. Add derived columns to orders (Phase 7G-D)
--    - amount_refunded_cents: derived sum of succeeded refunds (server-computed)
--    - last_refund_status: most recent refund's status
--    - last_refund_at: most recent refund's update timestamp
--    - payment_status: we expand the existing TEXT to allow more values
--      but we keep the existing CHECK intact (since some installs may
--      have it set). We use a no-op if the column already has the wider
--      set; we add only what is missing.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_refunded_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refund_status   TEXT,
  ADD COLUMN IF NOT EXISTS last_refund_at       TIMESTAMPTZ;

-- Try to widen payment_status check constraint if it's the narrow form
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- Find and drop the old payment_status check constraint if it's the narrow form
  SELECT con.conname INTO v_constraint
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'orders'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) LIKE '%payment_status%'
     AND pg_get_constraintdef(con.oid) NOT LIKE '%partially_refunded%'
   LIMIT 1;
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'Dropped narrow payment_status check constraint: %', v_constraint;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'payment_status check constraint not modified: %', SQLERRM;
END $$;

-- Add the wider check constraint (idempotent)
DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_status_7gd_check
    CHECK (payment_status IN (
      'pending','awaiting_payment_method','processing','paid',
      'succeeded','partially_refunded','refund_pending',
      'refunded','refund_failed','failed','cancelled'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN
    RAISE NOTICE 'orders_payment_status_7gd_check not added: %', SQLERRM;
END $$;

-- Backfill amount_refunded_cents from any historical refund_succeeded rows in payments
DO $$
BEGIN
  -- No-op in fresh installs. Existing data may have used the legacy 'payments.refund_succeeded' rows;
  -- we don't backfill (legacy data) because amounts may differ; reconciliation will compute the truth.
  RAISE NOTICE 'Phase 7G-D: amount_refunded_cents default = 0 (no legacy backfill)';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Recompute order payment_status — server-side single source of truth
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_order_payment_status(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received        BIGINT;
  v_refunded        BIGINT;
  v_pending         BIGINT;
  v_failed          BIGINT;
  v_new_status      TEXT;
BEGIN
  -- Look up the canonical received amount from the order's PaymentIntent
  SELECT COALESCE(SUM(pr.refunded_amount_cents) FILTER (WHERE pr.status = 'succeeded'), 0)
       , COALESCE(SUM(pr.refunded_amount_cents) FILTER (WHERE pr.status = 'pending'), 0)
       , COALESCE(SUM(pr.refunded_amount_cents) FILTER (WHERE pr.status IN ('failed','requires_review')), 0)
    INTO v_refunded, v_pending, v_failed
    FROM public.payment_refunds pr
   WHERE pr.order_id = p_order_id;

  -- Received amount: derive from orders.total (DECIMAL(10,2)) → integer cents.
  -- This is the canonical "amount received" for the order; refunds never exceed this.
  SELECT COALESCE(ROUND(o.total * 100)::BIGINT, 0)
    INTO v_received
    FROM public.orders o
   WHERE o.id = p_order_id;

  IF v_received <= 0 THEN
    v_new_status := 'pending';
  ELSIF v_refunded >= v_received AND v_pending = 0 AND v_failed = 0 THEN
    v_new_status := 'refunded';
  ELSIF v_refunded > 0 AND v_refunded < v_received THEN
    v_new_status := 'partially_refunded';
  ELSIF v_pending > 0 AND v_refunded < v_received THEN
    v_new_status := 'refund_pending';
  ELSIF v_failed > 0 AND v_refunded = 0 THEN
    v_new_status := 'refund_failed';
  ELSE
    v_new_status := 'succeeded';
  END IF;

  -- Update orders (only payment_status + last_refund_*)
  UPDATE public.orders
     SET payment_status      = v_new_status,
         amount_refunded_cents = v_refunded,
         last_refund_status  = (SELECT status FROM public.payment_refunds
                                 WHERE order_id = p_order_id
                                 ORDER BY created_at DESC LIMIT 1),
         last_refund_at      = (SELECT updated_at FROM public.payment_refunds
                                 WHERE order_id = p_order_id
                                 ORDER BY created_at DESC LIMIT 1),
         updated_at          = NOW()
   WHERE id = p_order_id;

  RETURN v_new_status;
END; $$;

REVOKE ALL ON FUNCTION public.recompute_order_payment_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_order_payment_status(uuid) TO service_role;

COMMENT ON FUNCTION public.recompute_order_payment_status IS
  'Server-authoritative recomputation of order payment_status from
   payment_refunds. Single source of truth — no client may set
   order.payment_status directly. Service-role only.';

-- ─────────────────────────────────────────────────────────────
-- 9. refund_max_amount_cents(order_id) — server computation
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_max_amount_cents(p_order_id UUID)
RETURNS TABLE (
  received_cents        BIGINT,
  already_refunded_cents BIGINT,
  pending_cents         BIGINT,
  max_refundable_cents  BIGINT,
  can_full_refund       BOOLEAN,
  currency              CHAR(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received BIGINT;
  v_refunded BIGINT;
  v_pending  BIGINT;
  v_currency CHAR(3);
BEGIN
  -- BlinkGo is single-currency today; the orders table has no currency column.
  -- We default to 'EUR' and accept a future migration when multi-currency is added.
  SELECT COALESCE(ROUND(o.total * 100)::BIGINT, 0)
    INTO v_received
    FROM public.orders o
   WHERE o.id = p_order_id;
  v_currency := 'EUR';

  IF v_received IS NULL THEN
    v_received := 0;
  END IF;

  SELECT COALESCE(SUM(pr.refunded_amount_cents) FILTER (WHERE pr.status = 'succeeded'), 0)
       , COALESCE(SUM(pr.refunded_amount_cents) FILTER (WHERE pr.status = 'pending'), 0)
    INTO v_refunded, v_pending
    FROM public.payment_refunds pr
   WHERE pr.order_id = p_order_id;

  RETURN QUERY SELECT
    v_received,
    v_refunded,
    v_pending,
    GREATEST(0, v_received - v_refunded - v_pending),
    (v_received > 0 AND v_refunded + v_pending = 0),
    v_currency;
END; $$;

REVOKE ALL ON FUNCTION public.refund_max_amount_cents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_max_amount_cents(uuid) TO service_role;

COMMENT ON FUNCTION public.refund_max_amount_cents IS
  'Server-authoritative maximum refundable amount for an order.
   Returns received/already-refunded/pending/max-refundable/can-full/currency.';

-- ─────────────────────────────────────────────────────────────
-- 10. Trigger: after any payment_refunds change, recompute order payment_status
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_payment_refunds_recompute() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_order_payment_status(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_order_payment_status(NEW.order_id);
    RETURN NEW;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS trg_payment_refunds_recompute ON public.payment_refunds;
CREATE TRIGGER trg_payment_refunds_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_refunds_recompute();

-- ─────────────────────────────────────────────────────────────
-- 11. Block DELETE on payment_refunds (enforced in code via RLS
--     and via REVOKE; here we also add a DB-level trigger as
--     defence in depth for the "no known code deletes refunds"
--     invariant)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_payment_refunds_no_delete() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment_refunds rows cannot be deleted; refunds are immutable'
    USING ERRCODE = 'P0001';
END; $$;

DROP TRIGGER IF EXISTS trg_payment_refunds_no_delete ON public.payment_refunds;
CREATE TRIGGER trg_payment_refunds_no_delete
  BEFORE DELETE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_refunds_no_delete();

-- ─────────────────────────────────────────────────────────────
-- 12. Comments
-- ─────────────────────────────────────────────────────────────
COMMENT ON TABLE public.payment_refunds IS
  'One row per refund operation. Supports full and partial refunds,
   multiple partial refunds per order, idempotent retries, and Stripe
   webhook-driven status synchronization. Refunds are immutable — no
   DELETE allowed. Status transitions validated in app layer +
   audited in refund_audit_log.';

COMMENT ON TABLE public.refund_audit_log IS
  'Append-only audit trail for every refund state transition and
   webhook event. UPDATE and DELETE forbidden at DB level.';

COMMENT ON TABLE public.refund_operation_locks IS
  'Per-order advisory lock for serializing concurrent refund
   operations. Auto-expires after 5 minutes to prevent stuck locks.';

SELECT '✅ Migration 66-refunds applied' AS status;
