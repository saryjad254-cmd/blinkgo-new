-- ════════════════════════════════════════════════════════════════
-- Fix: RLS policy ناقص لجدول orders
-- المطعم والسائق لا يستطيعان رؤية الطلبات
-- ════════════════════════════════════════════════════════════════

-- تأكد أن RLS مفعّل
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- حذف أي policies قديمة مكررة
DROP POLICY IF EXISTS "orders_select_involved" ON orders;
DROP POLICY IF EXISTS "orders_select_all_for_admin" ON orders;
DROP POLICY IF EXISTS "orders_select_customer" ON orders;
DROP POLICY IF EXISTS "orders_select_restaurant" ON orders;
DROP POLICY IF EXISTS "orders_select_driver" ON orders;

-- Policy: الزبون يرى طلباته
CREATE POLICY "orders_select_customer" ON orders
  FOR SELECT USING (auth.uid() = customer_id);

-- Policy: السائق يرى طلباته المخصصة
CREATE POLICY "orders_select_driver" ON orders
  FOR SELECT USING (auth.uid() = driver_id);

-- Policy: المطعم يرى طلبات مطعمه (عبر owner_id)
CREATE POLICY "orders_select_restaurant" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = orders.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

-- Policy: المدير يرى الكل
CREATE POLICY "orders_select_all_for_admin" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Policy: السائق يرى أيضاً الطلبات المتاحة (status='pending' بدون driver_id)
-- مهم لتطبيقات التوصيل
DROP POLICY IF EXISTS "orders_select_available_for_drivers" ON orders;
CREATE POLICY "orders_select_available_for_drivers" ON orders
  FOR SELECT USING (
    status IN ('pending', 'confirmed', 'ready')
    AND driver_id IS NULL
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'driver'
    )
  );

-- INSERT: الزبون فقط
DROP POLICY IF EXISTS "orders_insert_customer" ON orders;
CREATE POLICY "orders_insert_customer" ON orders
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- UPDATE: الزبون يحدّث طلبه، المطعم يحدّث طلبات مطعمه، السائق يحدّث، المدير الكل
DROP POLICY IF EXISTS "orders_update_involved" ON orders;
CREATE POLICY "orders_update_involved" ON orders
  FOR UPDATE USING (
    auth.uid() = customer_id
    OR auth.uid() = driver_id
    OR EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

SELECT '✅ RLS policies updated successfully' AS status;