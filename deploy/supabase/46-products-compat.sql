-- ════════════════════════════════════════════════════════════════
-- BlinkGo v79 — Products Compatibility Migration
-- ════════════════════════════════════════════════════════════════
-- Production DB was missing columns that the application code
-- relies on (search, bestsellers, recent, restaurant menu, etc).
-- This migration is fully idempotent (uses IF NOT EXISTS) and
-- safe to run on any environment.
--
-- Run in Supabase Dashboard SQL Editor (or via `supabase db push`).
-- Created 2026-07-25.
-- ════════════════════════════════════════════════════════════════

-- 1) Add the canonical boolean column used by the search/listing APIs.
--    Default TRUE so existing rows are immediately visible.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2) Add the legacy / alias column that the restaurant menu pages
--    and the order-creation endpoint expect. Default TRUE.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;

-- 3) Sold count — used by bestsellers and recommendations to sort
--    "popular" products. Default 0.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0;

-- 4) Featured flag — used by restaurant menu pages to highlight
--    top products. Default FALSE.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- 5) Multi-image support — replace single `image_url` with an array.
--    Migrate existing data: copy image_url into image_urls[0] if needed.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

UPDATE public.products
SET image_urls = ARRAY[image_url]::TEXT[]
WHERE image_url IS NOT NULL
  AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) = 0);

-- 6) Discounted price (nullable — most products do not have one).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_price NUMERIC(10, 2);

-- 7) Stock count + track-stock flag — used by the restaurant menu UI.
--    The 14-complete-schema.sql has stock_count + in_stock; this adds
--    the `stock` and `track_stock` columns the code expects.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT FALSE;

-- 8) Preparation time (minutes) — used by the menu edit page and the
--    orders API. Schema 14 has `prep_time`; code uses `preparation_time`.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS preparation_time INTEGER NOT NULL DEFAULT 15;

-- 9) Category id (text) — used by the menu edit page. Distinct from
--    the free-text `category` column on the same row, this is the
--    foreign key to a categories table when one exists.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id TEXT;

-- 10) Display order, badges, ingredients — restaurant menu display.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ingredients TEXT[] NOT NULL DEFAULT '{}';

-- 11) Structured option data (extras / sizes / options) — JSONB.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sizes JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 12) Pharmacy / Rx flags — used by the pharmacy category.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS market_section TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pharmacy_category TEXT;

-- 13) Backfill: copy `is_active` to `is_available` and vice versa so
--     both stay in sync for any code path that uses either.
UPDATE public.products SET is_available = is_active WHERE is_available IS DISTINCT FROM is_active;
UPDATE public.products SET is_active = is_available WHERE is_active IS DISTINCT FROM is_available;

-- 14) Backfill: keep `stock_count` and `stock` in sync.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'stock_count'
  ) THEN
    UPDATE public.products SET stock = stock_count WHERE stock IS DISTINCT FROM stock_count;
  END IF;
END $$;

-- 15) Backfill: keep `prep_time` and `preparation_time` in sync.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'prep_time'
  ) THEN
    UPDATE public.products SET preparation_time = prep_time WHERE preparation_time IS DISTINCT FROM prep_time;
  END IF;
END $$;

-- 16) Indexes that the search and bestsellers routes depend on.
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_available ON public.products(is_available);
CREATE INDEX IF NOT EXISTS idx_products_sold_count ON public.products(sold_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_restaurant_active ON public.products(restaurant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON public.products(stock) WHERE track_stock = TRUE AND stock > 0;

-- 17) Sanity check — the migration only succeeds if all expected
--     columns now exist. If any are missing, raise an exception.
DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
  expected TEXT[] := ARRAY[
    'is_active', 'is_available', 'sold_count', 'is_featured',
    'image_urls', 'discount_price', 'stock', 'track_stock',
    'preparation_time', 'category_id', 'display_order',
    'badges', 'ingredients', 'extras', 'sizes', 'options',
    'requires_prescription', 'market_section', 'pharmacy_category'
  ];
BEGIN
  FOREACH col IN ARRAY expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'products'
        AND column_name = col
    ) THEN
      missing := array_append(missing, col);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'products compatibility migration incomplete — missing columns: %', array_to_string(missing, ', ');
  END IF;
END $$;

SELECT '✅ Products compatibility migration applied' AS status,
       (SELECT COUNT(*) FROM public.products) AS products_total;
