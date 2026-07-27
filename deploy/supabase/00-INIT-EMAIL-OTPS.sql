-- ═══════════════════════════════════════════════════════════════════
-- BlinkGo Production OTP Storage — REQUIRED for Vercel deployment
-- ═══════════════════════════════════════════════════════════════════
-- 
-- This migration creates the `email_otps` table that stores all signup,
-- password reset, and magic link OTPs. Without this table, the entire
-- authentication flow fails (the previous filesystem-based fallback
-- throws ENOENT on Vercel because /var/task is read-only).
--
-- Run this ONCE in your Supabase SQL Editor:
--   https://supabase.com/dashboard/project/rhdaffhlrglyknxtucux/sql
--
-- It is idempotent (safe to run multiple times).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid,
  code_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup', 'password_reset', 'magic_link', 'email_change', 'login')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_lookup
  ON public.email_otps (email, purpose, used_at, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_otps_user
  ON public.email_otps (user_id, purpose)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_otps_unused
  ON public.email_otps (email, purpose)
  WHERE used_at IS NULL;

ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_otps_service ON public.email_otps;
CREATE POLICY email_otps_service ON public.email_otps
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Cleanup helper: removes used + expired records older than 24h
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.email_otps
  WHERE (used_at IS NOT NULL)
     OR (expires_at < now() - interval '24 hours');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_otps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- Verify the migration was applied successfully:
-- ═══════════════════════════════════════════════════════════════════
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'email_otps';
--
-- Expected output: id, email, user_id, code_hash, purpose,
--                  expires_at, used_at, ip_address, user_agent, created_at
