-- Durable support/resolution contract.
-- Attachments are intentionally server-only: service-role APIs authorize the
-- ticket owner/support staff and issue short-lived signed URLs.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS issue_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS next_action text NOT NULL DEFAULT 'waiting_support',
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.support_tickets
SET
  reference_code = COALESCE(reference_code, 'BG-' || upper(substr(md5(id::text), 1, 10))),
  sla_due_at = COALESCE(sla_due_at, created_at + interval '12 hours')
WHERE reference_code IS NULL OR sla_due_at IS NULL;

ALTER TABLE public.support_tickets
  ALTER COLUMN reference_code SET NOT NULL,
  ALTER COLUMN sla_due_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_reference_code_uidx
  ON public.support_tickets(reference_code);
CREATE INDEX IF NOT EXISTS support_tickets_open_sla_idx
  ON public.support_tickets(sla_due_at)
  WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX IF NOT EXISTS support_tickets_assigned_status_idx
  ON public.support_tickets(assigned_to, status, updated_at DESC);

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_issue_type_check,
  ADD CONSTRAINT support_tickets_issue_type_check CHECK (issue_type IN (
    'missing_item', 'wrong_order', 'damaged_item', 'quality_issue',
    'late_delivery', 'payment_issue', 'account_issue', 'technical_issue',
    'safety_issue', 'other'
  )),
  DROP CONSTRAINT IF EXISTS support_tickets_next_action_check,
  ADD CONSTRAINT support_tickets_next_action_check CHECK (next_action IN (
    'waiting_support', 'waiting_customer', 'refund_review', 'merchant_review',
    'driver_review', 'resolved'
  )),
  DROP CONSTRAINT IF EXISTS support_tickets_resolution_summary_check,
  ADD CONSTRAINT support_tickets_resolution_summary_check CHECK (
    resolution_summary IS NULL OR char_length(resolution_summary) <= 2000
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES public.support_ticket_replies(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_attachments_ticket_idx
  ON public.support_ticket_attachments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_ticket_attachments_retention_idx
  ON public.support_ticket_attachments(expires_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_ticket_attachments FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_attachments TO service_role;
