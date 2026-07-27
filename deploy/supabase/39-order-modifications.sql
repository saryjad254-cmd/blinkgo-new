-- 39. ORDER MODIFICATIONS
-- Track when customers modify orders before preparation

CREATE TABLE IF NOT EXISTS public.order_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  modified_by UUID NOT NULL REFERENCES public.users(id),
  modification_type TEXT NOT NULL CHECK (modification_type IN ('add_item', 'remove_item', 'change_quantity', 'change_address', 'change_instructions', 'change_tip')),
  details JSONB NOT NULL,  -- What was changed
  -- Price impact
  previous_total NUMERIC(10,2),
  new_total NUMERIC(10,2),
  delta NUMERIC(10,2),
  -- Approval
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_modifications_order ON public.order_modifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_modifications_status ON public.order_modifications(status);

ALTER TABLE public.order_modifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modifications_read" ON public.order_modifications;
CREATE POLICY "modifications_read" ON public.order_modifications FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
    OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin', 'restaurant_owner'))
  );

DROP POLICY IF EXISTS "modifications_insert" ON public.order_modifications;
CREATE POLICY "modifications_insert" ON public.order_modifications FOR INSERT TO authenticated
  WITH CHECK (modified_by = auth.uid());

DROP POLICY IF EXISTS "modifications_update" ON public.order_modifications;
CREATE POLICY "modifications_update" ON public.order_modifications FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin', 'restaurant_owner')));
