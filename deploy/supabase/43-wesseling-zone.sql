-- 43. Wesseling Delivery Zone
-- Covers the entire city of Wesseling, Germany (Rhein-Erft-Kreis)
-- Adds two zones:
--   1. Radius-based (3 km) for fast lookup
--   2. Polygon-based for precise city boundaries

-- Create table if it doesn't exist (for projects that skipped migration 36)
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  polygon JSONB,
  center_lat NUMERIC(10,7),
  center_lng NUMERIC(10,7),
  radius_km NUMERIC(8,2),
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 3.99,
  min_order_amount NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON public.delivery_zones(is_active);

-- Enable RLS
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "zones_read" ON public.delivery_zones;
DROP POLICY IF EXISTS "zones_admin_write" ON public.delivery_zones;
DROP POLICY IF EXISTS "delivery_zones_read" ON public.delivery_zones;

-- Allow read for all (anon + authenticated)
CREATE POLICY "zones_read" ON public.delivery_zones FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- Admin write
CREATE POLICY "zones_admin_write" ON public.delivery_zones FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Insert Wesseling radius zone (3 km from city center)
INSERT INTO public.delivery_zones (
  name,
  description,
  center_lat,
  center_lng,
  radius_km,
  delivery_fee,
  min_order_amount,
  priority,
  is_active
) VALUES (
  'Wesseling (Complete City)',
  'Lieferzone für die gesamte Stadt Wesseling, Rhein-Erft-Kreis. Deckt alle Stadtteile ab: Wesseling-Mitte, Berzdorf, Keldenich, Urfeld, Eichholz.',
  50.8233,
  6.9772,
  3.0,
  2.99,
  10.00,
  50,
  true
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  center_lat = EXCLUDED.center_lat,
  center_lng = EXCLUDED.center_lng,
  radius_km = EXCLUDED.radius_km,
  delivery_fee = EXCLUDED.delivery_fee,
  min_order_amount = EXCLUDED.min_order_amount,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Wesseling polygon zone (precise boundaries)
-- Covers the actual city shape of Wesseling
INSERT INTO public.delivery_zones (
  name,
  description,
  polygon,
  delivery_fee,
  min_order_amount,
  priority,
  is_active
) VALUES (
  'Wesseling Polygon (Precise)',
  'Präzises Polygon der Wesseling Stadtgrenzen',
  '[
    [50.8420, 6.9450], [50.8450, 6.9650], [50.8430, 6.9850],
    [50.8400, 7.0000], [50.8350, 7.0100], [50.8250, 7.0120],
    [50.8150, 7.0080], [50.8050, 7.0000], [50.7980, 6.9900],
    [50.7920, 6.9750], [50.7900, 6.9600], [50.7930, 6.9450],
    [50.8000, 6.9380], [50.8120, 6.9350], [50.8250, 6.9380],
    [50.8350, 6.9420]
  ]'::jsonb,
  2.99,
  10.00,
  60,
  true
)
ON CONFLICT (name) DO UPDATE SET
  polygon = EXCLUDED.polygon,
  delivery_fee = EXCLUDED.delivery_fee,
  min_order_amount = EXCLUDED.min_order_amount,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
