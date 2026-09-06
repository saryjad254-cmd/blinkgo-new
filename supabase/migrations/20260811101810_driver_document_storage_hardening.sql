-- Sensitive identity files stay private and are only written/read by the
-- trusted server. Bucket limits are duplicated in the API as defence in depth.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

-- Background checks remain readable as legacy history, but BlinkGo no longer
-- asks new drivers for them. Employment/payroll evidence replaces that step.
ALTER TABLE public.driver_documents
  DROP CONSTRAINT IF EXISTS driver_documents_document_type_check;
ALTER TABLE public.driver_documents
  ADD CONSTRAINT driver_documents_document_type_check CHECK (document_type IN (
    'license', 'insurance', 'vehicle_registration', 'id_proof',
    'employment_contract', 'health_insurance', 'tax_id_confirmation',
    'social_insurance_number_proof',
    'payout_account_verification', 'background_check'
  ));

-- All mutations go through signature-verified application routes using the
-- service role. A driver may only read the status/metadata of their own rows.
DROP POLICY IF EXISTS "driver_documents_self_read" ON public.driver_documents;
DROP POLICY IF EXISTS "driver_documents_self_insert" ON public.driver_documents;
DROP POLICY IF EXISTS "driver_documents_self_update" ON public.driver_documents;
DROP POLICY IF EXISTS "driver_documents_admin_update" ON public.driver_documents;
DROP POLICY IF EXISTS driver_documents_self_select ON public.driver_documents;
DROP POLICY IF EXISTS driver_documents_self_insert ON public.driver_documents;
DROP POLICY IF EXISTS driver_documents_self_update ON public.driver_documents;
DROP POLICY IF EXISTS driver_documents_admin_update ON public.driver_documents;
DROP POLICY IF EXISTS driver_documents_admin_delete ON public.driver_documents;
DROP POLICY IF EXISTS driver_documents_service_role_all ON public.driver_documents;

CREATE POLICY driver_documents_self_select ON public.driver_documents
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = driver_id);

CREATE POLICY driver_documents_service_role_all ON public.driver_documents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- No direct client access to private objects. The service role bypasses RLS;
-- admins receive short-lived signed URLs from an authenticated API route.
DROP POLICY IF EXISTS "driver_documents_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_storage_delete" ON storage.objects;
