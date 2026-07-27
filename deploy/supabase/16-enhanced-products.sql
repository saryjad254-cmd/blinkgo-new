-- ============================================
-- 18 — Enhanced Product Management
-- ============================================
-- Adds: multi-image, extras, sizes, options, ingredients,
-- stock, prep_time, display_order, badges, RX-required

-- Multi-image support (array of URLs)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discount_price DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS track_stock BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preparation_time INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ingredients TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS market_section TEXT,
  ADD COLUMN IF NOT EXISTS pharmacy_category TEXT;

-- Migration helper: copy image_url → image_urls[0] if image_urls is empty
UPDATE public.products
SET image_urls = ARRAY[image_url]::TEXT[]
WHERE image_url IS NOT NULL AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- Index for sorting by sold_count (bestsellers)
CREATE INDEX IF NOT EXISTS idx_products_sold ON public.products(sold_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_display_order ON public.products(restaurant_id, display_order);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_rx ON public.products(requires_prescription) WHERE requires_prescription = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON public.products(stock) WHERE track_stock = TRUE AND stock > 0;

-- Restaurant opening hours
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{
    "monday": {"open": "09:00", "close": "22:00", "closed": false},
    "tuesday": {"open": "09:00", "close": "22:00", "closed": false},
    "wednesday": {"open": "09:00", "close": "22:00", "closed": false},
    "thursday": {"open": "09:00", "close": "22:00", "closed": false},
    "friday": {"open": "09:00", "close": "23:00", "closed": false},
    "saturday": {"open": "09:00", "close": "23:00", "closed": false},
    "sunday": {"open": "11:00", "close": "22:00", "closed": false}
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS accepting_orders BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pause_message TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'restaurant' CHECK (type IN ('restaurant', 'market', 'pharmacy'));

-- Search history (per user)
CREATE TABLE IF NOT EXISTS public.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON public.search_history(user_id, created_at DESC);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own search history" ON public.search_history;
CREATE POLICY "Users manage own search history" ON public.search_history
  FOR ALL USING (auth.uid() = user_id);

-- Recently viewed (for "Continue browsing")
CREATE TABLE IF NOT EXISTS public.recently_viewed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON public.recently_viewed(user_id, viewed_at DESC);

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own recently viewed" ON public.recently_viewed;
CREATE POLICY "Users manage own recently viewed" ON public.recently_viewed
  FOR ALL USING (auth.uid() = user_id);