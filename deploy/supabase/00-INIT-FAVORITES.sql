-- ═══════════════════════════════════════════════════════════════════
-- BlinkGo Favorites Table
-- ═══════════════════════════════════════════════════════════════════
-- Idempotent. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON public.favorites (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_restaurant ON public.favorites (restaurant_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favorites_owner_select ON public.favorites;
DROP POLICY IF EXISTS favorites_owner_modify ON public.favorites;

-- Authenticated user can see their own favorites
CREATE POLICY favorites_owner_select ON public.favorites
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated user can insert their own favorites
CREATE POLICY favorites_owner_modify ON public.favorites
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything
DROP POLICY IF EXISTS favorites_service ON public.favorites;
CREATE POLICY favorites_service ON public.favorites
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
