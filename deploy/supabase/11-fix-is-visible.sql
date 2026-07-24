-- ════════════════════════════════════════════════════════════════
-- Fix: عمود is_visible مفقود + تنظيف الـ triggers
-- ════════════════════════════════════════════════════════════════

-- احذف الـ function/trigger أولاً
DROP TRIGGER IF EXISTS trg_update_restaurant_rating ON reviews CASCADE;
DROP FUNCTION IF EXISTS update_restaurant_rating() CASCADE;

-- أضف العمود الناقص إذا كانت reviews table موجودة بدون is_visible
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'is_visible')
  THEN
    ALTER TABLE reviews ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- الآن أنشئ function و trigger (مع IF EXISTS للسلامة)
CREATE OR REPLACE FUNCTION update_restaurant_rating() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE restaurants SET
      rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE restaurant_id = NEW.restaurant_id AND is_visible = true),
      review_count = (SELECT COUNT(*) FROM reviews WHERE restaurant_id = NEW.restaurant_id AND is_visible = true),
      updated_at = now()
    WHERE id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_restaurant_rating ON reviews;
CREATE TRIGGER trg_update_restaurant_rating AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_restaurant_rating();

-- تنظيف review trigger أيضاً (نفس الـ function)
DROP TRIGGER IF EXISTS trg_update_restaurant_rating_hide ON reviews;
CREATE OR REPLACE FUNCTION update_restaurant_rating_hide() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_visible = false AND OLD.is_visible = true THEN
    UPDATE restaurants SET
      rating = (SELECT ROUND(COALESCE(AVG(rating), 0)::numeric, 2) FROM reviews WHERE restaurant_id = NEW.restaurant_id AND is_visible = true),
      review_count = (SELECT COUNT(*) FROM reviews WHERE restaurant_id = NEW.restaurant_id AND is_visible = true),
      updated_at = now()
    WHERE id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hide_review ON reviews;
CREATE TRIGGER trg_hide_review AFTER UPDATE OF is_visible ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_restaurant_rating_hide();

SELECT '✅ Fix applied' AS status;