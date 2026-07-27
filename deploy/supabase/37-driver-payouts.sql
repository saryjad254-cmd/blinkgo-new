-- 37. DRIVER PAYOUTS
-- Weekly payout system for drivers

CREATE TABLE IF NOT EXISTS public.driver_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Breakdown
  base_payout NUMERIC(10,2) NOT NULL DEFAULT 0,    -- Delivery fees share
  tips_total NUMERIC(10,2) NOT NULL DEFAULT 0,       -- Customer tips
  bonuses_total NUMERIC(10,2) NOT NULL DEFAULT 0,    -- Peak hours, streaks
  incentives_total NUMERIC(10,2) NOT NULL DEFAULT 0, -- Daily/weekly goals
  adjustments NUMERIC(10,2) NOT NULL DEFAULT 0,      -- Manual adjustments
  -- Final
  gross_payout NUMERIC(10,2) NOT NULL DEFAULT 0,     -- Sum before deductions
  deductions NUMERIC(10,2) NOT NULL DEFAULT 0,       -- Tax, fees
  net_payout NUMERIC(10,2) NOT NULL DEFAULT 0,       -- Final amount
  -- Metadata
  order_count INTEGER NOT NULL DEFAULT 0,
  delivery_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver ON public.driver_payouts(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_status ON public.driver_payouts(status);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_period ON public.driver_payouts(period_start, period_end);

ALTER TABLE public.driver_payouts ENABLE ROW LEVEL SECURITY;

-- Drivers can see their own payouts
DROP POLICY IF EXISTS "payouts_driver_read" ON public.driver_payouts;
CREATE POLICY "payouts_driver_read" ON public.driver_payouts FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- Only admins can manage payouts
DROP POLICY IF EXISTS "payouts_admin_write" ON public.driver_payouts;
CREATE POLICY "payouts_admin_write" ON public.driver_payouts FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));
