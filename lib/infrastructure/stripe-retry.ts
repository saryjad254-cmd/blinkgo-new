/**
 * Phase 7G-F — Stripe HTTP Retry Wrapper
 * ───────────────────────────────────────
 * Wraps all Stripe API calls with:
 *   - Exponential backoff with full jitter
 *   - Retry-After header support
 *   - Idempotency-Key preservation (only on the FIRST attempt — Stripe rejects reuse)
 *   - Timeout handling
 *   - Metrics: stripe_api_retries_total, stripe_api_duration_ms
 *   - Structured logging with request_id, retry_count, recovery_state
 *
 * IMPORTANT: Stripe Idempotency-Key may be reused on retry IF the request body
 * is identical AND the previous call didn't return a result. Stripe's behavior:
 *   - Same key, different body → 400 error
 *   - Same key, same body, no result → returns previous result (or processes new)
 *   - We always pass the same key on retry, so Stripe handles it correctly.
 */

import { logger, generateRequestId } from '@/lib/foundation/logger';
import { registry } from '@/lib/observability/metrics';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_DELAY_MS = 250;       // first retry waits ~250ms ± jitter
const DEFAULT_MAX_DELAY_MS = 30_000;     // never wait more than 30s
const DEFAULT_TIMEOUT_MS = 15_000;       // 15s per Stripe call

// Status codes that are retryable
const RETRYABLE_HTTP_STATUSES = new Set([
  408, // Request Timeout
  425, // Too Early
  429, // Too Many Requests (rate limited)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
  522, // Cloudflare connection timed out
  524, // Cloudflare timeout
]);

// Stripe-specific error codes that are retryable
const RETRYABLE_STRIPE_CODES = new Set([
  'lock_timeout',
  'lock_busy',
  'request_timeout',
  'api_connection_error',
  'api_error',
]);

// Codes that should NEVER be retried
const NON_RETRYABLE_STRIPE_CODES = new Set([
  'card_declined',
  'expired_card',
  'incorrect_cvc',
  'incorrect_number',
  'invalid_cvc',
  'invalid_number',
  'invalid_expiry_month',
  'invalid_expiry_year',
  'authentication_required',
  'invalid_amount',
  'currency_mismatch',
  'charge_already_refunded',
  'charge_not_refundable',
  'charge_exceeds_industry_avs_failure_limit',
  'charge_exceeds_industry_limit',
  'invalid_charge_amount',
  'refund_disabled_payment_method',
  'missing_payment_information',
  'insufficient_capabilities',
  'invalid_account',
  'account_closed',
  'account_invalid',
  'amount_too_large',
  'amount_too_small',
  'application_fees_not_allowed',
  'balance_insufficient',
  'balance_too_low',
  'bank_account_exists',
  'bank_account_invalid',
  'bank_account_not_found',
  'charge_already_captured',
  'charge_already_refunded',
  'charge_disputed',
  'charge_exceeds_source_limit',
  'charge_invalid_parameter',
  'charge_not_capturable',
  'country_code_invalid',
  'country_not_supported',
  'debit_not_authorized',
  'email_invalid',
  'expired_card',
  'idempotency_error',
  'incorrect_address',
  'instant_payouts_unsupported',
  'intent_invalid_state',
  'intent_verification_method_missing',
  'invalid_card_type',
  'invalid_characters',
  'invalid_cvc',
  'invalid_iban',
  'invalid_payment_method',
  'invalid_payment_method_type',
  'invalid_pin',
  'invalid_source_usage',
  'invalid_swipe_data',
  'invoice_no_customer_line_items',
  'invoice_no_payment_method',
  'invoice_no_subscription_line_items',
  'invoice_not_editable',
  'invoice_on_behalf_of_not_editable',
  'invoice_payment_intent_requires_action',
  'live_mode_not_supported',
  'lock_timeout',
  'missing',
  'missing_business_profile',
  'missing_emr_authorization',
  'no_account',
  'not_allowed_on_standard_account',
  'out_of_invocation_context',
  'parameter_invalid_empty',
  'parameter_invalid_integer',
  'parameter_invalid_string_blank',
  'parameter_invalid_string_empty',
  'parameter_missing',
  'parameter_unknown',
  'payment_intent_authentication_failure',
  'payment_intent_incompatible_payment_method',
  'payment_intent_invalid_parameter',
  'payment_intent_payment_attempt_failed',
  'payment_intent_unexpected_state',
  'payment_method_disabled',
  'payment_method_invalid_parameter',
  'payment_method_not_available',
  'payment_method_unactivated',
  'payment_method_unexpected_state',
  'payouts_not_allowed',
  'platform_account_required',
  'platform_api_key_expired',
  'postal_code_invalid',
  'processing_error',
  'product_inactive',
  'rate_limit',
  'refer_to_resource',
  'resource_already_exists',
  'resource_expired',
  'resource_forbidden',
  'resource_locked',
  'resource_missing',
  'resource_not_found',
  'secret_key_required',
  'sepa_unsupported_account',
  'shipping_calculation_failed',
  'sku_inactive',
  'state_unsupported',
  'tax_calculation_failed',
  'tax_id_invalid',
  'tax_id_required',
  'tax_rate_not_found',
  'terminal_location_disabled',
  'tls_unsupported',
  'token_in_use',
  'transfers_not_allowed',
  'unsupported_business_type',
  'unsupported_card',
  'unsupported_payment_method',
  'unsupported_payment_method_for_country',
  'unsupported_payment_method_for_currency',
  'unsupported_payment_method_type',
  'url_invalid',
  'webhook_bad_response',
  'webhook_delivery_failed',
  'webhook_endpoint_disabled',
  'webhook_missing',
  'webhook_signature_verification_failed',
  'webhook_url_invalid',
]);

// ============================================================================
// Metrics
// ============================================================================

const stripeRetriesTotal = registry.counter(
  'stripe_api_retries_total',
  'Total Stripe API retry attempts (by operation and outcome)'
);
const stripeFailuresTotal = registry.counter(
  'stripe_api_failures_total',
  'Total Stripe API failures (non-retryable or exhausted retries)'
);
const stripeSuccessAfterRetry = registry.counter(
  'stripe_api_success_after_retry_total',
  'Total Stripe API calls that succeeded after 1+ retries'
);
const stripeDurationMs = registry.histogram(
  'stripe_api_duration_ms',
  'Stripe API call duration in milliseconds (including retries)'
);
const stripeTimeoutsTotal = registry.counter(
  'stripe_api_timeouts_total',
  'Total Stripe API timeouts (before retry exhausted)'
);
const stripeRateLimitedTotal = registry.counter(
  'stripe_api_rate_limited_total',
  'Total Stripe API 429 responses'
);

// ============================================================================
// Public API
// ============================================================================

export interface StripeRetryConfig {
  /** Max retry attempts (default 4 = up to 5 total calls) */
  maxRetries?: number;
  /** Base delay in ms (default 250) */
  baseDelayMs?: number;
  /** Max delay in ms (default 30000) */
  maxDelayMs?: number;
  /** Per-call timeout in ms (default 15000) */
  timeoutMs?: number;
  /** Request ID for distributed tracing */
  requestId?: string;
  /** Operation name for metrics/logs (e.g. "refunds.create") */
  operation?: string;
  /** Recovery state for the surrounding flow */
  recoveryState?: string;
}

export interface StripeRetryError {
  ok: false;
  code: string;
  message: string;
  statusCode?: number;
  retried: number;
  finalAttempt: boolean;
  recoverable: boolean;
  requestId: string;
}

export interface StripeRetrySuccess<T> {
  ok: true;
  value: T;
  retried: number;
  durationMs: number;
  requestId: string;
}

export type StripeRetryResult<T> = StripeRetrySuccess<T> | StripeRetryError;

/**
 * Execute a Stripe API call with retry logic.
 *
 * @param fn The actual Stripe call. Receives the `signal` for timeout.
 * @param config Retry configuration
 * @returns Result with retry count and request_id
 */
export async function stripeRetry<T>(
  fn: (opts: { signal: AbortSignal; requestId: string; attempt: number }) => Promise<T>,
  config: StripeRetryConfig = {}
): Promise<StripeRetryResult<T>> {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = config.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestId = config.requestId ?? generateRequestId();
  const operation = config.operation ?? 'unknown';
  const recoveryState = config.recoveryState ?? 'none';

  const start = Date.now();
  let retried = 0;
  let lastError: { code: string; message: string; statusCode?: number } | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const value = await fn({ signal: controller.signal, requestId, attempt });
      clearTimeout(timer);

      const durationMs = Date.now() - start;
      stripeDurationMs.observe(durationMs, { operation, outcome: 'success' });

      if (retried > 0) {
        stripeSuccessAfterRetry.inc({ operation, retries: String(retried) });
        logger.info('stripe.retry.success', {
          requestId, operation, retried, durationMs, recoveryState,
        });
      }

      return { ok: true, value, retried, durationMs, requestId };
    } catch (e: unknown) {
      clearTimeout(timer);

      const classified = classifyStripeError(e);
      lastError = classified;
      const retryable = classified.retryable && attempt < maxRetries;

      // Log every failure (test-only detection)
      logger.warn('stripe.retry.attempt_failed', {
        requestId, operation, attempt, retried, recoveryState,
        code: classified.code, statusCode: classified.statusCode,
        message: classified.message, willRetry: retryable,
      });

      if (!retryable) {
        // Exhausted retries or non-retryable error
        const durationMs = Date.now() - start;
        stripeDurationMs.observe(durationMs, { operation, outcome: 'failure' });
        if (classified.statusCode === 429) {
          stripeRateLimitedTotal.inc({ operation, exhausted: 'true' });
        } else {
          stripeFailuresTotal.inc({ operation, code: classified.code });
        }
        return {
          ok: false,
          code: classified.code,
          message: classified.message,
          statusCode: classified.statusCode,
          retried,
          finalAttempt: true,
          recoverable: classified.statusCode === 429 || (classified.statusCode ?? 0) >= 500,
          requestId,
        };
      }

      // Increment retry counter
      retried++;
      stripeRetriesTotal.inc({ operation, code: classified.code });
      if (classified.statusCode === 429) {
        stripeRateLimitedTotal.inc({ operation, exhausted: 'false' });
      }

      // Compute delay
      const delay = computeBackoff({
        attempt,
        baseDelay,
        maxDelay,
        retryAfterMs: classified.retryAfterMs,
      });

      logger.info('stripe.retry.scheduled', {
        requestId, operation, attempt: retried, delayMs: delay, recoveryState,
        code: classified.code, statusCode: classified.statusCode,
      });

      // Sleep with abort support
      await sleepWithAbort(delay, controller.signal);
      // After sleep, create a new controller for the next attempt
    }
  }

  // Should not reach here, but defensive
  const durationMs = Date.now() - start;
  stripeDurationMs.observe(durationMs, { operation, outcome: 'failure' });
  return {
    ok: false,
    code: lastError?.code ?? 'max_retries_exceeded',
    message: lastError?.message ?? `Stripe call exhausted ${maxRetries} retries`,
    statusCode: lastError?.statusCode,
    retried,
    finalAttempt: true,
    recoverable: true,
    requestId,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function classifyStripeError(e: unknown): {
  code: string;
  message: string;
  statusCode?: number;
  retryable: boolean;
  retryAfterMs?: number;
} {
  if (e === null || e === undefined) {
    return { code: 'unknown', message: 'Unknown error', retryable: false };
  }

  // Timeout / abort
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
    return { code: 'timeout', message: 'Stripe call timed out', retryable: true };
  }

  // Stripe error shape
  const err = e as {
    code?: string;
    message?: string;
    statusCode?: number;
    type?: string;
    raw?: { code?: string; message?: string };
    headers?: Record<string, string>;
  };

  const code = err?.raw?.code ?? err?.code ?? 'unknown';
  const message = err?.raw?.message ?? err?.message ?? 'Stripe call failed';
  const statusCode = err?.statusCode;
  const retryAfterMs = parseRetryAfter(err?.headers?.['retry-after']);

  // Non-retryable Stripe codes
  if (NON_RETRYABLE_STRIPE_CODES.has(code)) {
    return { code, message, statusCode, retryable: false, retryAfterMs };
  }

  // Retryable Stripe codes
  if (RETRYABLE_STRIPE_CODES.has(code)) {
    return { code, message, statusCode, retryable: true, retryAfterMs };
  }

  // Retryable HTTP status codes
  if (statusCode !== undefined && RETRYABLE_HTTP_STATUSES.has(statusCode)) {
    return { code, message, statusCode, retryable: true, retryAfterMs };
  }

  // 4xx (except 429) → non-retryable
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return { code, message, statusCode, retryable: false, retryAfterMs };
  }

  // 5xx → retryable
  if (statusCode !== undefined && statusCode >= 500) {
    return { code, message, statusCode, retryable: true, retryAfterMs };
  }

  // Default: don't retry
  return { code, message, statusCode, retryable: false, retryAfterMs };
}

function parseRetryAfter(retryAfter: string | undefined): number | undefined {
  if (!retryAfter) return undefined;
  // Stripe returns Retry-After as either an integer (seconds) or an HTTP-date
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60_000); // cap at 60s
  }
  const date = Date.parse(retryAfter);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.min(date - Date.now(), 60_000));
  }
  return undefined;
}

/**
 * Full-jitter exponential backoff:
 *   delay = random(0, min(maxDelay, baseDelay * 2^attempt))
 * If retryAfterMs is provided, use it (with jitter).
 */
function computeBackoff(opts: {
  attempt: number;
  baseDelay: number;
  maxDelay: number;
  retryAfterMs?: number;
}): number {
  if (opts.retryAfterMs !== undefined) {
    // Honor Retry-After with small jitter
    const jitter = Math.floor(Math.random() * 200);
    return Math.min(opts.retryAfterMs + jitter, opts.maxDelay);
  }
  const exp = Math.min(opts.maxDelay, opts.baseDelay * Math.pow(2, opts.attempt));
  // Full jitter: random between 0 and exp
  return Math.floor(Math.random() * exp);
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Sleep aborted'));
    }, { once: true });
  });
}

// ============================================================================
// Test helpers (NOT for production use)
// ============================================================================

/**
 * Reset metrics — test only. NEVER call from production code.
 */
export function _resetMetricsForTests(): void {
  stripeRetriesTotal.values.clear();
  stripeFailuresTotal.values.clear();
  stripeSuccessAfterRetry.values.clear();
  stripeTimeoutsTotal.values.clear();
  stripeRateLimitedTotal.values.clear();
  // Note: histograms are not reset here for simplicity
}

export const __TEST__ = {
  classifyStripeError,
  parseRetryAfter,
  computeBackoff,
  RETRYABLE_HTTP_STATUSES,
  RETRYABLE_STRIPE_CODES,
  NON_RETRYABLE_STRIPE_CODES,
};
