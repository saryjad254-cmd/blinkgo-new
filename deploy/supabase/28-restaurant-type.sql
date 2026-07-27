-- ============================================================
-- v43: Add type column to restaurants
-- ============================================================
-- Adds a `type` column to restaurants for filtering by category:
-- - 'restaurant' (default for food)
-- - 'market' (grocery)
-- - 'pharmacy'

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'restaurant'
    CHECK (type IN ('restaurant', 'market', 'pharmacy'));

-- Backfill existing rows
UPDATE public.restaurants
  SET type = 'restaurant'
  WHERE type IS NULL;

-- Create an index for fast filtering
CREATE INDEX IF NOT EXISTS idx_restaurants_type ON public.restaurants(type)
  WHERE is_active = true;

-- Update RLS to allow admin to update type
DROP POLICY IF EXISTS "restaurants_admin_update" ON public.restaurants;
CREATE POLICY "restaurants_admin_update" ON public.restaurants
  FOR UPDATE USING (
    auth_role() = 'admin' OR owner_id = auth_uid()
  );

COMMENT ON COLUMN public.restaurants.type IS 'Type of establishment: restaurant, market, or pharmacy';
