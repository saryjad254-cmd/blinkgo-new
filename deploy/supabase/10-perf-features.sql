-- ════════════════════════════════════════════════════════════════
-- 🚀 Performance & Features Enhancement
-- ════════════════════════════════════════════════════════════════

-- 1️⃣ INDEXES للأداء (أسرع queries)
-- ════════════════════════════════════════════════════════════════

-- Orders: البحث حسب المطعم والحالة (الـ dashboard يفلتر بهما)
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status
  ON orders(restaurant_id, status, created_at DESC);

-- Orders: البحث حسب الزبون (صفحة طلباتي)
CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON orders(customer_id, created_at DESC);

-- Orders: الطلبات المتاحة للسائق
CREATE INDEX IF NOT EXISTS idx_orders_available_drivers
  ON orders(status, driver_id) WHERE driver_id IS NULL;

-- Orders: البحث بالـ order_number (للتتبع)
CREATE INDEX IF NOT EXISTS idx_orders_order_number
  ON orders(order_number);

-- Order items: البحث حسب الطلب
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);

-- Products: البحث في المطعم
CREATE INDEX IF NOT EXISTS idx_products_restaurant_available
  ON products(restaurant_id, is_available);

-- Coupons: البحث بالـ code
CREATE INDEX IF NOT EXISTS idx_coupons_code_active
  ON coupons(code) WHERE is_active = true;

-- Restaurants: البحث النشط
CREATE INDEX IF NOT EXISTS idx_restaurants_active
  ON restaurants(is_active, rating DESC) WHERE is_active = true;

-- Reviews: البحث حسب المطعم
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant
  ON reviews(restaurant_id, created_at DESC);

-- Reviews: البحث حسب الـ order
CREATE INDEX IF NOT EXISTS idx_reviews_order
  ON reviews(order_id);

-- Notifications: البحث حسب المستخدم
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- Driver status: البحث
CREATE INDEX IF NOT EXISTS idx_driver_status_online
  ON driver_status(is_online) WHERE is_online = true;

-- 2️⃣ TRIGGERS للـ auto-update updated_at
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- تطبيق على الجداول المهمة
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users', 'restaurants', 'products', 'orders', 'order_items',
    'reviews', 'coupons', 'notifications', 'categories',
    'driver_status', 'conversations', 'messages'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t
    );
  END LOOP;
END $$;

-- 3️⃣ GENERATED COLUMN للـ orders.full_address (للبحث السريع)
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'address_text'
  ) THEN
    ALTER TABLE orders
      ADD COLUMN address_text TEXT
      GENERATED ALWAYS AS (
        COALESCE(delivery_address->>'address', '')
      ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_address_text
  ON orders USING gin(to_tsvector('arabic', address_text));

-- 4️⃣ VIEW لإحصائيات المطعم السريعة
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW restaurant_dashboard_stats AS
SELECT
  r.id AS restaurant_id,
  r.name,
  r.is_active,
  r.rating,
  r.review_count,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'pending') AS pending_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('confirmed', 'preparing', 'ready')) AS active_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE) AS today_delivered,
  COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE), 0) AS today_revenue,
  COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) AS week_revenue,
  COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) AS month_revenue
FROM restaurants r
LEFT JOIN orders o ON o.restaurant_id = r.id
GROUP BY r.id, r.name, r.is_active, r.rating, r.review_count;

GRANT SELECT ON restaurant_dashboard_stats TO authenticated;

-- 5️⃣ VIEW لإحصائيات السائق
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW driver_dashboard_stats AS
SELECT
  u.id AS driver_id,
  u.name,
  u.email,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status NOT IN ('delivered', 'cancelled')) AS active_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE) AS today_delivered,
  COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE) * 0.1, 0) AS today_earnings,
  COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE - INTERVAL '7 days') * 0.1, 0) AS week_earnings,
  COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE - INTERVAL '30 days') * 0.1, 0) AS month_earnings,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered' AND o.created_at >= CURRENT_DATE - INTERVAL '7 days') AS week_deliveries
FROM users u
LEFT JOIN orders o ON o.driver_id = u.id
WHERE u.role = 'driver'
GROUP BY u.id, u.name, u.email;

GRANT SELECT ON driver_dashboard_stats TO authenticated;

-- 6️⃣ HELPER: حساب مسافة بين نقطتين (GPS)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 NUMERIC, lon1 NUMERIC,
  lat2 NUMERIC, lon2 NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  R CONSTANT NUMERIC := 6371; -- نصف قطر الأرض بالكيلومتر
  dlat NUMERIC := RADIANS(lat2 - lat1);
  dlon NUMERIC := RADIANS(lon2 - lon1);
  a NUMERIC;
BEGIN
  a := sin(dlat/2) * sin(dlat/2) +
       cos(RADIANS(lat1)) * cos(RADIANS(lat2)) *
       sin(dlon/2) * sin(dlon/2);
  RETURN R * 2 * atan2(sqrt(a), sqrt(1-a));
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_distance_km TO authenticated;

-- 7️⃣ HELPER: اقتراح أقرب سائق لطلب
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION suggest_drivers_for_order(p_order_id UUID)
RETURNS TABLE(
  driver_id UUID,
  driver_name TEXT,
  driver_lat NUMERIC,
  driver_lng NUMERIC,
  distance_km NUMERIC,
  estimated_arrival_mins INT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_restaurant RECORD;
BEGIN
  -- جلب موقع المطعم
  SELECT latitude, longitude, name INTO v_restaurant
  FROM restaurants
  WHERE id = (SELECT restaurant_id FROM orders WHERE id = p_order_id);

  IF v_restaurant.latitude IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.name,
    ds.latitude,
    ds.longitude,
    calculate_distance_km(v_restaurant.latitude, v_restaurant.longitude, ds.latitude, ds.longitude) AS distance_km,
    ROUND((calculate_distance_km(v_restaurant.latitude, v_restaurant.longitude, ds.latitude, ds.longitude) / 30.0 * 60)::numeric, 0)::int AS estimated_arrival_mins
  FROM driver_status ds
  JOIN users u ON u.id = ds.driver_id
  WHERE ds.is_online = true
    AND ds.is_on_delivery = false
    AND ds.latitude IS NOT NULL
    AND ds.longitude IS NOT NULL
  ORDER BY distance_km ASC
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION suggest_drivers_for_order TO authenticated;

-- 8️⃣ MATERIALIZED VIEW: المنتجات الأكثر مبيعاً
-- ════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW IF NOT EXISTS top_products AS
SELECT
  p.id,
  p.name,
  p.restaurant_id,
  p.price,
  COUNT(DISTINCT oi.order_id) AS times_ordered,
  SUM(oi.quantity) AS total_quantity,
  SUM(oi.subtotal) AS total_revenue
FROM products p
JOIN order_items oi ON oi.product_id = p.id
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'delivered'
  AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.name, p.restaurant_id, p.price
ORDER BY total_quantity DESC
LIMIT 50;

CREATE UNIQUE INDEX IF NOT EXISTS idx_top_products_id
  ON top_products(id);

GRANT SELECT ON top_products TO authenticated;

-- 9️⃣ HELPER: التحقق من توفر الكوبون مع cache
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION validate_coupon_fast(p_code TEXT, p_subtotal NUMERIC)
RETURNS TABLE(
  is_valid BOOLEAN,
  discount_amount NUMERIC,
  coupon_type TEXT,
  message TEXT
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_coupon RECORD;
  v_discount NUMERIC := 0;
  v_msg TEXT := 'كوبون صالح';
BEGIN
  SELECT * INTO v_coupon
  FROM coupons
  WHERE code = p_code
    AND is_active = true
    AND (start_date IS NULL OR NOW() >= start_date)
    AND (end_date IS NULL OR NOW() <= end_date)
    AND (usage_limit IS NULL OR usage_count < usage_limit);

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::numeric, ''::text, 'كود غير صالح أو منتهي'::text;
    RETURN;
  END IF;

  IF v_coupon.min_order_amount IS NOT NULL AND p_subtotal < v_coupon.min_order_amount THEN
    RETURN QUERY SELECT false, 0::numeric, v_coupon.type, 'الحد الأدنى غير محقق'::text;
    RETURN;
  END IF;

  IF v_coupon.type = 'percentage' THEN
    v_discount := LEAST(
      p_subtotal * v_coupon.value / 100,
      COALESCE(v_coupon.max_discount, p_subtotal)
    );
  ELSE
    v_discount := LEAST(COALESCE(v_coupon.value, 0), p_subtotal);
  END IF;

  RETURN QUERY SELECT true, v_discount, v_coupon.type, v_msg;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_coupon_fast TO authenticated;

-- 1️⃣0️⃣ TRIGGER: عند تأكيد الطلب، increment coupon usage
-- ════════════════════════════════════════════════════════════════
-- (تعمل بالفعل في 02-aggregations.sql — تأكد فقط)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_coupon_usage_count'
  ) THEN
    RAISE NOTICE '✅ trigger_update_coupon_usage_count already exists';
  ELSE
    -- Create the trigger
    CREATE TRIGGER trigger_update_coupon_usage_count
      AFTER INSERT ON coupon_usage
      FOR EACH ROW
      EXECUTE FUNCTION update_coupon_usage_count();
    RAISE NOTICE '✅ trigger_update_coupon_usage_count created';
  END IF;
END $$;

-- 1️⃣1️⃣ إحصائيات نهائية
-- ════════════════════════════════════════════════════════════════

SELECT '✅ Performance & Features Enhancement complete!' AS status;
SELECT
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') AS total_indexes,
  (SELECT COUNT(*) FROM pg_views WHERE schemaname = 'public') AS total_views,
  (SELECT COUNT(*) FROM pg_matviews WHERE schemaname = 'public') AS total_matviews,
  (SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS total_functions;