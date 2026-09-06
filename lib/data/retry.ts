/**
 * Data Layer: Retry Policy
 * ─────────────────────────
 * Exponential backoff with jitter for transient database errors.
 *
 * Use `withRetry()` around any database call that may fail transiently.
 * Idempotent operations (GET, INSERT ON CONFLICT, UPDATE) are safe to retry.
 * Non-idempotent operations (debit without idempotency key) are NOT.
 *
 * Pattern:
 *   const data = await withRetry(
 *     () => svc.from('users').select('*'),
 *     { isIdempotent: true, label: 'users.list' },
 *   );
 */

import { mapDbError, isDbError } from './errors';
import { log } from '@/lib/foundation';

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Initial backoff in ms (default: 200) */
  initialBackoffMs?: number;
  /** Max backoff in ms (default: 2000) */
  maxBackoffMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether the operation is safe to retry (idempotent) */
  isIdempotent?: boolean;
  /** Label for logging */
  label?: string;
  /** Custom function to decide if an error is retryable */
  isRetryable?: (e: unknown) => boolean;
}

const TRANSIENT_PATTERNS = [
  /timeout/i,
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /ETIMEDOUT/,
  /fetch failed/i,
  /connection reset/i,
  /connection closed/i,
  /502|503|504/,
];

function isTransientError(e: unknown): boolean {
  if (isDbError(e)) {
    // Postgres "deadlock detected" or "serialization failure" → retry
    if (e.code === '40P01' || e.code === '40001') return true;
    // Server-side 5xx → retry
    if (e.status && e.status >= 500 && e.status < 600) return true;
  }
  if (e instanceof Error) {
    return TRANSIENT_PATTERNS.some((p) => p.test(e.message));
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff + jitter.
 * Throws on final failure (use `mapDbError` to convert to AppError).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialBackoffMs = 200,
    maxBackoffMs = 2000,
    backoffMultiplier = 2,
    isIdempotent = true,
    label = 'db.retry',
    isRetryable = isTransientError,
  } = options;

  if (!isIdempotent && maxAttempts > 1) {
    // Non-idempotent operations are not auto-retried
    return fn();
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts || !isRetryable(e)) {
        log.warn(`${label}.failed`, {
          attempt,
          maxAttempts,
          isRetryable: isRetryable(e),
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
      // Exponential backoff with jitter
      const backoff = Math.min(initialBackoffMs * backoffMultiplier ** (attempt - 1), maxBackoffMs);
      const jitter = Math.random() * backoff * 0.3;
      const totalDelay = backoff + jitter;
      log.debug(`${label}.retry`, { attempt, nextDelayMs: Math.round(totalDelay) });
      await delay(totalDelay);
    }
  }
  // Should never reach here, but for TS
  throw lastError;
}

/**
 * Wrap a database call with retry + error mapping.
 * This is the recommended entry point for repositories.
 *
 * Accepts any function that returns a Promise (or a thenable Supabase
 * PostgrestBuilder chain). The return type is preserved.
 */
export async function dbCall<T>(
  fn: () => Promise<T> | { then: (r: (v: T) => unknown) => unknown },
  options: RetryOptions = {},
): Promise<T> {
  try {
    const result = await withRetry(
      () => Promise.resolve(fn() as Promise<T>),
      options,
    );
    return result;
  } catch (e) {
    throw mapDbError(e, { label: options.label });
  }
}

/**
 * Lightweight wrapper for raw Supabase query chains that returns
 * the standard { data, count, error } envelope. Use this when you
 * have a `PostgrestFilterBuilder` that hasn't been awaited.
 */
export async function dbQuery<T = Record<string, unknown>>(
  q: { then: (resolve: (v: { data: T | T[] | null; count: number | null; error: unknown }) => unknown) => unknown },
  options: RetryOptions = {},
): Promise<{ data: T | T[] | null; count: number | null; error: unknown }> {
  try {
    const result = await withRetry(
      () => Promise.resolve(q.then((v: any) => v)),
      options,
    );
    return result as { data: T | T[] | null; count: number | null; error: unknown };
  } catch (e) {
    return { data: null, count: null, error: e };
  }
}
