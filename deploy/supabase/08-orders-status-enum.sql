-- ════════════════════════════════════════════════════════════════
-- Fix: إضافة 'assigned' للـ orders.status enum
-- (مفقودة من schema الأساسي، نضيفها الآن)
-- ════════════════════════════════════════════════════════════════

-- قائمة الحالات المتوقعة:
-- pending → confirmed → preparing → ready → assigned → picked_up → delivering → delivered
-- أو: pending → assigned (السائق يقبل) → picked_up → delivering → delivered

-- 1) أنشئ enum type جديد يشمل 'assigned'
DO $$
BEGIN
  -- تحقق من الحالات الموجودة
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'orders_status_check'  -- or actual name
      AND e.enumlabel = 'assigned'
  ) THEN
    -- نحتاج لإضافة 'assigned' للـ check constraint أو enum
    -- PostgreSQL CHECK constraint with IN(...) → نحتاج DROP/ADD
    -- لكن الافضل: استخدم ALTER TABLE لتحديث الـ CHECK constraint
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

    ALTER TABLE orders
      ADD CONSTRAINT orders_status_check
      CHECK (status IN (
        'pending',
        'confirmed',
        'preparing',
        'ready',
        'assigned',        -- ✅ جديد: السائق قبل الطلب
        'picked_up',      -- السائق استلم من المطعم
        'delivering',     -- في الطريق
        'delivered',      -- تم التسليم
        'cancelled'       -- ملغي
      ));
  END IF;
END $$;

SELECT '✅ orders_status_check updated' AS status;

-- عرض الحالات المتاحة
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname LIKE '%orders%status%'
ORDER BY enumsortorder;