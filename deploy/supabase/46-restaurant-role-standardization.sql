-- ============================================================
-- 46. RESTAURANT ROLE STANDARDIZATION
-- ============================================================
-- Standardizes the database on the canonical role value `restaurant`,
-- removing the legacy `restaurant_owner` drift.
--
-- Background
-- ----------
-- The deployed `user_role` enum is ('customer','driver','restaurant','admin').
-- Two legacy objects still referenced `restaurant_owner`:
--
--   1. deploy/supabase/39-order-modifications.sql
--        role IN ('admin','super_admin','restaurant_owner')
--      Because no deployed user has role='restaurant_owner', restaurant users
--      could never pass these policies. Worse: those literals are compared
--      against an ENUM column, so PostgreSQL raises
--        ERROR: invalid input value for enum user_role: "super_admin"
--      and the CREATE POLICY statement itself fails. Migration 39 therefore
--      may never have applied in production, which would leave
--      `order_modifications` with RLS ENABLED and NO policies — denying
--      everyone. This migration recreates the policies unconditionally so the
--      end state is correct either way.
--
--   2. deploy/supabase/38-support-tickets.sql
--        CHECK (user_role IN ('customer','driver','restaurant_owner','admin'))
--      Writing the canonical 'restaurant' raised 23514, so the application
--      carried a temporary write-boundary mapping. This migration corrects the
--      constraint so that workaround can be removed.
--
-- Design notes
-- ------------
-- * All role comparisons use `role::text` instead of bare enum literals. This
--   is deliberate: it cannot fail regardless of which labels the deployed enum
--   actually contains, and it lets `super_admin` remain listed (preserving the
--   original policy intent) without requiring that label to exist in the enum.
-- * `super_admin` and `manager` are intentionally left untouched otherwise.
-- * The enum is NOT modified and `restaurant_owner` is NOT added anywhere.
-- * Fully idempotent: safe to run repeatedly.
--
-- ORDER OF DEPLOYMENT
-- -------------------
-- Apply this migration BEFORE deploying the application change that writes
-- 'restaurant' into support_tickets.user_role. Running it first is safe for the
-- currently deployed application: step 2 keeps accepting the legacy value until
-- the new CHECK is installed, and existing rows are migrated in the same
-- transaction.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. SUPPORT TICKETS — migrate legacy rows, then correct the CHECK
-- ------------------------------------------------------------

-- 1a. Drop the existing CHECK constraint on user_role BY ITS REAL DEPLOYED
--     NAME, discovered from the catalog rather than assumed (auto-generated
--     constraint names are not guaranteed).
--
--     ORDER MATTERS: the constraint must be dropped BEFORE the data is
--     migrated. The legacy CHECK does not allow 'restaurant', so an UPDATE
--     to the canonical value while it is still in force fails with 23514.
--     (Verified against a real PostgreSQL 16 instance.)
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class      t ON t.oid = c.conrelid
      JOIN pg_namespace  n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'support_tickets'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%user_role%'
  LOOP
    EXECUTE format('ALTER TABLE public.support_tickets DROP CONSTRAINT %I', con.conname);
    RAISE NOTICE 'Dropped legacy constraint %', con.conname;
  END LOOP;
END $$;

-- 1b. Migrate existing legacy rows to the canonical value. The old constraint
--     is gone and the new one is not installed yet, so this cannot fail.
UPDATE public.support_tickets
   SET user_role = 'restaurant'
 WHERE user_role = 'restaurant_owner';

-- 1c. Install the corrected constraint under a stable, explicit name.
--     Guarded so a rerun is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'support_tickets'
       AND c.conname = 'support_tickets_user_role_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_user_role_check
      CHECK (user_role IN ('customer', 'driver', 'restaurant', 'admin'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. ORDER MODIFICATIONS — recreate RLS policies with the canonical role
-- ------------------------------------------------------------
-- RLS stays ENABLED throughout; policies are replaced, never removed without
-- a replacement.
--
-- Permissions granted:
--   * the order's own customer        → read their own modifications
--   * admin / super_admin             → global read + update (unchanged)
--   * restaurant owners               → read + update ONLY for modifications
--                                       belonging to orders placed at a
--                                       restaurant they own
--
-- The restaurant scoping is deliberately TIGHTER than the legacy policy, which
-- granted every `restaurant_owner` global access to all order modifications
-- across all restaurants. Restricting each restaurant to its own orders
-- strengthens RLS; it never widens it. Ownership is resolved through
-- public.restaurants.owner_id, which is the same relationship the application
-- uses to resolve a restaurant for a user.

ALTER TABLE public.order_modifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modifications_read" ON public.order_modifications;
CREATE POLICY "modifications_read" ON public.order_modifications
  FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
    OR auth.uid() IN (
         SELECT id FROM public.users
          WHERE role::text IN ('admin', 'super_admin')
       )
    OR order_id IN (
         SELECT o.id
           FROM public.orders o
           JOIN public.restaurants r ON r.id = o.restaurant_id
          WHERE r.owner_id = auth.uid()
       )
  );

-- Unchanged in substance: a user may only record modifications as themselves.
DROP POLICY IF EXISTS "modifications_insert" ON public.order_modifications;
CREATE POLICY "modifications_insert" ON public.order_modifications
  FOR INSERT TO authenticated
  WITH CHECK (modified_by = auth.uid());

DROP POLICY IF EXISTS "modifications_update" ON public.order_modifications;
CREATE POLICY "modifications_update" ON public.order_modifications
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.users
       WHERE role::text IN ('admin', 'super_admin')
    )
    OR order_id IN (
         SELECT o.id
           FROM public.orders o
           JOIN public.restaurants r ON r.id = o.restaurant_id
          WHERE r.owner_id = auth.uid()
       )
  );

COMMIT;

-- ============================================================
-- VERIFICATION (safe to run manually after applying)
-- ============================================================
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'public.support_tickets'::regclass AND contype = 'c';
--
-- SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--   FROM pg_policy
--  WHERE polrelid = 'public.order_modifications'::regclass;
--
-- SELECT user_role, count(*) FROM public.support_tickets GROUP BY user_role;
