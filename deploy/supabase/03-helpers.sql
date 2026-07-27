-- ============================================================
-- BlinkGo MVP — Helpers & Utility Functions
-- ============================================================
-- دوال مساعدة يُستخدَمها الـ Frontend بشكل آمن
-- ============================================================

-- ----------------------------------------------------
-- دوال RPC لإنشاء الطلب بشكل Transactional
-- ----------------------------------------------------

-- إنشاء طلب كامل مع العناصر في عملية واحدة
CREATE OR REPLACE FUNCTION create_order_with_items(
  p_restaurant_id UUID,
  p_items JSONB,           -- [{"product_id":"...", "quantity":2, "variant_ids":[], "extra_ids":[], "product_name":"...", "product_price":12.00}, ...]
  p_delivery_address JSONB,
  p_payment_method TEXT,
  p_customer_latitude DECIMAL DEFAULT NULL,
  p_customer_longitude DECIMAL DEFAULT NULL,
  p_delivery_instructions TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_subtotal DECIMAL(10,2) := 0;
  v_delivery_fee DECIMAL(10,2);
  v_service_fee DECIMAL(10,2) := 0;
  v_tax DECIMAL(10,2) := 0;
  v_discount DECIMAL(10,2) := 0;
  v_total DECIMAL(10,2);
  v_item JSONB;
  v_item_subtotal DECIMAL(10,2);
  v_restaurant RECORD;
  v_coupon RECORD;
BEGIN
  -- التحقق من المطعم
  SELECT * INTO v_restaurant FROM restaurants WHERE id = p_restaurant_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المطعم غير موجود أو غير نشط';
  END IF;

  v_delivery_fee := v_restaurant.delivery_fee;

  -- حساب المجموع الفرعي
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_subtotal := (v_item->>'product_price')::DECIMAL * (v_item->>'quantity')::INT;
    v_subtotal := v_subtotal + v_item_subtotal;
  END LOOP;

  -- التحقق من الحد الأدنى
  IF v_subtotal < v_restaurant.min_order_amount THEN
    RAISE EXCEPTION 'الحد الأدنى للطلب هو %', v_restaurant.min_order_amount;
  END IF;

  -- تطبيق الكوبون إن وُجد
  IF p_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM coupons
    WHERE code = p_coupon_code
      AND is_active = true
      AND NOW() BETWEEN start_date AND end_date
      AND (usage_limit IS NULL OR usage_count < usage_limit)
      AND min_order_amount <= v_subtotal;

    IF FOUND THEN
      IF v_coupon.type = 'percentage' THEN
        v_discount := LEAST(
          (v_subtotal * v_coupon.value / 100),
          COALESCE(v_coupon.max_discount, v_subtotal)
        );
      ELSE
        v_discount := LEAST(v_coupon.value, v_subtotal);
      END IF;
    END IF;
  END IF;

  -- الإجمالي النهائي
  v_total := v_subtotal + v_delivery_fee + v_service_fee + v_tax - v_discount;

  -- إنشاء الطلب
  INSERT INTO orders (
    customer_id, restaurant_id, status,
    subtotal, delivery_fee, service_fee, tax, discount, total,
    payment_method, payment_status,
    delivery_address,
    customer_latitude, customer_longitude,
    restaurant_latitude, restaurant_longitude,
    delivery_instructions
  ) VALUES (
    auth.uid(), p_restaurant_id, 'pending',
    v_subtotal, v_delivery_fee, v_service_fee, v_tax, v_discount, v_total,
    p_payment_method, CASE WHEN p_payment_method = 'cash' THEN 'pending' ELSE 'pending' END,
    p_delivery_address,
    p_customer_latitude, p_customer_longitude,
    v_restaurant.latitude, v_restaurant.longitude,
    p_delivery_instructions
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  -- إدراج العناصر
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, product_id, product_name, product_price, quantity,
      variant_ids, extra_ids, subtotal
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'product_price')::DECIMAL,
      (v_item->>'quantity')::INT,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_item->'variant_ids'))::UUID[], '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_item->'extra_ids'))::UUID[], '{}'),
      (v_item->>'product_price')::DECIMAL * (v_item->>'quantity')::INT
    );
  END LOOP;

  -- تسجيل استخدام الكوبون
  IF v_coupon.id IS NOT NULL THEN
    INSERT INTO coupon_usage (coupon_id, user_id, order_id)
    VALUES (v_coupon.id, auth.uid(), v_order_id);
  END IF;

  -- إرجاع تفاصيل الطلب
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery_fee,
    'discount', v_discount,
    'total', v_total,
    'status', 'pending'
  );
END;
$$;

-- ----------------------------------------------------
-- تحديث حالة الطلب بأمان (للأدوار المختلفة)
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_now TIMESTAMP := NOW();
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  -- التحقق من الصلاحية حسب الدور
  CASE p_new_status
    WHEN 'confirmed' THEN
      IF auth_role() NOT IN ('restaurant', 'admin') OR
         (auth_role() = 'restaurant' AND NOT EXISTS (
           SELECT 1 FROM restaurants WHERE id = v_order.restaurant_id AND owner_id = auth.uid()
         )) THEN
        RAISE EXCEPTION 'غير مصرح';
      END IF;
      UPDATE orders SET status = p_new_status, accepted_at = v_now WHERE id = p_order_id;

    WHEN 'preparing' THEN
      IF auth_role() NOT IN ('restaurant', 'admin') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
      UPDATE orders SET status = p_new_status WHERE id = p_order_id;

    WHEN 'ready', 'assigned', 'picked_up', 'delivering' THEN
      IF auth_role() NOT IN ('driver', 'admin') OR
         (auth_role() = 'driver' AND v_order.driver_id != auth.uid()) THEN
        RAISE EXCEPTION 'غير مصرح';
      END IF;
      IF p_new_status = 'picked_up' THEN
        UPDATE orders SET status = p_new_status, picked_up_at = v_now WHERE id = p_order_id;
      ELSE
        UPDATE orders SET status = p_new_status WHERE id = p_order_id;
      END IF;

    WHEN 'delivered' THEN
      IF auth_role() != 'driver' OR v_order.driver_id != auth.uid() THEN
        RAISE EXCEPTION 'غير مصرح';
      END IF;
      UPDATE orders SET status = p_new_status, delivered_at = v_now, payment_status = 'paid'
        WHERE id = p_order_id;

    WHEN 'cancelled' THEN
      IF auth.uid() = v_order.customer_id OR auth_role() = 'admin' THEN
        UPDATE orders SET status = p_new_status, cancelled_at = v_now WHERE id = p_order_id;
      ELSE
        RAISE EXCEPTION 'غير مصرح للإلغاء';
      END IF;

    ELSE
      RAISE EXCEPTION 'حالة غير صالحة: %', p_new_status;
  END CASE;

  RETURN true;
END;
$$;

-- ----------------------------------------------------
-- دوال بحث جغرافي للسائقين القريبين (تحتاج PostGIS للنسخة المُحسَّنة)
-- ----------------------------------------------------
-- نسخة بسيطة بدون PostGIS — تستخدم Haversine Formula.
-- ملاحظة: نستخدم CTE لأن HAVING لا يعمل مع alias مُحسَب بدون GROUP BY،
-- والـ aggregates لا تناسب استعلام البحث عن أقرب السائقين.
CREATE OR REPLACE FUNCTION find_nearby_drivers(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_km DECIMAL DEFAULT 5
)
RETURNS TABLE (
  driver_id UUID,
  name TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  distance_km DECIMAL
)
LANGUAGE sql
STABLE
AS $$
  WITH driver_distances AS (
    SELECT
      ds.driver_id,
      u.name,
      ds.latitude,
      ds.longitude,
      (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(p_latitude)) * cos(radians(ds.latitude)) *
            cos(radians(ds.longitude) - radians(p_longitude)) +
            sin(radians(p_latitude)) * sin(radians(ds.latitude))
          ))
        )
      )::DECIMAL(5,2) AS distance_km
    FROM driver_status ds
    JOIN users u ON u.id = ds.driver_id
    WHERE ds.is_online = true
      AND ds.is_on_delivery = false
      AND ds.latitude IS NOT NULL
      AND ds.longitude IS NOT NULL
      AND u.is_active = true
      AND u.is_verified = true
  )
  SELECT
    driver_id,
    name,
    latitude,
    longitude,
    distance_km
  FROM driver_distances
  WHERE distance_km <= p_radius_km
  ORDER BY distance_km ASC;
$$;

-- ----------------------------------------------------
-- إحصائيات للوحة الإدارة (مُحسَّنة بـ indexes)
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM users),
    'total_customers', (SELECT COUNT(*) FROM users WHERE role = 'customer'),
    'total_drivers', (SELECT COUNT(*) FROM users WHERE role = 'driver'),
    'total_restaurants', (SELECT COUNT(*) FROM restaurants),
    'active_restaurants', (SELECT COUNT(*) FROM restaurants WHERE is_active = true),
    'total_orders', (SELECT COUNT(*) FROM orders),
    'orders_today', (SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE),
    'orders_pending', (SELECT COUNT(*) FROM orders WHERE status IN ('pending', 'confirmed', 'preparing')),
    'orders_delivering', (SELECT COUNT(*) FROM orders WHERE status IN ('assigned', 'picked_up', 'delivering')),
    'revenue_today', COALESCE((SELECT SUM(total) FROM orders WHERE delivered_at >= CURRENT_DATE), 0),
    'revenue_total', COALESCE((SELECT SUM(total) FROM orders WHERE status = 'delivered'), 0),
    'online_drivers', (SELECT COUNT(*) FROM driver_status WHERE is_online = true)
  );
$$;

COMMENT ON FUNCTION create_order_with_items IS 'RPC: ينشئ طلبًا مع العناصر في معاملة واحدة آمنة';
COMMENT ON FUNCTION update_order_status IS 'RPC: يحدّث حالة الطلب مع التحقق من الصلاحيات';
COMMENT ON FUNCTION find_nearby_drivers IS 'RPC: يجد السائقين المتاحين ضمن نصف قطر معين';
COMMENT ON FUNCTION get_admin_stats IS 'RPC: يُرجع إحصائيات لوحة الإدارة';