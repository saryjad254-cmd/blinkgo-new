-- ════════════════════════════════════════════════════════════════
-- BlinkGo v82 — Persistent Idempotency Keys
-- ════════════════════════════════════════════════════════════════
-- Round-2 workflow audit fix (SENIOR-QA-2):
--
--   The in-memory idempotency cache (lib/idempotency.ts) is per-instance.
--   On Vercel / multi-instance serverless, the cache is not shared, so
--   a duplicate request landing on a different instance creates a
--   duplicate order. This migration adds a DB-backed idempotency table
--   so the cache works across instances.
--
--   Pattern (Stripe / DoorDash style):
--   1. Client sends X-Idempotency-Key on a state-mutating request
--   2. Server attempts to INSERT the key + scoped endpoint
--   3. If the unique constraint trips, the previous response is
--      returned verbatim
--   4. If the insert succeeds, the handler runs and updates the
--      row with the response body
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL,
  -- The HTTP method + path so a single key cannot collide between
  -- /api/orders (POST) and /api/loyalty/redeem (POST).
  scope           TEXT NOT NULL,
  -- The response that the original request produced, so retries
  -- return the exact same body.
  response_status INTEGER,
  response_body   JSONB,
  -- Bound the lifetime so the table doesn't grow unbounded.
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, scope)
);

-- Index for the lookup path (key + scope + expiry).
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_lookup
  ON public.idempotency_keys (key, scope)
  WHERE expires_at > now();

-- Background cleanup. The next scheduled cron job can call
-- `cleanup_idempotency_keys()` to drop expired rows.
CREATE OR REPLACE FUNCTION public.cleanup_idempotency_keys()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.idempotency_keys
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_idempotency_keys() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_idempotency_keys() TO service_role;

-- RLS: only the service_role may read/write idempotency rows.
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_keys_service_all ON public.idempotency_keys;
CREATE POLICY idempotency_keys_service_all ON public.idempotency_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.idempotency_keys IS
  'Persistent idempotency cache for state-mutating endpoints. Survives across ' ||
  'serverless instances. Scoped per (key, scope) so the same client-generated ' ||
  'key cannot be reused across different endpoints.';

COMMENT ON FUNCTION public.cleanup_idempotency_keys() IS
  'Drops expired idempotency keys. Call from a daily cron to bound table size.';

SELECT '✅ Migration 52-idempotency-keys applied' AS status;
