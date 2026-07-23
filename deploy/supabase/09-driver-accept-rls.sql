-- ════════════════════════════════════════════════════════════════
-- Fix: السائق لا يستطيع قبول طلب لأن RLS UPDATE يطلب driver_id=auth.uid()
-- لكن driver_id = NULL قبل القبول
-- الحل: USING يسمح بـ driver_id IS NULL للسائق
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "orders_update_involved" ON orders;

CREATE POLICY "orders_update_involved" ON orders
  FOR UPDATE
  USING (
    -- الزبون يحدّث طلبه
    auth.uid() = customer_id
    -- السائق يحدّث إما طلبه أو طلب بدون سائق (للقبول)
    OR auth.uid() = driver_id
    OR (
      driver_id IS NULL
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid() AND u.role = 'driver'
      )
    )
    -- المطعم يحدّث طلبات مطعمه
    OR EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
    )
    -- المدير الكل
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (true);  -- لا قيود على الـ row الجديد

SELECT '✅ orders_update RLS fixed' AS status;