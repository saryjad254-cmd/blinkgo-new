-- 33. DRIVER DOCUMENTS
-- Driver document uploads for verification (license, insurance, vehicle registration, ID)
-- All tables idempotent.

CREATE TABLE IF NOT EXISTS public.driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('license', 'insurance', 'vehicle_registration', 'id_proof', 'background_check')),
  document_url TEXT NOT NULL,
  document_number TEXT,
  expires_at DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  rejection_reason TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_driver_documents_driver ON public.driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_documents_status ON public.driver_documents(status);

ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

-- Drivers can see their own documents
DROP POLICY IF EXISTS "driver_documents_self_read" ON public.driver_documents;
CREATE POLICY "driver_documents_self_read" ON public.driver_documents FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- Drivers can insert their own documents
DROP POLICY IF EXISTS "driver_documents_self_insert" ON public.driver_documents;
CREATE POLICY "driver_documents_self_insert" ON public.driver_documents FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());

-- Drivers can update their own pending documents
DROP POLICY IF EXISTS "driver_documents_self_update" ON public.driver_documents;
CREATE POLICY "driver_documents_self_update" ON public.driver_documents FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() AND status = 'pending')
  WITH CHECK (driver_id = auth.uid());

-- Admins can update any document (approve/reject)
DROP POLICY IF EXISTS "driver_documents_admin_update" ON public.driver_documents;
CREATE POLICY "driver_documents_admin_update" ON public.driver_documents FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));
