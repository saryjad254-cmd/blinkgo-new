-- 34. SYSTEM ANNOUNCEMENTS
-- Admin can post system-wide announcements (banners, scheduled, etc.)

CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'maintenance', 'promo')),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'customers', 'drivers', 'restaurants', 'admins')),
  link_url TEXT,
  link_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.system_announcements(is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.system_announcements(audience);

ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

-- Everyone can read active announcements
DROP POLICY IF EXISTS "announcements_read" ON public.system_announcements;
CREATE POLICY "announcements_read" ON public.system_announcements FOR SELECT TO authenticated, anon
  USING (
    is_active = true
    AND NOW() >= starts_at
    AND (ends_at IS NULL OR NOW() < ends_at)
  );

-- Only admins can create/update/delete
DROP POLICY IF EXISTS "announcements_admin_write" ON public.system_announcements;
CREATE POLICY "announcements_admin_write" ON public.system_announcements FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));
