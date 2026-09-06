BEGIN;

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('access', 'rectification', 'erasure', 'restriction', 'portability', 'objection', 'consent_withdrawal')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  account_email TEXT,
  details TEXT,
  ip INET,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 years')
);

CREATE INDEX IF NOT EXISTS idx_data_subject_requests_status_created
  ON public.data_subject_requests(status, created_at);
ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_subject_requests FROM anon, authenticated;
GRANT ALL ON public.data_subject_requests TO service_role;

COMMENT ON TABLE public.data_subject_requests IS
  'Service-only GDPR rights requests. Operational logs contain only the opaque request id and type, never request PII.';

COMMIT;
