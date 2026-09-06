-- Repair the production payment rate-limit RPC.
--
-- The previous four-argument function declared tokens_remaining as NUMERIC
-- but returned INTEGER, so PostgREST rejected every call and the application
-- had to fail open. The old implementation also read the bucket without a
-- row lock, allowing concurrent requests to spend the same token.

DROP FUNCTION IF EXISTS public.payment_rate_limit_check(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER);

CREATE FUNCTION public.payment_rate_limit_check(
  p_bucket_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER,
  p_burst INTEGER DEFAULT NULL
)
RETURNS TABLE(allowed BOOLEAN, tokens_remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_bucket public.payment_rate_limit_buckets%ROWTYPE;
  v_tokens NUMERIC;
  v_refill_rate NUMERIC;
  v_retry_after INTEGER := 0;
  v_effective_limit INTEGER;
BEGIN
  IF p_bucket_key IS NULL OR btrim(p_bucket_key) = '' THEN
    RAISE EXCEPTION 'bucket key is required' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'limit and window must be positive' USING ERRCODE = '22023';
  END IF;

  v_effective_limit := GREATEST(1, COALESCE(p_burst, p_limit));
  v_refill_rate := p_limit::NUMERIC / p_window_seconds::NUMERIC;

  -- The first request creates the bucket and consumes one token atomically.
  INSERT INTO public.payment_rate_limit_buckets (
    bucket_key, tokens, last_refill_at, limit_count, window_seconds, updated_at
  )
  VALUES (
    p_bucket_key,
    GREATEST(0, v_effective_limit - 1),
    v_now,
    p_limit,
    p_window_seconds,
    v_now
  )
  ON CONFLICT (bucket_key) DO NOTHING;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, GREATEST(0, v_effective_limit - 1), 0;
    RETURN;
  END IF;

  -- Serialize consumers of an existing bucket so concurrent requests cannot
  -- observe and spend the same balance.
  SELECT *
  INTO v_bucket
  FROM public.payment_rate_limit_buckets
  WHERE bucket_key = p_bucket_key
  FOR UPDATE;

  v_tokens := LEAST(
    v_effective_limit::NUMERIC,
    v_bucket.tokens + (EXTRACT(EPOCH FROM (v_now - v_bucket.last_refill_at)) * v_refill_rate)
  );

  IF v_tokens >= 1 THEN
    v_tokens := v_tokens - 1;
    allowed := TRUE;
  ELSE
    allowed := FALSE;
    v_retry_after := GREATEST(1, CEIL((1 - v_tokens) / v_refill_rate)::INTEGER);
  END IF;

  UPDATE public.payment_rate_limit_buckets
  SET tokens = v_tokens,
      last_refill_at = v_now,
      limit_count = p_limit,
      window_seconds = p_window_seconds,
      updated_at = v_now
  WHERE bucket_key = p_bucket_key;

  tokens_remaining := FLOOR(v_tokens)::INTEGER;
  retry_after_seconds := v_retry_after;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.payment_rate_limit_check(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

