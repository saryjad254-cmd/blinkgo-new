-- 40. NOTIFICATION PREFERENCES
-- Granular user preferences for each notification type

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  -- Channel preferences
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Type preferences (granular)
  order_updates BOOLEAN NOT NULL DEFAULT true,    -- Order placed, accepted, etc.
  delivery_updates BOOLEAN NOT NULL DEFAULT true, -- Driver assigned, picked up
  promotions BOOLEAN NOT NULL DEFAULT true,        -- Coupons, deals
  new_features BOOLEAN NOT NULL DEFAULT true,      -- New features announcements
  reviews BOOLEAN NOT NULL DEFAULT true,           -- Review responses
  payouts BOOLEAN NOT NULL DEFAULT true,           -- For drivers/restaurants
  -- Quiet hours
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_read" ON public.notification_preferences;
CREATE POLICY "notif_prefs_read" ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_prefs_update" ON public.notification_preferences;
CREATE POLICY "notif_prefs_update" ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-create preferences on signup (via trigger)
CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_notification_prefs ON public.users;
CREATE TRIGGER trigger_create_notification_prefs
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_notification_prefs();
