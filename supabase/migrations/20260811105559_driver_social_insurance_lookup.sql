-- A driver who has not received or cannot locate a German insurance number can
-- ask payroll to retrieve it. No raw number is collected in the web client.
ALTER TABLE public.driver_documents
  ADD COLUMN IF NOT EXISTS submission_kind TEXT NOT NULL DEFAULT 'file';

ALTER TABLE public.driver_documents
  DROP CONSTRAINT IF EXISTS driver_documents_submission_kind_check;
ALTER TABLE public.driver_documents
  ADD CONSTRAINT driver_documents_submission_kind_check
  CHECK (submission_kind IN ('file', 'employer_lookup'));

CREATE INDEX IF NOT EXISTS idx_driver_documents_lookup_queue
  ON public.driver_documents (status, uploaded_at)
  WHERE document_type = 'social_insurance_number_proof'
    AND submission_kind = 'employer_lookup';

COMMENT ON COLUMN public.driver_documents.submission_kind IS
  'file = private uploaded evidence; employer_lookup = payroll must retrieve the German insurance number.';
