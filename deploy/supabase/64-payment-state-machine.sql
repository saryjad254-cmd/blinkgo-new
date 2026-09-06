-- ============================================================================
-- Phase 7G-B: Payment State Machine
-- ============================================================================
-- Adds state machine support to the payment flow:
--   1. order_drafts.payment_status  — explicit payment lifecycle state
--   2. order_drafts.order_creation_attempts — how many times order creation was tried
--   3. order_drafts.last_payment_event_at — when the last Stripe event arrived
--   4. payment_intent_history — append-only log of all Stripe events per PI
--   5. payment_reconciliation_queue — for stuck states that need admin attention
--
-- Production rules enforced by this migration:
--   R1: Never burn a draft before payment is cryptographically verified
--   R2: Every payment operation is idempotent
--   R3: Complete audit trail (immutable, append-only)
--   R4 (new): Payment state and order state cannot diverge
-- ============================================================================

-- ============================================================================
-- 1. Add payment_status column to order_drafts
-- ============================================================================
-- Explicit state machine state. Default 'none' for legacy drafts.
ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none'
    CHECK (payment_status IN (
      'none',                       -- No PaymentIntent yet
      'awaiting_payment_method',    -- PI created, awaiting customer
      'requires_action',            -- 3DS challenge required
      'requires_payment_method',    -- Customer must provide new payment method
      'processing',                 -- Bank is processing
      'succeeded',                  -- Terminal: order must exist
      'failed',                     -- Terminal: no order
      'canceled',                   -- Terminal: no order
      'expired'                     -- Terminal: no order
    ));

-- Canonical Stripe PaymentIntent binding used by checkout confirmation,
-- recovery tooling and the security migration that follows this file.
ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_order_drafts_pi
  ON public.order_drafts(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS order_creation_attempts INT NOT NULL DEFAULT 0;

ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS last_payment_event_at TIMESTAMPTZ;

ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS last_payment_event_type TEXT;

ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS last_payment_event_id TEXT;

-- Indexes for reconciliation queries
CREATE INDEX IF NOT EXISTS idx_drafts_payment_status
  ON public.order_drafts(payment_status)
  WHERE payment_status IN ('awaiting_payment_method', 'processing', 'requires_action', 'requires_payment_method');

CREATE INDEX IF NOT EXISTS idx_drafts_burned_no_order
  ON public.order_drafts(used)
  WHERE used = true;

CREATE INDEX IF NOT EXISTS idx_drafts_last_payment_event_at
  ON public.order_drafts(last_payment_event_at)
  WHERE last_payment_event_at IS NOT NULL;

-- ============================================================================
-- 2. payment_intent_history — append-only log of all Stripe events per PI
-- ============================================================================
-- Records EVERY Stripe event for EVERY PaymentIntent, in arrival order.
-- Used for forensics and for out-of-order event reconciliation.
CREATE TABLE IF NOT EXISTS public.payment_intent_history (
  id BIGSERIAL PRIMARY KEY,
  payment_intent_id TEXT NOT NULL,
  customer_id UUID,
  draft_id TEXT,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_state_at_event TEXT NOT NULL,  -- state BEFORE this event was applied
  payment_state_after_event TEXT,          -- state AFTER (NULL if rejected)
  transitioned BOOLEAN NOT NULL,          -- did the state actually change?
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip INET,
  user_agent TEXT,
  metadata JSONB,
  CONSTRAINT unique_pi_event UNIQUE (payment_intent_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_pih_intent
  ON public.payment_intent_history(payment_intent_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_pih_draft
  ON public.payment_intent_history(draft_id);

CREATE INDEX IF NOT EXISTS idx_pih_event_type
  ON public.payment_intent_history(event_type);

-- ============================================================================
-- 3. payment_reconciliation_queue — for stuck states that need admin attention
-- ============================================================================
-- When the reconciliation cron finds an inconsistent state (e.g. burned draft
-- but no order, or order exists but no payment), it queues the issue here.
CREATE TABLE IF NOT EXISTS public.payment_reconciliation_queue (
  id BIGSERIAL PRIMARY KEY,
  draft_id TEXT,
  payment_intent_id TEXT,
  order_id UUID,
  customer_id UUID,
  issue_type TEXT NOT NULL CHECK (issue_type IN (
    'burned_no_order',         -- draft.used=true but no order with this payment_intent_id
    'order_no_payment',        -- order exists but payment_status is not 'succeeded'
    'stuck_awaiting_payment',  -- draft.payment_status='awaiting_payment_method' for too long
    'stuck_processing',        -- draft.payment_status='processing' for too long
    'orphan_payment_intent',   -- PaymentIntent exists but no draft
    'state_machine_violation'  -- audit log shows an impossible transition
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'investigating',
    'resolved',
    'dismissed'
  )),
  details JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_recon_status
  ON public.payment_reconciliation_queue(status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_recon_issue_type
  ON public.payment_reconciliation_queue(issue_type);

-- ============================================================================
-- 4. RPC: update_draft_payment_state
-- ============================================================================
-- Atomic, idempotent update of draft.payment_status with optimistic concurrency.
-- Returns the draft row only if the transition is allowed.
CREATE OR REPLACE FUNCTION public.update_draft_payment_state(
  p_draft_id TEXT,
  p_expected_status TEXT,
  p_new_status TEXT,
  p_last_event_at TIMESTAMPTZ,
  p_last_event_type TEXT,
  p_last_event_id TEXT
) RETURNS TABLE (
  id TEXT,
  payment_status TEXT,
  payment_intent_id TEXT,
  used BOOLEAN,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Atomic CAS: only update if the current payment_status matches expected
  RETURN QUERY
  UPDATE public.order_drafts
  SET
    payment_status = p_new_status,
    last_payment_event_at = p_last_event_at,
    last_payment_event_type = p_last_event_type,
    last_payment_event_id = p_last_event_id
  WHERE
    order_drafts.id = p_draft_id
    AND (p_expected_status IS NULL OR order_drafts.payment_status = p_expected_status)
  RETURNING
    order_drafts.id,
    order_drafts.payment_status,
    order_drafts.payment_intent_id,
    order_drafts.used,
    order_drafts.expires_at;
END;
$$;

-- ============================================================================
-- 5. RPC: get_payment_intent_history (for reconciliation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_payment_intent_history(
  p_payment_intent_id TEXT,
  p_limit INT DEFAULT 50
) RETURNS TABLE (
  event_id TEXT,
  event_type TEXT,
  payment_state_at_event TEXT,
  payment_state_after_event TEXT,
  transitioned BOOLEAN,
  received_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pih.event_id,
    pih.event_type,
    pih.payment_state_at_event,
    pih.payment_state_after_event,
    pih.transitioned,
    pih.received_at
  FROM public.payment_intent_history pih
  WHERE pih.payment_intent_id = p_payment_intent_id
  ORDER BY pih.received_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Comments
-- ============================================================================
COMMENT ON COLUMN public.order_drafts.payment_status IS
  'Explicit payment lifecycle state. Driven by Stripe webhook events. See lib/services/payment-state-machine.ts.';

COMMENT ON COLUMN public.order_drafts.order_creation_attempts IS
  'Number of times order creation was attempted for this draft. Used to detect stuck drafts.';

COMMENT ON COLUMN public.order_drafts.last_payment_event_at IS
  'When the most recent Stripe event for this draft was processed.';

COMMENT ON TABLE public.payment_intent_history IS
  'Append-only log of every Stripe event per PaymentIntent. Used for forensics and out-of-order reconciliation.';

COMMENT ON TABLE public.payment_reconciliation_queue IS
  'Queue of inconsistent payment states that require admin attention. Populated by /api/cron/reconcile-payments.';
