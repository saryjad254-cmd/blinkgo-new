-- BlinkGo admin integrations and automation persistence
-- Apply after 67-product-approval-workflow.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  url TEXT NOT NULL CHECK (url ~ '^https://'),
  secret TEXT NOT NULL CHECK (char_length(secret) BETWEEN 16 AND 256),
  events TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[] CHECK (cardinality(events) BETWEEN 1 AND 30),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES public.webhooks(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'managed' CHECK (source IN ('managed', 'automation')),
  url TEXT NOT NULL CHECK (url ~ '^https://'),
  event VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'dead_letter')),
  response_status INTEGER CHECK (response_status BETWEEN 100 AND 599),
  response_body VARCHAR(500),
  error VARCHAR(1000),
  next_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  idempotency_key VARCHAR(200) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  description VARCHAR(600),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  trigger TEXT NOT NULL CHECK (trigger IN (
    'order.created', 'order.completed', 'order.cancelled', 'driver.online',
    'driver.offline', 'restaurant.sla_check', 'schedule', 'metric.threshold'
  )),
  conditions JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(conditions) = 'array'),
  actions JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(actions) = 'array'),
  time_window_minutes INTEGER CHECK (time_window_minutes BETWEEN 1 AND 10080),
  aggregate JSONB CHECK (aggregate IS NULL OR jsonb_typeof(aggregate) = 'object'),
  max_executions_per_hour INTEGER CHECK (max_executions_per_hour BETWEEN 1 AND 10000),
  cooldown_minutes INTEGER CHECK (cooldown_minutes BETWEEN 0 AND 10080),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  rule_name VARCHAR(160) NOT NULL,
  triggered BOOLEAN NOT NULL DEFAULT FALSE,
  executed_actions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0)
);

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source VARCHAR(100) NOT NULL DEFAULT 'system',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON public.webhooks(enabled);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON public.webhook_deliveries(next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status_created ON public.webhook_deliveries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger_enabled ON public.automation_rules(trigger, enabled);
CREATE INDEX IF NOT EXISTS idx_automation_executions_rule_time ON public.automation_executions(rule_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON public.admin_notifications(created_at DESC) WHERE read_at IS NULL;

DROP TRIGGER IF EXISTS trg_webhooks_set_updated_at ON public.webhooks;
CREATE TRIGGER trg_webhooks_set_updated_at
  BEFORE UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_automation_rules_set_updated_at ON public.automation_rules;
CREATE TRIGGER trg_automation_rules_set_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_webhook_deliveries_set_updated_at ON public.webhook_deliveries;
CREATE TRIGGER trg_webhook_deliveries_set_updated_at
  BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.webhooks, public.webhook_deliveries, public.automation_rules, public.automation_executions, public.admin_notifications FROM anon, authenticated;
GRANT ALL ON public.webhooks, public.webhook_deliveries, public.automation_rules, public.automation_executions, public.admin_notifications TO service_role;

INSERT INTO public.automation_rules (
  id, name, description, enabled, trigger, conditions, actions,
  time_window_minutes, aggregate, max_executions_per_hour, cooldown_minutes
) VALUES
  (
    '68000000-0000-4000-8000-000000000001',
    'Auto-pause restaurant with low SLA',
    'Pause a restaurant when SLA compliance stays below 50 percent.',
    TRUE, 'restaurant.sla_check',
    '[{"field":"sla_compliance","operator":"lt","value":0.5}]'::JSONB,
    '[{"type":"pause_restaurant","params":{"reason":"SLA compliance dropped below 50%"}},{"type":"notify_admins","params":{"title":"Restaurant auto-paused","body":"SLA compliance < 50%","severity":"high"}}]'::JSONB,
    30, NULL, 1, 60
  ),
  (
    '68000000-0000-4000-8000-000000000002',
    'Alert on driver shortage',
    'Notify administrators when fewer than two drivers are active.',
    TRUE, 'metric.threshold',
    '[{"field":"active_drivers","operator":"lt","value":2}]'::JSONB,
    '[{"type":"notify_admins","params":{"title":"Driver shortage","body":"Active drivers < 2","severity":"high"}}]'::JSONB,
    15, NULL, 4, 15
  ),
  (
    '68000000-0000-4000-8000-000000000003',
    'Detect unusual cancellation spike',
    'Create an alert when at least five non-customer cancellations happen in thirty minutes.',
    TRUE, 'order.cancelled',
    '[{"field":"reason","operator":"neq","value":"customer_request"}]'::JSONB,
    '[{"type":"create_alert","params":{"severity":"high","message":"Cancellation spike detected","source":"orders"}}]'::JSONB,
    30, '{"count_field":"orders","threshold":5,"window_minutes":30}'::JSONB, 2, 30
  ),
  (
    '68000000-0000-4000-8000-000000000004',
    'Critical incident escalation',
    'Escalate high-value payment failures to operations.',
    TRUE, 'order.created',
    '[{"field":"payment_status","operator":"eq","value":"failed"},{"field":"total","operator":"gt","value":100}]'::JSONB,
    '[{"type":"escalate","params":{"to":"oncall","reason":"Critical payment failure"}},{"type":"create_alert","params":{"severity":"critical","message":"High-value payment failed","source":"payments"}}]'::JSONB,
    NULL, NULL, 10, 5
  ),
  (
    '68000000-0000-4000-8000-000000000005',
    'Daily operational report',
    'Run the daily operations report workflow.',
    TRUE, 'schedule', '[]'::JSONB,
    '[{"type":"log","params":{"message":"Daily report generation triggered","level":"info"}}]'::JSONB,
    NULL, NULL, 1, 60
  )
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.webhooks IS 'Administrator-managed outbound webhook endpoints. Secrets are server-only and never returned unmasked.';
COMMENT ON TABLE public.webhook_deliveries IS 'Durable outbound Webhook attempts, retry schedule and dead-letter history. Signing secrets are never stored here.';
COMMENT ON TABLE public.automation_rules IS 'Audited event-driven operational automation rules.';
