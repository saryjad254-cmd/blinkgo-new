-- ============================================================================
-- Phase 7G-A: Payment Audit & Recovery
-- ============================================================================
-- Adds three tables to support production-grade Stripe payment handling:
--   1. payment_audit_log       — Immutable (INSERT-only) audit trail
--   2. stripe_webhook_events   — Deduplication of Stripe webhook deliveries
--   3. manual_recovery_queue   — For CHANGE #1: expired draft + successful payment
--
-- Production rules enforced by this migration:
--   R1: Never burn a draft before payment is verified
--   R2: Every payment operation is idempotent
--   R3: Complete audit trail (immutable, append-only)
-- ============================================================================

-- ============================================================================
-- 1. payment_audit_log — Immutable audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_audit_log (
  id BIGSERIAL PRIMARY KEY,

  -- Foreign identifiers
  payment_intent_id TEXT,
  customer_id      UUID NOT NULL,
  draft_id         TEXT NOT NULL,
  order_id         UUID,

  -- Status (enum-constrained)
  status TEXT NOT NULL CHECK (status IN (
    'intent_created',                       -- PaymentIntent was created
    'intent_processing',                    -- Customer is completing payment (bank processing)
    'intent_requires_action',               -- 3DS challenge required
    'intent_requires_payment_method',       -- Customer must provide new payment method
    'intent_succeeded',                     -- Stripe confirmed payment
    'intent_failed',                        -- Payment failed
    'intent_canceled',                      -- Payment canceled
    'draft_burned',                         -- Order draft was burned
    'order_creation_started',               -- 7G-B: Burn + order create in progress
    'order_creation_failed',                -- 7G-B: Order creation failed (recovery)
    'order_created',                        -- Order was created
    'order_already_exists',                 -- 7G-B: Idempotent hit, order already exists
    'payment_received_draft_expired',       -- 7G-A: paid but draft expired
    'payment_received_draft_missing',       -- 7G-A: paid but draft missing
    'duplicate_event',                      -- Webhook dedup hit
    'invalid_transition',                   -- 7G-B: State machine rejected the event
    'orphan_draft_detected',                -- 7G-B: Burned but no order
    'orphan_order_detected',                -- 7G-B: Order exists but no succeeded payment
    'reconciliation_completed',             -- 7G-B: Reconciliation cron processed
    'error'                                 -- Processing error
  )),

  -- Forensics
  stripe_event_id   TEXT,
  idempotency_key   TEXT NOT NULL,
  ip                INET,
  user_agent        TEXT,
  error_reason      TEXT,
  metadata          JSONB,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable: no UPDATE, no DELETE (enforced at database level)
CREATE OR REPLACE RULE no_update_payment_audit AS
  ON UPDATE TO public.payment_audit_log
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_delete_payment_audit AS
  ON DELETE TO public.payment_audit_log
  DO INSTEAD NOTHING;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_intent
  ON public.payment_audit_log(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_draft
  ON public.payment_audit_log(draft_id);

CREATE INDEX IF NOT EXISTS idx_audit_customer
  ON public.payment_audit_log(customer_id);

CREATE INDEX IF NOT EXISTS idx_audit_event
  ON public.payment_audit_log(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_created
  ON public.payment_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_status
  ON public.payment_audit_log(status);

-- ============================================================================
-- 2. stripe_webhook_events — Deduplication
-- ============================================================================
-- Stripe may deliver the same event multiple times (e.g. on retry).
-- We deduplicate by PRIMARY KEY (event.id), which is guaranteed unique by Stripe.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id          TEXT PRIMARY KEY,
  event_type        TEXT NOT NULL,
  payment_intent_id TEXT,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  result            TEXT NOT NULL CHECK (result IN (
    'processed',          -- Successfully handled
    'duplicate',          -- Already processed before
    'error',              -- Error during handling
    'expired_draft'       -- CHANGE #1: paid but draft expired (recovered via queue)
  )),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_intent
  ON public.stripe_webhook_events(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_processed
  ON public.stripe_webhook_events(processed_at DESC);

-- ============================================================================
-- 3. manual_recovery_queue — For CHANGE #1
-- ============================================================================
-- When payment succeeds but draft has expired, we record the payment
-- in the audit log AND insert a row here. Customer Support (or future
-- automated recovery) decides:
--   - issue a refund
--   - recreate the order
--   - contact the customer
--
-- Invariants enforced by this table:
--   - Money is never lost (recorded in audit_log)
--   - Orders are never created from expired drafts
--   - Drafts are never silently recreated
--   - The payment is never ignored
CREATE TABLE IF NOT EXISTS public.manual_recovery_queue (
  id              BIGSERIAL PRIMARY KEY,
  payment_intent_id TEXT NOT NULL,
  customer_id     UUID NOT NULL,
  draft_id        TEXT NOT NULL,
  amount_cents    BIGINT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'EUR',
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- Awaiting review
    'refunded',          -- Refund issued
    'order_recreated',   -- Order manually recreated
    'contacted',         -- Customer was contacted
    'resolved'           -- Resolved (catch-all)
  )),
  resolution_notes TEXT,
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_status
  ON public.manual_recovery_queue(status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_recovery_intent
  ON public.manual_recovery_queue(payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_recovery_customer
  ON public.manual_recovery_queue(customer_id);

CREATE INDEX IF NOT EXISTS idx_recovery_created
  ON public.manual_recovery_queue(created_at DESC);

-- ============================================================================
-- 4. Comments for documentation
-- ============================================================================
COMMENT ON TABLE public.payment_audit_log IS
  'Immutable audit trail for all payment operations. INSERT-only.';

COMMENT ON TABLE public.stripe_webhook_events IS
  'Deduplication table for Stripe webhook events. PRIMARY KEY is Stripe event.id.';

COMMENT ON TABLE public.manual_recovery_queue IS
  'Recovery queue for CHANGE #1: payment received but draft expired. No order created.';
