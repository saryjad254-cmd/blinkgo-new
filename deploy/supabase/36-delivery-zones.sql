-- 36. DELIVERY ZONES
-- Geographic delivery zones with custom pricing

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  -- Polygon points stored as JSON array of {lat, lng}
  -- Simple format: [[lat1, lng1], [lat2, lng2], ...]
  polygon JSONB NOT NULL,
  -- Optional center for radius-based zones
  center_lat NUMERIC(10,7),
  center_lng NUMERIC(10,7),
  radius_km NUMERIC(8,2),
  -- Pricing
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 3.99,
  min_order_amount NUMERIC(10,2) DEFAULT 0,
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Priority (higher = preferred when overlapping)
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON public.delivery_zones(is_active);

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

-- Everyone can read active zones
DROP POLICY IF EXISTS "zones_read" ON public.delivery_zones;
CREATE POLICY "zones_read" ON public.delivery_zones FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- Only admins can manage
DROP POLICY IF EXISTS "zones_admin_write" ON public.delivery_zones;
CREATE POLICY "zones_admin_write" ON public.delivery_zones FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));
