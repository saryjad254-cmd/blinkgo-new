-- ═══════════════════════════════════════════════════════════════════
-- BlinkGo Expansion Requests
-- ═══════════════════════════════════════════════════════════════════
-- Records addresses from users who live OUTSIDE the current delivery
-- zone (Wesseling 15km). The admin dashboard reads this table to
-- prioritize future expansion.
-- Idempotent. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.expansion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  city text NOT NULL,
  postal_code text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  distance_km double precision,
  email text,
  name text,
  notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewing', 'planned', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expansion_requests_status
  ON public.expansion_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expansion_requests_location
  ON public.expansion_requests (city, postal_code);

ALTER TABLE public.expansion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expansion_requests_service ON public.expansion_requests;
CREATE POLICY expansion_requests_service ON public.expansion_requests
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin can read all requests
DROP POLICY IF EXISTS expansion_requests_admin ON public.expansion_requests;
CREATE POLICY expansion_requests_admin ON public.expansion_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
