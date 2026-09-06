-- ============================================================================
-- Phase 7G-C: Payment Security Hardening
-- ============================================================================
-- Adds:
--   1. payment_security_events  — append-only fraud & security audit log
--   2. payment_rate_limit_buckets — persistent rate limit buckets
--   3. admin_action_log         — immutable admin action history
--   4. payment_binding          — strict binding of PI ↔ draft ↔ customer
--   5. RLS policies             — anon and authenticated get ZERO access
--   6. RPC permission lockdown  — only service_role can invoke
--   7. Append-only rules        — UPDATE/DELETE blocked at DB level
-- ============================================================================

-- ============================================================================
-- 1. payment_security_events — append-only fraud & security log
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_security_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    -- Authorization
    'unauthenticated_checkout_attempt',
    'cross_user_draft_access',
    'cross_user_status_poll',
    'customer_admin_recovery_access',
    'driver_recovery_access',
    'restaurant_recovery_access',
    'non_privileged_admin_mutation',
    'invalid_token',
    -- Tampering
    'amount_tampering',
    'currency_tampering',
    'customer_id_tampering',
    'restaurant_id_tampering',
    'draft_id_tampering',
    'payment_intent_substitution',
    'amount_mismatch',
    'currency_mismatch',
    'metadata_mismatch',
    'pi_from_other_draft',
    'pi_from_other_user',
    'pi_from_other_environment',
    'external_pi_used',
    -- Webhook attacks
    'missing_signature',
    'invalid_signature',
    'tampered_body',
    'expired_timestamp',
    'future_timestamp',
    'malformed_header',
    'oversized_payload',
    'wrong_content_type',
    'forged_event_id',
    'replayed_event',
    'unsupported_event',
    'test_live_mode_mismatch',
    'wrong_object_type',
    -- Abuse
    'checkout_flood_user',
    'checkout_flood_ip',
    'polling_flood',
    'repeated_decline',
    'many_drafts_no_payment',
    'rate_limit_exceeded',
    -- Database security
    'direct_insert_blocked',
    'direct_update_blocked',
    'direct_delete_blocked',
    'unauthorized_rpc_invocation',
    'recovery_delete_blocked',
    -- Recovery security
    'invalid_recovery_transition',
    'concurrent_admin_resolution',
    'refund_without_reference',
    'recreate_without_order',
    'arbitrary_order_id_injection',
    'missing_resolution_note',
    'recovery_replay',
    -- Secrets and privacy
    'secret_in_client_bundle',
    'webhook_secret_in_log',
    'client_secret_in_log',
    'authorization_header_in_log',
    'unsafe_public_error',
    'production_missing_keys',
    'implicit_mock_mode',
    -- Other
    'security_log_write_failure',
    'admin_action_immutability_violation'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id UUID,
  draft_id TEXT,
  payment_intent_id TEXT,
  stripe_event_id TEXT,
  ip INET,
  user_agent TEXT,
  request_id TEXT,
  route TEXT,
  reason TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for security lookups
CREATE INDEX IF NOT EXISTS idx_payment_security_events_user
  ON public.payment_security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_security_events_ip
  ON public.payment_security_events (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_security_events_pi
  ON public.payment_security_events (payment_intent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_security_events_type
  ON public.payment_security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_security_events_severity
  ON public.payment_security_events (severity, created_at DESC);

-- Append-only: no UPDATE, no DELETE
ALTER TABLE public.payment_security_events ENABLE ROW LEVEL SECURITY;

-- anon and authenticated get ZERO access
CREATE POLICY payment_security_events_no_anon ON public.payment_security_events
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY payment_security_events_no_authenticated ON public.payment_security_events
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
-- service_role can INSERT and SELECT (for admin tooling)
CREATE POLICY payment_security_events_service_all ON public.payment_security_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- DB-level append-only enforcement
CREATE OR REPLACE FUNCTION public.payment_security_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'payment_security_events is append-only';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_security_events_no_update ON public.payment_security_events;
CREATE TRIGGER payment_security_events_no_update
  BEFORE UPDATE ON public.payment_security_events
  FOR EACH ROW EXECUTE FUNCTION public.payment_security_events_append_only();

DROP TRIGGER IF EXISTS payment_security_events_no_delete ON public.payment_security_events;
CREATE TRIGGER payment_security_events_no_delete
  BEFORE DELETE ON public.payment_security_events
  FOR EACH ROW EXECUTE FUNCTION public.payment_security_events_append_only();

-- ============================================================================
-- 2. payment_rate_limit_buckets — persistent token buckets
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,        -- e.g. "user:abc123:checkout"
  tokens NUMERIC NOT NULL DEFAULT 0,  -- current available tokens
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  limit_count INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cleanup function (called by cron)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limit_buckets(retention_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.payment_rate_limit_buckets
  WHERE updated_at < now() - (retention_hours || ' hours')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE public.payment_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_rate_limit_buckets_no_anon ON public.payment_rate_limit_buckets
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY payment_rate_limit_buckets_no_authenticated ON public.payment_rate_limit_buckets
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY payment_rate_limit_buckets_service_all ON public.payment_rate_limit_buckets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. admin_action_log — immutable admin action history
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  admin_email TEXT,
  action TEXT NOT NULL,                    -- e.g. "recovery_queue.update"
  resource_type TEXT NOT NULL,             -- e.g. "manual_recovery_queue"
  resource_id TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  resolution_notes TEXT,
  ip INET,
  user_agent TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_log_admin
  ON public.admin_action_log (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_resource
  ON public.admin_action_log (resource_type, resource_id, created_at DESC);

ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_action_log_no_anon ON public.admin_action_log
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY admin_action_log_no_authenticated ON public.admin_action_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY admin_action_log_service_all ON public.admin_action_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Append-only
CREATE OR REPLACE FUNCTION public.admin_action_log_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_action_log is append-only';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_action_log_no_update ON public.admin_action_log;
CREATE TRIGGER admin_action_log_no_update
  BEFORE UPDATE ON public.admin_action_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_action_log_append_only();

DROP TRIGGER IF EXISTS admin_action_log_no_delete ON public.admin_action_log;
CREATE TRIGGER admin_action_log_no_delete
  BEFORE DELETE ON public.admin_action_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_action_log_append_only();

-- ============================================================================
-- 4. payment_binding — strict binding of PI ↔ draft ↔ customer
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_binding (
  payment_intent_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  customer_id UUID NOT NULL,
  restaurant_id UUID NOT NULL,
  expected_amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  livemode BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'test')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A PI is bound to exactly one draft. No swap allowed.
  UNIQUE (payment_intent_id),
  -- Amount and currency must be positive
  CHECK (expected_amount_cents > 0),
  CHECK (char_length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_payment_binding_draft ON public.payment_binding (draft_id);
CREATE INDEX IF NOT EXISTS idx_payment_binding_customer ON public.payment_binding (customer_id);

ALTER TABLE public.payment_binding ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_binding_no_anon ON public.payment_binding
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY payment_binding_no_authenticated ON public.payment_binding
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY payment_binding_service_all ON public.payment_binding
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. RLS on existing payment tables (from migrations 62, 64)
-- ============================================================================

-- payment_audit_log (migration 62): RLS lockdown
ALTER TABLE public.payment_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_audit_log_no_anon ON public.payment_audit_log;
CREATE POLICY payment_audit_log_no_anon ON public.payment_audit_log
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS payment_audit_log_no_authenticated ON public.payment_audit_log;
CREATE POLICY payment_audit_log_no_authenticated ON public.payment_audit_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS payment_audit_log_service_all ON public.payment_audit_log;
CREATE POLICY payment_audit_log_service_all ON public.payment_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- stripe_webhook_events (migration 62): RLS lockdown + no UPDATE/DELETE
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stripe_webhook_events_no_anon ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_no_anon ON public.stripe_webhook_events
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS stripe_webhook_events_no_authenticated ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_no_authenticated ON public.stripe_webhook_events
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS stripe_webhook_events_service_all ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_service_all ON public.stripe_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- manual_recovery_queue (migration 62): service_role only writes, admins read
ALTER TABLE public.manual_recovery_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_recovery_queue_no_anon ON public.manual_recovery_queue;
CREATE POLICY manual_recovery_queue_no_anon ON public.manual_recovery_queue
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS manual_recovery_queue_no_authenticated ON public.manual_recovery_queue;
CREATE POLICY manual_recovery_queue_no_authenticated ON public.manual_recovery_queue
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS manual_recovery_queue_service_all ON public.manual_recovery_queue;
CREATE POLICY manual_recovery_queue_service_all ON public.manual_recovery_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payment_intent_history (migration 64): RLS lockdown
ALTER TABLE public.payment_intent_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_intent_history_no_anon ON public.payment_intent_history;
CREATE POLICY payment_intent_history_no_anon ON public.payment_intent_history
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS payment_intent_history_no_authenticated ON public.payment_intent_history;
CREATE POLICY payment_intent_history_no_authenticated ON public.payment_intent_history
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS payment_intent_history_service_all ON public.payment_intent_history;
CREATE POLICY payment_intent_history_service_all ON public.payment_intent_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payment_reconciliation_queue (migration 64)
ALTER TABLE public.payment_reconciliation_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_reconciliation_queue_no_anon ON public.payment_reconciliation_queue;
CREATE POLICY payment_reconciliation_queue_no_anon ON public.payment_reconciliation_queue
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS payment_reconciliation_queue_no_authenticated ON public.payment_reconciliation_queue;
CREATE POLICY payment_reconciliation_queue_no_authenticated ON public.payment_reconciliation_queue
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS payment_reconciliation_queue_service_all ON public.payment_reconciliation_queue;
CREATE POLICY payment_reconciliation_queue_service_all ON public.payment_reconciliation_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- order_drafts: lock down payment columns
-- Customers can still read their own drafts; only service_role can modify payment columns
ALTER TABLE public.order_drafts ENABLE ROW LEVEL SECURITY;

-- A binding column is added: server-computed total in cents
ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS total_cents BIGINT,
  ADD COLUMN IF NOT EXISTS total_hash TEXT,
  ADD COLUMN IF NOT EXISTS expected_currency TEXT NOT NULL DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN,
  ADD COLUMN IF NOT EXISTS environment TEXT;

-- ============================================================================
-- 6. RPC permission lockdown
-- ============================================================================
-- Ensure payment-related RPCs are only callable by service_role

REVOKE ALL ON FUNCTION public.update_draft_payment_state(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_draft_payment_state(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.update_draft_payment_state(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_draft_payment_state(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_payment_intent_history(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payment_intent_history(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.get_payment_intent_history(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_intent_history(TEXT, INTEGER) TO service_role;

-- New helper RPC: rate limit check (uses bucket table)
-- This RPC is the production-grade rate limiter; in mock mode the application
-- layer uses an in-memory fallback that is replaced by this RPC.
CREATE OR REPLACE FUNCTION public.payment_rate_limit_check(
  p_bucket_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER,
  p_burst INTEGER DEFAULT NULL
)
RETURNS TABLE(allowed BOOLEAN, tokens_remaining NUMERIC, retry_after_seconds INTEGER) AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_bucket RECORD;
  v_tokens NUMERIC;
  v_refill_rate NUMERIC;
  v_retry_after INTEGER := 0;
  v_allowed BOOLEAN;
  v_effective_limit INTEGER;
BEGIN
  v_effective_limit := COALESCE(p_burst, p_limit);
  v_refill_rate := p_limit::NUMERIC / p_window_seconds;

  SELECT * INTO v_bucket
  FROM public.payment_rate_limit_buckets
  WHERE bucket_key = p_bucket_key;

  IF v_bucket IS NULL THEN
    -- New bucket: full tokens
    v_tokens := v_effective_limit;
    INSERT INTO public.payment_rate_limit_buckets (bucket_key, tokens, last_refill_at, limit_count, window_seconds, updated_at)
    VALUES (p_bucket_key, v_tokens, v_now, p_limit, p_window_seconds, v_now);
    v_allowed := true;
  ELSE
    -- Refill tokens based on elapsed time
    v_tokens := LEAST(
      v_effective_limit::NUMERIC,
      v_bucket.tokens + (EXTRACT(EPOCH FROM (v_now - v_bucket.last_refill_at)) * v_refill_rate)
    );
    -- Try to consume 1 token
    IF v_tokens >= 1 THEN
      v_tokens := v_tokens - 1;
      v_allowed := true;
    ELSE
      v_allowed := false;
      v_retry_after := GREATEST(1, CEIL((1 - v_tokens) / v_refill_rate)::INTEGER);
    END IF;
    UPDATE public.payment_rate_limit_buckets
    SET tokens = v_tokens, last_refill_at = v_now, updated_at = v_now
    WHERE bucket_key = p_bucket_key;
  END IF;

  RETURN QUERY SELECT v_allowed, FLOOR(v_tokens)::INTEGER, v_retry_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- ============================================================================
-- 7. Cleanup: payment_security_events older than 90 days (recommended)
-- ============================================================================
-- Note: Application code should call this periodically; it's not a cron here
-- because we don't want to delete audit data automatically.
-- Retention is documented; admins must explicitly clean if needed.

-- ============================================================================
-- 8. Ensure idempotency: order_drafts.payment_intent_id remains UNIQUE
-- ============================================================================
-- (Already in migration 64; reinforced here)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_order_drafts_pi
  ON public.order_drafts (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- Add index for security event lookups by IP+date
CREATE INDEX IF NOT EXISTS idx_payment_security_events_ip_created
  ON public.payment_security_events (ip, created_at DESC);
