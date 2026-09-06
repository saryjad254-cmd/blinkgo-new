-- =============================================================================
-- Phase 7F: Order Drafts — server-authoritative checkout contract
-- =============================================================================
-- Production-grade persistence for the Order Draft.
--
-- Why this migration:
--   In Phase 7F (first cut), the Order Draft was stored ONLY in process memory
--   (Map<string, DraftRecord> in app/api/checkout/draft/route.ts). This was a
--   Production-Critical gap:
--     - Server restart = all in-progress checkouts silently lost
--     - Horizontal scaling = drafts only exist on the creating node
--     - No audit trail of "what was the customer about to pay for"
--     - No cross-device draft sharing
--
-- This migration creates an `order_drafts` table that:
--   1. Persists drafts to Postgres (survives restart, multi-node safe)
--   2. Tracks used (one-time-use) state for replay defense
--   3. Stores HMAC signature for tamper detection
--   4. Indexes by (customer_id, expires_at) for "active draft" lookup
--   5. Has a soft-delete + TTL for GC (cron to clean expired)
--
-- Compatibility:
--   - Postgres 13+
--   - Supabase RLS enabled
--   - Idempotent (IF NOT EXISTS)
-- =============================================================================

-- ── 1. Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_drafts (
  -- Server-issued draft ID: 'DRF-YYYYMMDDHHMMSS-AAAAAAAA-BBBB'
  id                  TEXT        PRIMARY KEY,

  -- Customer who owns the draft
  customer_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Restaurant being ordered from
  restaurant_id       UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,

  -- Full Order Draft body as JSONB (canonical server-issued state)
  draft               JSONB       NOT NULL,

  -- HMAC-SHA256 signature of the canonical draft body (anti-tampering)
  signature           TEXT        NOT NULL,

  -- TTL — when does this draft expire? (issued_at + 30 minutes)
  expires_at          TIMESTAMPTZ NOT NULL,

  -- One-time use: when confirm burns the draft, set used = true.
  -- A used draft cannot be re-used (replay defense).
  used                BOOLEAN     NOT NULL DEFAULT false,

  -- When the draft was confirmed (null until used)
  used_at             TIMESTAMPTZ,

  -- Audit: who confirmed the draft? (customer_id should match, but log for forensics)
  confirmed_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Soft delete (in case we need to hide a draft without losing audit trail)
  deleted_at          TIMESTAMPTZ,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.order_drafts IS
  'Phase 7F: server-authoritative Order Draft. Created on /api/checkout/draft POST, burned on /api/checkout/confirm. Survives restarts; safe to scale horizontally.';

COMMENT ON COLUMN public.order_drafts.draft IS
  'Canonical Order Draft body (lines, totals, address, coupon, etc.). All prices are server-validated. Client MUST NOT mutate this.';

COMMENT ON COLUMN public.order_drafts.signature IS
  'HMAC-SHA256 signature of the canonical draft. Verified on confirm with crypto.timingSafeEqual. Any mutation breaks the signature.';

COMMENT ON COLUMN public.order_drafts.used IS
  'Burn-on-confirm flag. Once true, the draft cannot be re-used. Prevents replay.';

-- ── 2. Indexes ──────────────────────────────────────────────────────────────
-- Most common query: "find the customer's active draft"
CREATE INDEX IF NOT EXISTS idx_order_drafts_customer_expires
  ON public.order_drafts(customer_id, expires_at DESC)
  WHERE used = false AND deleted_at IS NULL;

-- For the confirm endpoint: "load by ID, check used"
CREATE INDEX IF NOT EXISTS idx_order_drafts_id_used
  ON public.order_drafts(id, used);

-- For the GC cron: "find all expired drafts older than N hours"
CREATE INDEX IF NOT EXISTS idx_order_drafts_expires_used
  ON public.order_drafts(expires_at)
  WHERE used = false;

-- For forensics: "find all drafts for a restaurant in a time window"
CREATE INDEX IF NOT EXISTS idx_order_drafts_restaurant_created
  ON public.order_drafts(restaurant_id, created_at DESC);

-- ── 3. updated_at trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_order_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_drafts_updated_at ON public.order_drafts;
CREATE TRIGGER trg_order_drafts_updated_at
  BEFORE UPDATE ON public.order_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_order_drafts_updated_at();

-- ── 4. Row-Level Security ───────────────────────────────────────────────────
ALTER TABLE public.order_drafts ENABLE ROW LEVEL SECURITY;

-- Customers can read their own drafts (active OR used)
DROP POLICY IF EXISTS "order_drafts_customer_select" ON public.order_drafts;
CREATE POLICY "order_drafts_customer_select" ON public.order_drafts
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- Customers can create their own drafts
-- (Note: the API uses service_role to bypass this; the customer-facing
-- GET reads via auth.uid(). This policy is a defense-in-depth.)
DROP POLICY IF EXISTS "order_drafts_customer_insert" ON public.order_drafts;
CREATE POLICY "order_drafts_customer_insert" ON public.order_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- Customers can update their own drafts (only if not used, not expired)
DROP POLICY IF EXISTS "order_drafts_customer_update" ON public.order_drafts;
CREATE POLICY "order_drafts_customer_update" ON public.order_drafts
  FOR UPDATE
  TO authenticated
  USING (
    customer_id = auth.uid()
    AND used = false
    AND expires_at > NOW()
  )
  WITH CHECK (
    customer_id = auth.uid()
    AND used = false
    AND expires_at > NOW()
  );

-- Admins can read all drafts (forensics)
DROP POLICY IF EXISTS "order_drafts_admin_all" ON public.order_drafts;
CREATE POLICY "order_drafts_admin_all" ON public.order_drafts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ── 5. Helper functions ─────────────────────────────────────────────────────
-- Get the customer's most recent active draft
CREATE OR REPLACE FUNCTION public.get_active_order_draft(p_customer_id UUID)
RETURNS TABLE (
  id              TEXT,
  customer_id     UUID,
  restaurant_id   UUID,
  draft           JSONB,
  signature       TEXT,
  expires_at      TIMESTAMPTZ,
  used            BOOLEAN,
  created_at      TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id, d.customer_id, d.restaurant_id, d.draft, d.signature,
    d.expires_at, d.used, d.created_at
  FROM public.order_drafts d
  WHERE d.customer_id = p_customer_id
    AND d.used = false
    AND d.deleted_at IS NULL
    AND d.expires_at > NOW()
  ORDER BY d.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_active_order_draft(UUID) IS
  'Returns the customer''s most recent active (unused, unexpired) draft. Used for cross-device draft sharing.';

-- Burn a draft (set used = true, used_at = NOW, confirmed_by = p_confirmed_by)
-- Returns true if the burn was successful, false if the draft was already used.
-- Uses atomic UPDATE with WHERE used = false to prevent race conditions.
CREATE OR REPLACE FUNCTION public.burn_order_draft(
  p_draft_id      TEXT,
  p_confirmed_by  UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INT;
BEGIN
  UPDATE public.order_drafts
  SET used = true,
      used_at = NOW(),
      confirmed_by = p_confirmed_by
  WHERE id = p_draft_id
    AND used = false
    AND deleted_at IS NULL
    AND expires_at > NOW();
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected = 1;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION public.burn_order_draft(TEXT, UUID) IS
  'Atomically burn a draft (set used=true). Returns true if successful, false if the draft was already used. Race-safe via WHERE used=false.';

-- Garbage collect expired drafts (soft-delete them)
-- Called by /api/cron/cleanup-drafts (or a scheduled Postgres function)
CREATE OR REPLACE FUNCTION public.gc_expired_order_drafts()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.order_drafts
  SET deleted_at = NOW()
  WHERE deleted_at IS NULL
    AND (expires_at < NOW() - INTERVAL '1 day' OR (used = true AND used_at < NOW() - INTERVAL '7 days'));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION public.gc_expired_order_drafts() IS
  'Soft-delete expired drafts (24h after expiry) and used drafts (7d after burn). Called by /api/cron/cleanup-drafts.';

-- ── 6. Performance index for GC ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_order_drafts_gc
  ON public.order_drafts(expires_at, used, used_at)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- Verification query (run after migration):
--   SELECT * FROM public.order_drafts LIMIT 1;
--   SELECT public.get_active_order_draft('11111111-1111-1111-1111-111111111001');
-- =============================================================================
