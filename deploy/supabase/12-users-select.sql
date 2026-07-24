-- ════════════════════════════════════════════════════════════════
-- Fix: لا توجد SELECT policy على users
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users_select_all" ON users;
CREATE POLICY "users_select_all" ON users
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_select_self" ON users;
CREATE POLICY "users_select_self" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_select_admin" ON users;
CREATE POLICY "users_select_admin" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

SELECT '✅ users SELECT policies added' AS status;