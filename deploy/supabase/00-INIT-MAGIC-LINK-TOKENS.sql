-- ═══════════════════════════════════════════════════════════════════
-- BlinkGo Magic Link Tokens
-- ═══════════════════════════════════════════════════════════════════
-- Custom one-time passwordless login tokens.
-- The /api/auth/magic-link route inserts a row when a user requests
-- a login link; the link in the email points to /api/auth/magic-link/verify
-- which validates the token, marks it used, and mints a session.
--
-- Idempotent. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.magic_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lookups are by token_hash (the only thing the verify endpoint receives)
CREATE UNIQUE INDEX IF NOT EXISTS uq_magic_link_tokens_hash
  ON public.magic_link_tokens (token_hash);

-- Per-email index for cleanup and audit
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_email_created
  ON public.magic_link_tokens (email, created_at DESC);

-- Per-user index for "active sessions" lookups
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_user
  ON public.magic_link_tokens (user_id, created_at DESC);

-- Expiry index for the cleanup function
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at
  ON public.magic_link_tokens (expires_at);

ALTER TABLE public.magic_link_tokens ENABLE ROW LEVEL SECURITY;

-- Service role: full access (the only path that touches this table)
DROP POLICY IF EXISTS magic_link_tokens_service ON public.magic_link_tokens;
CREATE POLICY magic_link_tokens_service ON public.magic_link_tokens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Cleanup function: removes expired tokens. Callable by service_role
-- (we don't grant execute to anon — the cron job uses service role).
CREATE OR REPLACE FUNCTION public.cleanup_magic_link_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.magic_link_tokens
  WHERE expires_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_magic_link_tokens() TO service_role;
