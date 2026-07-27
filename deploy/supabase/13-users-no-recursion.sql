-- ════════════════════════════════════════════════════════════════
-- Fix: إزالة RLS recursion في users policy
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users_select_all" ON public.users;
DROP POLICY IF EXISTS "users_select_self" ON public.users;
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
DROP POLICY IF EXISTS "users_service_role" ON public.users;

CREATE POLICY "users_select_self" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_select_admin" ON public.users
  FOR SELECT USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "users_service_role" ON public.users
  FOR ALL USING (auth.role() = 'service_role');

SELECT '✅ users RLS policies fixed (no recursion)' AS status;
