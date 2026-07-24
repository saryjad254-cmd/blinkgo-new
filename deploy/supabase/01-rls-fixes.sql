-- ============================================================
-- BlinkGo MVP — RLS Policies الإصلاحية
-- ============================================================
-- يُضيف السياسات الناقصة في الـ Schema الأصلي
-- يجب تشغيله بعد supabase-schema.sql + 00-auth-sync.sql
-- ============================================================

-- ----------------------------------------------------
-- categories: لا توجد سياسات → كلها فارغة حاليًا
-- ----------------------------------------------------
DROP POLICY IF EXISTS "categories_select_all" ON categories;
CREATE POLICY "categories_select_all" ON categories
  FOR SELECT USING (is_active = true OR auth_role() = 'admin');

DROP POLICY IF EXISTS "categories_insert_admin" ON categories;
CREATE POLICY "categories_insert_admin" ON categories
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'restaurant'));

DROP POLICY IF EXISTS "categories_update_admin" ON categories;
CREATE POLICY "categories_update_admin" ON categories
  FOR UPDATE USING (auth_role() IN ('admin', 'restaurant'));

DROP POLICY IF EXISTS "categories_delete_admin" ON categories;
CREATE POLICY "categories_delete_admin" ON categories
  FOR DELETE USING (auth_role() IN ('admin', 'restaurant'));

-- ----------------------------------------------------
-- product_variants: لم يُفعل RLS أصلًا
-- ----------------------------------------------------
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_variants_select_all" ON product_variants;
CREATE POLICY "product_variants_select_all" ON product_variants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "product_variants_modify_restaurant" ON product_variants;
CREATE POLICY "product_variants_modify_restaurant" ON product_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN restaurants r ON r.id = p.restaurant_id
      WHERE p.id = product_variants.product_id
        AND (r.owner_id = auth.uid() OR auth_role() = 'admin')
    )
  );

-- ----------------------------------------------------
-- product_extras: لم يُفعل RLS أصلًا
-- ----------------------------------------------------
ALTER TABLE product_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_extras_select_all" ON product_extras;
CREATE POLICY "product_extras_select_all" ON product_extras
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "product_extras_modify_restaurant" ON product_extras;
CREATE POLICY "product_extras_modify_restaurant" ON product_extras
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN restaurants r ON r.id = p.restaurant_id
      WHERE p.id = product_extras.product_id
        AND (r.owner_id = auth.uid() OR auth_role() = 'admin')
    )
  );

-- ----------------------------------------------------
-- products: INSERT و DELETE ناقصان
-- ----------------------------------------------------
DROP POLICY IF EXISTS "products_insert_restaurant" ON products;
CREATE POLICY "products_insert_restaurant" ON products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = products.restaurant_id
        AND (restaurants.owner_id = auth.uid() OR auth_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS "products_delete_restaurant" ON products;
CREATE POLICY "products_delete_restaurant" ON products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = products.restaurant_id
        AND (restaurants.owner_id = auth.uid() OR auth_role() = 'admin')
    )
  );

-- ----------------------------------------------------
-- users: INSERT و admin UPDATE ناقصان
-- ----------------------------------------------------
-- INSERT: الـ Trigger handle_new_user يستخدم SECURITY DEFINER،
-- لكن تطبيق mobile قد يحتاج INSERT يدوي في حالات خاصة
DROP POLICY IF EXISTS "users_insert_self" ON users;
CREATE POLICY "users_insert_self" ON users
  FOR INSERT WITH CHECK (auth.uid() = id OR auth_role() = 'admin');

-- UPDATE: الأدمن يحتاج تحديث role وحالة is_active
DROP POLICY IF EXISTS "users_update_admin" ON users;
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (auth.uid() = id OR auth_role() = 'admin');

-- ----------------------------------------------------
-- driver_status: INSERT ناقص — السائق لا يستطيع تهيئة صفه
-- ----------------------------------------------------
DROP POLICY IF EXISTS "driver_status_insert_self" ON driver_status;
CREATE POLICY "driver_status_insert_self" ON driver_status
  FOR INSERT WITH CHECK (auth.uid() = driver_id OR auth_role() = 'admin');

-- ----------------------------------------------------
-- reviews: UPDATE و DELETE ناقصان
-- ----------------------------------------------------
DROP POLICY IF EXISTS "reviews_update_owner" ON reviews;
CREATE POLICY "reviews_update_owner" ON reviews
  FOR UPDATE USING (auth.uid() = user_id OR auth_role() = 'admin');

DROP POLICY IF EXISTS "reviews_delete_owner" ON reviews;
CREATE POLICY "reviews_delete_owner" ON reviews
  FOR DELETE USING (auth.uid() = user_id OR auth_role() = 'admin');

-- ----------------------------------------------------
-- coupons: لا SELECT ولا INSERT
-- ----------------------------------------------------
DROP POLICY IF EXISTS "coupons_select_active" ON coupons;
CREATE POLICY "coupons_select_active" ON coupons
  FOR SELECT USING (
    is_active = true
    AND NOW() BETWEEN start_date AND end_date
    AND (usage_limit IS NULL OR usage_count < usage_limit)
  );

DROP POLICY IF EXISTS "coupons_admin_all" ON coupons;
CREATE POLICY "coupons_admin_all" ON coupons
  FOR ALL USING (auth_role() = 'admin' OR auth_role() = 'restaurant');

-- ----------------------------------------------------
-- coupon_usage: SELECT و INSERT ناقصان
-- ----------------------------------------------------
ALTER TABLE coupon_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupon_usage_select_own" ON coupon_usage;
CREATE POLICY "coupon_usage_select_own" ON coupon_usage
  FOR SELECT USING (auth.uid() = user_id OR auth_role() = 'admin');

DROP POLICY IF EXISTS "coupon_usage_insert_self" ON coupon_usage;
CREATE POLICY "coupon_usage_insert_self" ON coupon_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------
-- conversations: لا سياسات → الشات معطّل
-- ----------------------------------------------------
DROP POLICY IF EXISTS "conversations_select_participant" ON conversations;
CREATE POLICY "conversations_select_participant" ON conversations
  FOR SELECT USING (auth.uid() = ANY(participants) OR auth_role() = 'admin');

DROP POLICY IF EXISTS "conversations_insert_self" ON conversations;
CREATE POLICY "conversations_insert_self" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = ANY(participants));

DROP POLICY IF EXISTS "conversations_update_participant" ON conversations;
CREATE POLICY "conversations_update_participant" ON conversations
  FOR UPDATE USING (auth.uid() = ANY(participants));

DROP POLICY IF EXISTS "conversations_delete_admin" ON conversations;
CREATE POLICY "conversations_delete_admin" ON conversations
  FOR DELETE USING (auth_role() = 'admin');

-- ----------------------------------------------------
-- messages: لا سياسات
-- ----------------------------------------------------
DROP POLICY IF EXISTS "messages_select_participant" ON messages;
CREATE POLICY "messages_select_participant" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (auth.uid() = ANY(c.participants) OR auth_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS "messages_insert_participant" ON messages;
CREATE POLICY "messages_insert_participant" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND auth.uid() = ANY(c.participants)
    )
  );

DROP POLICY IF EXISTS "messages_update_sender" ON messages;
CREATE POLICY "messages_update_sender" ON messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- ----------------------------------------------------
-- notifications: UPDATE ناقص (لوضع علامة is_read)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert_system" ON notifications;
CREATE POLICY "notifications_insert_system" ON notifications
  FOR INSERT WITH CHECK (auth_role() = 'admin' OR auth_role() = 'system' OR auth.uid() = user_id);

-- ----------------------------------------------------
-- orders: DELETE ناقص (للـ admin)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "orders_delete_admin" ON orders;
CREATE POLICY "orders_delete_admin" ON orders
  FOR DELETE USING (auth_role() = 'admin');

-- ----------------------------------------------------
-- order_items: لا RLS أصلًا
-- ----------------------------------------------------
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select_involved" ON order_items;
CREATE POLICY "order_items_select_involved" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND (auth.uid() = o.customer_id
             OR auth.uid() = o.driver_id
             OR auth_role() IN ('admin', 'restaurant'))
    )
  );

DROP POLICY IF EXISTS "order_items_insert_customer" ON order_items;
CREATE POLICY "order_items_insert_customer" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND auth.uid() = o.customer_id
    )
  );

-- تعليق نهائي
COMMENT ON POLICY "categories_select_all" ON categories IS 'السماح للجميع بمشاهدة الفئات النشطة';
COMMENT ON POLICY "driver_status_insert_self" ON driver_status IS 'السماح للسائق بتهيئة صف حالته عند أول تسجيل';