-- 70. APPEND-ONLY CONSENT RECORDS
-- Data-minimised proof of GDPR/ePrivacy choices. No IP address, user agent,
-- email, account id, or other direct identifier is stored.

CREATE TABLE IF NOT EXISTS public.consent_records (
  id UUID PRIMARY KEY,
  consent_version TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accept_all', 'reject_non_essential', 'custom')),
  categories JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'global_banner' CHECK (char_length(source) <= 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT consent_records_categories_object CHECK (jsonb_typeof(categories) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_consent_records_created_at
  ON public.consent_records (created_at DESC);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- The server-side service role is the only writer and reader. There are no
-- authenticated/anonymous policies and UPDATE/DELETE are intentionally absent.
DROP POLICY IF EXISTS consent_records_service_insert ON public.consent_records;
CREATE POLICY consent_records_service_insert ON public.consent_records
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS consent_records_service_select ON public.consent_records;
CREATE POLICY consent_records_service_select ON public.consent_records
  FOR SELECT TO service_role USING (true);

