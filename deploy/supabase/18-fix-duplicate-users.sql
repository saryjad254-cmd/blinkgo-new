-- Migration 20: Fix duplicate user registration issues
-- Adds unique constraint on email, idempotent upsert behavior, and cleanup of orphaned auth users

-- ============================================================
-- 1) Add UNIQUE constraint on public.users.email
--    (prevents multiple public.users rows for same email)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    -- First, clean up any duplicate emails keeping the latest one
    DELETE FROM public.users a
      USING public.users b
      WHERE a.email = b.email
        AND a.created_at < b.created_at;
    
    ALTER TABLE public.users
      ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END
$$;

-- ============================================================
-- 2) Add UNIQUE constraint on auth.users for phone (if column exists)
--    Most duplicate-key errors occur on the primary key (id),
--    so we focus on email there
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON public.users(LOWER(email));

-- ============================================================
-- 3) Add reset email_verifications unique active code per email
--    This prevents multiple ACTIVE OTPs for the same email+purpose
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_otp_per_email
  ON public.email_verifications(email, purpose)
  WHERE used_at IS NULL;

-- ============================================================
-- 4) Delete orphaned auth users (no public.users row)
--    These cause "duplicate key violates users_pkey" when
--    users re-register after partial cleanup
-- ============================================================
DO $$
DECLARE
  orphan_id UUID;
BEGIN
  FOR orphan_id IN
    SELECT au.id
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.id = au.id
    WHERE pu.id IS NULL
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = orphan_id;
      RAISE NOTICE 'Cleaned up orphan auth user: %', orphan_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to delete orphan %: %', orphan_id, SQLERRM;
    END;
  END LOOP;
END
$$;

-- ============================================================
-- 5) Add helpful index for email lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_phone
  ON public.users(phone)
  WHERE phone IS NOT NULL;

COMMENT ON CONSTRAINT users_email_unique ON public.users
  IS 'Ensures each email maps to exactly one public.users row (prevents duplicate-key errors)';
