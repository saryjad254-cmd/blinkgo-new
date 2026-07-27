-- 38. SUPPORT TICKETS
-- In-app support system for customers, drivers, restaurants

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_role TEXT NOT NULL CHECK (user_role IN ('customer', 'driver', 'restaurant_owner', 'admin')),
  -- Ticket content
  category TEXT NOT NULL CHECK (category IN ('order_issue', 'payment', 'account', 'technical', 'feature_request', 'other')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  -- Related entities
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  -- Assignment
  assigned_to UUID REFERENCES public.users(id),
  -- Resolution
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON public.support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON public.support_tickets(order_id);

-- Ticket replies
CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,  -- Internal notes (admin only)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket ON public.support_ticket_replies(ticket_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

-- Users can see their own tickets; admins see all
DROP POLICY IF EXISTS "tickets_user_read" ON public.support_tickets;
CREATE POLICY "tickets_user_read" ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- Users can create their own tickets
DROP POLICY IF EXISTS "tickets_user_insert" ON public.support_tickets;
CREATE POLICY "tickets_user_insert" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own tickets (only to close)
DROP POLICY IF EXISTS "tickets_user_update" ON public.support_tickets;
CREATE POLICY "tickets_user_update" ON public.support_tickets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- Admins can do anything
DROP POLICY IF EXISTS "tickets_admin_all" ON public.support_tickets;
CREATE POLICY "tickets_admin_all" ON public.support_tickets FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- Replies: users see their own; admins see all
DROP POLICY IF EXISTS "replies_read" ON public.support_ticket_replies;
CREATE POLICY "replies_read" ON public.support_ticket_replies FOR SELECT TO authenticated
  USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
    OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "replies_insert" ON public.support_ticket_replies;
CREATE POLICY "replies_insert" ON public.support_ticket_replies FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
      OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin'))
    )
  );
