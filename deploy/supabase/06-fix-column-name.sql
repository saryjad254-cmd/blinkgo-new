-- ════════════════════════════════════════════════════════════════
-- Fix Bug: "column 'unit_price' does not exist"
--       + all previous bugs
--
-- السبب: جدول order_items يستخدم product_price (مو unit_price)
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS create_order_with_items CASCADE;
DROP FUNCTION IF EXISTS create_order_with_items(UUID, JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS create_order_with_items(UUID, JSONB, JSONB, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_order_with_items(UUID, JSONB, JSONB, TEXT, NUMERIC, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS create_order_with_items(UUID, JSONB, JSONB, TEXT, NUMERIC, NUMERIC, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_order_with_items(UUID, JSONB, JSONB, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_order_with_items(UUID, JSONB, JSONB, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC) CASCADE;

CREATE FUNCTION create_order_with_items(
  p_restaurant_id UUID,
  p_items JSONB,
  p_delivery_address JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_customer_latitude NUMERIC DEFAULT NULL,
  p_customer_longitude NUMERIC DEFAULT NULL,
  p_delivery_instructions TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL,
  p_tip NUMERIC DEFAULT 0
)
RETURNS TABLE(order_id UUID, order_number TEXT, total NUMERIC, discount NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_restaurant RECORD;
  v_order_id UUID;
  v_order_number TEXT;
  v_subtotal NUMERIC := 0;
  v_delivery_fee NUMERIC := 0;
  v_service_fee NUMERIC := 0;
  v_tax NUMERIC := 0;
  v_discount NUMERIC := 0;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product RECORD;
  v_item_subtotal NUMERIC;
  v_coupon_id UUID;
  v_coupon_discount_type TEXT;
  v_coupon_discount_value NUMERIC;
  v_coupon_min_order NUMERIC;
  v_coupon_max_discount NUMERIC;
BEGIN
  SELECT * INTO v_restaurant FROM restaurants WHERE id = p_restaurant_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'المطعم غير موجود'; END IF;
  IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'لا توجد عناصر'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product FROM products
    WHERE id = (v_item->>'product_id')::UUID
      AND restaurant_id = p_restaurant_id
      AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'المنتج غير متاح'; END IF;
    v_item_subtotal := v_product.price * (v_item->>'quantity')::NUMERIC;
    v_subtotal := v_subtotal + v_item_subtotal;
  END LOOP;

  IF v_restaurant.min_order_amount IS NOT NULL AND v_subtotal < v_restaurant.min_order_amount THEN
    RAISE EXCEPTION 'الحد الأدنى % ر.س', v_restaurant.min_order_amount;
  END IF;

  v_delivery_fee := COALESCE(v_restaurant.delivery_fee, 0);
  v_service_fee := v_subtotal * 0.05;
  v_tax := v_subtotal * 0.15;

  IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
    SELECT c.id, c.type, c.value, c.min_order_amount, c.max_discount
    INTO v_coupon_id, v_coupon_discount_type, v_coupon_discount_value, v_coupon_min_order, v_coupon_max_discount
    FROM coupons c
    WHERE c.code = TRIM(p_coupon_code)
      AND c.is_active = true
      AND (c.start_date IS NULL OR NOW() >= c.start_date)
      AND (c.end_date IS NULL OR NOW() <= c.end_date)
      AND (c.usage_limit IS NULL OR c.usage_count < c.usage_limit);

    IF FOUND THEN
      IF v_coupon_min_order IS NULL OR v_subtotal >= v_coupon_min_order THEN
        IF v_coupon_discount_type = 'percentage' THEN
          v_discount := LEAST(v_subtotal * v_coupon_discount_value / 100, COALESCE(v_coupon_max_discount, v_subtotal));
        ELSE
          v_discount := LEAST(COALESCE(v_coupon_discount_value, 0), v_subtotal);
        END IF;
      END IF;
    END IF;
  END IF;

  v_total := v_subtotal + v_delivery_fee + v_service_fee + v_tax - v_discount + COALESCE(p_tip, 0);

  INSERT INTO orders (customer_id, restaurant_id, status, subtotal, delivery_fee, service_fee, tax, discount, total, tip, payment_method, payment_status, delivery_address, customer_latitude, customer_longitude, delivery_instructions)
  VALUES (auth.uid(), p_restaurant_id, 'pending', v_subtotal, v_delivery_fee, v_service_fee, v_tax, v_discount, v_total, COALESCE(p_tip, 0), p_payment_method, 'pending', p_delivery_address, p_customer_latitude, p_customer_longitude, p_delivery_instructions)
  RETURNING orders.id, orders.order_number INTO v_order_id, v_order_number;

  -- ✅ FIX: استخدم product_price (مو unit_price)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
    INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
    VALUES (v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::INTEGER, v_product.price * (v_item->>'quantity')::NUMERIC);
  END LOOP;

  IF v_coupon_id IS NOT NULL THEN
    INSERT INTO coupon_usage (coupon_id, user_id, order_id) VALUES (v_coupon_id, auth.uid(), v_order_id);
  END IF;

  RETURN QUERY SELECT v_order_id, v_order_number, v_total, v_discount;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_with_items TO authenticated;

SELECT 'create_order_with_items updated successfully' AS status;