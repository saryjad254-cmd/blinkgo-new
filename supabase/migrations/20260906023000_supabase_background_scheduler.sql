-- BlinkGo production background scheduler for Supabase Pro.
-- Required Vault secrets (configured out-of-band, never committed):
--   blinkgo_app_url     = https://www.blinkgo.de
--   blinkgo_cron_secret = the same value as Vercel CRON_SECRET

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.invoke_blinkgo_cron(p_path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_base_url text;
  v_cron_secret text;
  v_request_id bigint;
BEGIN
  IF p_path IS NULL OR p_path !~ '^/api/cron/[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Invalid BlinkGo cron path';
  END IF;

  SELECT decrypted_secret INTO v_base_url FROM vault.decrypted_secrets
  WHERE name = 'blinkgo_app_url' ORDER BY created_at DESC LIMIT 1;
  SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets
  WHERE name = 'blinkgo_cron_secret' ORDER BY created_at DESC LIMIT 1;

  IF v_base_url IS NULL OR v_base_url !~ '^https://[^/]+$' THEN
    RAISE EXCEPTION 'Vault secret blinkgo_app_url is missing or invalid';
  END IF;
  IF v_cron_secret IS NULL OR length(v_cron_secret) < 32 THEN
    RAISE EXCEPTION 'Vault secret blinkgo_cron_secret is missing or invalid';
  END IF;

  SELECT net.http_get(
    url := rtrim(v_base_url, '/') || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_cron_secret,
      'User-Agent', 'BlinkGo-Supabase-Cron/1.0'
    ),
    timeout_milliseconds := 10000
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_blinkgo_cron(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_job record;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname IN (
    'blinkgo-webhook-retries','blinkgo-preparation-sla','blinkgo-scheduled-orders-http',
    'blinkgo-retail-replacements','blinkgo-reconcile-payments','blinkgo-cleanup-drafts',
    'blinkgo-delivery-proof-retention','blinkgo-support-attachment-retention'
  ) LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule('blinkgo-webhook-retries','*/5 * * * *',$job$SELECT public.invoke_blinkgo_cron('/api/cron/webhook-retries');$job$);
SELECT cron.schedule('blinkgo-preparation-sla','*/5 * * * *',$job$SELECT public.invoke_blinkgo_cron('/api/cron/preparation-sla');$job$);
SELECT cron.schedule('blinkgo-scheduled-orders-http','* * * * *',$job$SELECT public.invoke_blinkgo_cron('/api/cron/scheduled-orders');$job$);
SELECT cron.schedule('blinkgo-retail-replacements','* * * * *',$job$SELECT public.invoke_blinkgo_cron('/api/cron/retail-replacements');$job$);
SELECT cron.schedule('blinkgo-reconcile-payments','*/15 * * * *',$job$SELECT public.invoke_blinkgo_cron('/api/cron/reconcile-payments');$job$);
SELECT cron.schedule('blinkgo-cleanup-drafts','0 * * * *',$job$SELECT public.invoke_blinkgo_cron('/api/cron/cleanup-drafts');$job$);
SELECT cron.schedule('blinkgo-delivery-proof-retention','0 3 * * *',$job$SELECT public.invoke_blinkgo_cron('/api/cron/delivery-proof-retention');$job$);
SELECT cron.schedule('blinkgo-support-attachment-retention','30 3 * * *',$job$SELECT public.invoke_blinkgo_cron('/api/cron/support-attachment-retention');$job$);

