-- 35. SYSTEM SETTINGS
-- Dynamic platform configuration (tax rate, surge multiplier, etc.)

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings (they're public config)
DROP POLICY IF EXISTS "settings_read" ON public.system_settings;
CREATE POLICY "settings_read" ON public.system_settings FOR SELECT TO authenticated, anon
  USING (true);

-- Only admins can write
DROP POLICY IF EXISTS "settings_admin_write" ON public.system_settings;
CREATE POLICY "settings_admin_write" ON public.system_settings FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- Seed default settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('tax_rate', '0.19'::jsonb, 'Default VAT rate (19% in Germany)'),
  ('tax_included', 'true'::jsonb, 'Whether displayed prices include tax'),
  ('currency', '"EUR"'::jsonb, 'Default currency'),
  ('surge_enabled', 'false'::jsonb, 'Enable dynamic surge pricing'),
  ('surge_max_multiplier', '2.0'::jsonb, 'Maximum surge multiplier'),
  ('min_order_amount', '5.00'::jsonb, 'Minimum order amount in EUR'),
  ('free_delivery_threshold', '25.00'::jsonb, 'Order amount for free delivery in EUR'),
  ('default_delivery_radius_km', '5'::jsonb, 'Default delivery radius in km'),
  ('driver_search_radius_km', '10'::jsonb, 'Driver search radius for auto-dispatch'),
  ('rating_min', '1'::jsonb, 'Minimum rating (1-5)'),
  ('rating_max', '5'::jsonb, 'Maximum rating (1-5)')
ON CONFLICT (key) DO NOTHING;
