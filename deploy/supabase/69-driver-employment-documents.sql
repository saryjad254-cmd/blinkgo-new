-- 69. DRIVER EMPLOYMENT DOCUMENTS
-- Extends the original courier document model with the German payroll and
-- employment evidence used by the current driver onboarding UI.

ALTER TABLE public.driver_documents
  ADD COLUMN IF NOT EXISTS submission_kind TEXT NOT NULL DEFAULT 'file';

ALTER TABLE public.driver_documents
  DROP CONSTRAINT IF EXISTS driver_documents_document_type_check;

ALTER TABLE public.driver_documents
  ADD CONSTRAINT driver_documents_document_type_check CHECK (document_type IN (
    'license',
    'insurance',
    'vehicle_registration',
    'id_proof',
    'employment_contract',
    'health_insurance',
    'tax_id_confirmation',
    'social_insurance_number_proof',
    'payout_account_verification',
    'background_check'
  ));

ALTER TABLE public.driver_documents
  DROP CONSTRAINT IF EXISTS driver_documents_submission_kind_check;

ALTER TABLE public.driver_documents
  ADD CONSTRAINT driver_documents_submission_kind_check
  CHECK (submission_kind IN ('file', 'employer_lookup'));

CREATE INDEX IF NOT EXISTS idx_driver_documents_latest_type
  ON public.driver_documents (driver_id, document_type, uploaded_at DESC);

-- The application always stores these files through the service-role API.
-- The bucket is private, so no public document URL can be generated.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

