-- ============================================================
-- BlinkGo MVP — Aggregations & Triggers
-- ============================================================
-- يحافظ على البيانات المحسوبة تلقائيًا:
-- - restaurants.rating / review_count
-- - products.sold_count
-- - coupons.usage_count
-- ============================================================

-- ----------------------------------------------------
-- تحديث rating و review_count للمطعم بعد أي تقييم
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION update_restaurant_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_restaurant_id UUID;
BEGIN
  -- الحصول على restaurant_id من الـ order
  SELECT restaurant_id INTO v_restaurant_id
  FROM orders WHERE id = NEW.order_id;

  IF v_restaurant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- إعادة حساب المتوسط والعدد
  UPDATE restaurants
  SET
    rating = COALESCE((
      SELECT AVG(rating)::DECIMAL(3,2)
      FROM reviews
      WHERE restaurant_id = v_restaurant_id
    ), 0),
    review_count = (
      SELECT COUNT(*)
      FROM reviews
      WHERE restaurant_id = v_restaurant_id
    ),
    updated_at = NOW()
  WHERE id = v_restaurant_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_restaurant_rating ON reviews;
CREATE TRIGGER trigger_update_restaurant_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_restaurant_rating();

-- ----------------------------------------------------
-- تحديث sold_count للمنتج عند delivered
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION update_product_sold_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- فقط عند تحول الحالة إلى delivered
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    UPDATE products p
    SET sold_count = p.sold_count + oi.quantity
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_product_sold_count ON orders;
CREATE TRIGGER trigger_update_product_sold_count
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_product_sold_count();

-- ----------------------------------------------------
-- تحديث usage_count للكوبون
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION update_coupon_usage_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE coupons
  SET usage_count = usage_count + 1
  WHERE id = NEW.coupon_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_coupon_usage_count ON coupon_usage;
CREATE TRIGGER trigger_update_coupon_usage_count
  AFTER INSERT ON coupon_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_coupon_usage_count();

-- ----------------------------------------------------
-- إنشاء إشعار تلقائيًا عند تغير حالة الطلب
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_type TEXT := 'order';
BEGIN
  -- فقط إذا تغيرت الحالة فعليًا
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_title := 'تحديث الطلب';
  v_body := 'حالة طلبك تغيرت إلى: ' || NEW.status;

  -- للعميل
  IF NEW.customer_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      NEW.customer_id, v_type, v_title, v_body,
      jsonb_build_object('order_id', NEW.id, 'status', NEW.status)
    );
  END IF;

  -- للسائق (إذا تم تعيينه)
  IF NEW.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      NEW.driver_id, 'driver',
      'طلب جديد',
      'تم تعيينك للطلب ' || NEW.order_number,
      jsonb_build_object('order_id', NEW.id, 'status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_order_status ON orders;
CREATE TRIGGER trigger_notify_order_status
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_status_change();

COMMENT ON FUNCTION update_restaurant_rating() IS 'يُحدّث restaurants.rating و review_count تلقائيًا';
COMMENT ON FUNCTION update_product_sold_count() IS 'يزيد products.sold_count عند توصيل الطلب';
COMMENT ON FUNCTION update_coupon_usage_count() IS 'يزيد coupons.usage_count عند استخدام الكوبون';
COMMENT ON FUNCTION notify_order_status_change() IS 'ينشئ إشعارًا تلقائيًا عند تغير حالة الطلب';