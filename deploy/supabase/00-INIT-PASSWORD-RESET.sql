-- ═══════════════════════════════════════════════════════════════════
-- BlinkGo Production Password Reset Storage
-- ═══════════════════════════════════════════════════════════════════
--
-- Stores short-lived signed reset tokens for the custom branded reset
-- email flow. The token itself is only sent via the email (and signed
-- with an HMAC); only the SHA-256 hash is persisted.
--
-- Idempotent. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_lookup
  ON public.password_reset_tokens (email, token_hash, used_at, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_unused
  ON public.password_reset_tokens (email)
  WHERE used_at IS NULL;

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_reset_tokens_service ON public.password_reset_tokens;
CREATE POLICY password_reset_tokens_service ON public.password_reset_tokens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Cleanup helper: removes used + expired records older than 7 days
CREATE OR REPLACE FUNCTION public.cleanup_expired_reset_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.password_reset_tokens
  WHERE (used_at IS NOT NULL)
     OR (expires_at < now() - interval '7 days');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_reset_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_reset_tokens() TO service_role;
