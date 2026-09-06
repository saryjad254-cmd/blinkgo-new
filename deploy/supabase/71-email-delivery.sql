BEGIN;

CREATE TABLE IF NOT EXISTS public.email_delivery_events (
  provider_event_id TEXT PRIMARY KEY,
  provider_email_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type LIKE 'email.%'),
  recipient_hashes TEXT[] NOT NULL DEFAULT '{}',
  provider_created_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  recipient_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('bounced', 'complained', 'suppressed', 'failed')),
  provider_email_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_events_email
  ON public.email_delivery_events(provider_email_id, received_at DESC);

ALTER TABLE public.email_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_delivery_events, public.email_suppressions FROM anon, authenticated;
GRANT ALL ON public.email_delivery_events, public.email_suppressions TO service_role;

COMMENT ON TABLE public.email_delivery_events IS
  'Minimal Resend delivery audit. Recipients are stored only as keyed hashes; message content and subjects are never persisted.';
COMMENT ON TABLE public.email_suppressions IS
  'Keyed recipient hashes blocked after bounce, complaint, provider suppression, or permanent failure.';

COMMIT;
