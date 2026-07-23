-- 38: Restaurant quick-filter columns
-- Supports "Free delivery", "Open now", "Promoted" filters in search

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_open_now BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_24_7 BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until TIMESTAMPTZ;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_restaurants_open_now ON restaurants(is_open_now) WHERE is_open_now = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_promoted ON restaurants(is_promoted, promoted_until) WHERE is_promoted = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_delivery_time ON restaurants(estimated_delivery_time);
CREATE INDEX IF NOT EXISTS idx_restaurants_delivery_fee ON restaurants(delivery_fee);

-- Backfill: all existing restaurants are assumed open
UPDATE restaurants SET is_open_now = true WHERE is_open_now IS NULL;
