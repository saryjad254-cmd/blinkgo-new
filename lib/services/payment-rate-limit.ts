/**
 * Persistent Payment Rate Limiter (Phase 7G-C)
 * ─────────────────────────────────────────────
 * Replaces the in-memory token bucket with a Postgres-backed
 * implementation. Survives Vercel serverless cold-starts and
 * works across multiple instances.
 *
 * Uses the `payment_rate_limit_check` RPC (migration 65) which
 * atomically refills and consumes tokens in a single statement.
 *
 * In mock/dev mode, the application falls back to an in-memory
 * Map (the dev-only mode is documented and not used in production).
 */
import { logger } from '@/lib/logging';
import { createServiceClient } from '@/lib/supabase/service';
import { createHash } from 'node:crypto';

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSec: number;
  /** Burst capacity (defaults to limit) */
  burst?: number;
}

/**
 * Build a stable rate-limit key. Concatenates the bucket and a
 * caller-supplied discriminator (e.g. user id, ip). The discriminator
 * is hashed so that the key length is bounded and doesn't leak PII
 * to logs.
 */
export function buildRateLimitKey(bucket: string, discriminator: string): string {
  // 7G-D: include a stable hash prefix so the bucket key length is bounded
  // and discriminators are not stored verbatim in the bucket name.
  const hash = createHash('sha256').update(discriminator).digest('hex').slice(0, 16);
  return `${bucket}:${hash}`;
}

export interface RateLimitResult {
  allowed: boolean;
  tokensRemaining: number;
  retryAfterSeconds: number;
  bucket: string;
}

/**
 * Thresholds for payment-related routes.
 * Tuned to be permissive enough for legitimate customers
 * (e.g. checking status 30 times during a payment flow)
 * while blocking automated abuse.
 *
 * These can be overridden via env vars for dev/test:
 *   PAYMENT_RATE_LIMIT_USER_CHECKOUT=1000
 *   PAYMENT_RATE_LIMIT_USER_STATUS_POLL=1000
 *   PAYMENT_RATE_LIMIT_USER_DRAFT=1000
 *   PAYMENT_RATE_LIMIT_IP_CHECKOUT=5000
 *   PAYMENT_RATE_LIMIT_IP_STATUS_POLL=5000
 *   PAYMENT_RATE_LIMIT_DRAFT=100
 */
function envLimit(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export const PAYMENT_RATE_LIMITS = {
  // Per-user limits
  userCheckout: { limit: envLimit('PAYMENT_RATE_LIMIT_USER_CHECKOUT', 30), windowSec: 3600, burst: envLimit('PAYMENT_RATE_LIMIT_USER_CHECKOUT_BURST', 10) } as RateLimitConfig,
  userStatusPoll: { limit: envLimit('PAYMENT_RATE_LIMIT_USER_STATUS_POLL', 120), windowSec: 60, burst: envLimit('PAYMENT_RATE_LIMIT_USER_STATUS_POLL_BURST', 30) } as RateLimitConfig,
  userDraftCreate: { limit: envLimit('PAYMENT_RATE_LIMIT_USER_DRAFT', 50), windowSec: 3600, burst: envLimit('PAYMENT_RATE_LIMIT_USER_DRAFT_BURST', 5) } as RateLimitConfig,

  // Per-IP limits (defense against multi-account abuse)
  ipCheckout: { limit: envLimit('PAYMENT_RATE_LIMIT_IP_CHECKOUT', 100), windowSec: 3600, burst: envLimit('PAYMENT_RATE_LIMIT_IP_CHECKOUT_BURST', 30) } as RateLimitConfig,
  ipAuth: { limit: envLimit('PAYMENT_RATE_LIMIT_IP_AUTH', 20), windowSec: 60, burst: 5 } as RateLimitConfig,
  ipStatusPoll: { limit: envLimit('PAYMENT_RATE_LIMIT_IP_STATUS_POLL', 300), windowSec: 60, burst: 60 } as RateLimitConfig,

  // Per-draft limits (prevent re-creation attacks)
  draftCheckout: { limit: envLimit('PAYMENT_RATE_LIMIT_DRAFT', 5), windowSec: 300, burst: 2 } as RateLimitConfig,

  // Per-PaymentIntent limits
  piEvent: { limit: 100, windowSec: 60, burst: 50 } as RateLimitConfig,

  // Admin limits
  adminMutation: { limit: envLimit('PAYMENT_RATE_LIMIT_ADMIN_MUTATION', 60), windowSec: 60, burst: 20 } as RateLimitConfig,
  adminRead: { limit: envLimit('PAYMENT_RATE_LIMIT_ADMIN_READ', 600), windowSec: 60, burst: 100 } as RateLimitConfig,

  // Cron / system
  cron: { limit: 2, windowSec: 60, burst: 1 } as RateLimitConfig,
} as const;

const inMemoryBuckets = new Map<string, { tokens: number; lastRefill: number }>();

/**
 * Detect whether to use in-memory fallback (mock/dev only).
 * Production never uses the fallback.
 */
function shouldUseInMemory(): boolean {
  // Production NEVER uses in-memory
  if (process.env.NODE_ENV === 'production') return false;
  // Test mode: bypass rate limits entirely (for test suites)
  if (process.env.DISABLE_RATE_LIMIT === 'true') return true;
  if (process.env.ALLOW_MOCK_PAYMENTS === 'true') return true;
  // If the Supabase client can't be constructed, use in-memory
  return !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Reset all in-memory rate limit buckets. Used by test suites.
 */
export function resetInMemoryRateLimits(): void {
  inMemoryBuckets.clear();
}

/**
 * Check rate limit. Decrements the bucket by 1 token.
 * Returns whether the request is allowed.
 *
 * Overloads:
 *   - checkRateLimit(bucketKey, config)        — explicit config
 *   - checkRateLimit(configName, discriminator) — looks up named config from PAYMENT_RATE_LIMITS
 */
export async function checkRateLimit(
  bucketOrConfig: string,
  configOrDiscriminator: RateLimitConfig | string,
  maybeDiscriminator?: string,
): Promise<RateLimitResult> {
  let config: RateLimitConfig;
  let bucketKey: string;
  let discriminator: string | undefined;

  if (typeof configOrDiscriminator === 'string') {
    // Signature: checkRateLimit(configName, discriminator)
    const cfg = (PAYMENT_RATE_LIMITS as Record<string, RateLimitConfig | undefined>)[bucketOrConfig];
    if (!cfg) {
      logger.error('payment.rate_limit.unknown_config', { bucket: bucketOrConfig });
      return { allowed: false, tokensRemaining: 0, retryAfterSeconds: 60, bucket: bucketOrConfig };
    }
    config = cfg;
    bucketKey = bucketOrConfig;
    discriminator = configOrDiscriminator;
  } else {
    // Signature: checkRateLimit(bucketKey, config)
    config = configOrDiscriminator;
    bucketKey = bucketOrConfig;
    discriminator = maybeDiscriminator;
  }

  const effectiveKey = discriminator ? buildRateLimitKey(bucketKey, discriminator) : bucketKey;
  return checkRateLimitRaw(effectiveKey, config);
}

async function checkRateLimitRaw(
  bucketKey: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  // Test mode: bypass rate limit entirely (DISABLE_RATE_LIMIT=true)
  if (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') {
    return {
      allowed: true,
      tokensRemaining: config.burst ?? config.limit,
      retryAfterSeconds: 0,
      bucket: bucketKey,
    };
  }
  if (shouldUseInMemory()) {
    return inMemoryCheck(bucketKey, config);
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('payment_rate_limit_check', {
      p_bucket_key: bucketKey,
      p_limit: config.limit,
      p_window_seconds: config.windowSec,
      p_burst: config.burst ?? config.limit,
    });
    if (error || !data || data.length === 0) {
      // Fail open on transient DB error (logged) — better than blocking
      // every payment. The error is recorded for investigation.
      logger.error('payment.rate_limit.db_error_fail_closed', {
        bucket: bucketKey,
        error: error?.message,
      });
      return { allowed: false, tokensRemaining: 0, retryAfterSeconds: 30, bucket: bucketKey };
    }
    const row = data[0];
    return {
      allowed: !!row.allowed,
      tokensRemaining: Number(row.tokens_remaining),
      retryAfterSeconds: Number(row.retry_after_seconds),
      bucket: bucketKey,
    };
  } catch (err) {
    logger.error('payment.rate_limit.check_failed', {
      bucket: bucketKey,
      error: (err as Error).message,
    });
    return { allowed: false, tokensRemaining: 0, retryAfterSeconds: 30, bucket: bucketKey };
  }
}

function inMemoryCheck(
  bucketKey: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  const burst = config.burst ?? config.limit;
  const refillRate = config.limit / config.windowSec; // tokens per second
  const existing = inMemoryBuckets.get(bucketKey);
  let tokens: number;
  if (!existing) {
    tokens = burst;
  } else {
    const elapsedSec = (now - existing.lastRefill) / 1000;
    tokens = Math.min(burst, existing.tokens + elapsedSec * refillRate);
  }
  let allowed: boolean;
  let retryAfterSeconds = 0;
  if (tokens >= 1) {
    tokens -= 1;
    allowed = true;
  } else {
    allowed = false;
    retryAfterSeconds = Math.max(1, Math.ceil((1 - tokens) / refillRate));
  }
  inMemoryBuckets.set(bucketKey, { tokens, lastRefill: now });
  return { allowed, tokensRemaining: Math.floor(tokens), retryAfterSeconds, bucket: bucketKey };
}

/**
 * Build a bucket key for user-based limits.
 */
export function userBucketKey(userId: string, route: string): string {
  return `user:${userId}:${route}`;
}

/**
 * Build a bucket key for IP-based limits.
 */
export function ipBucketKey(ip: string, route: string): string {
  return `ip:${ip}:${route}`;
}

/**
 * Build a bucket key for draft-based limits.
 */
export function draftBucketKey(draftId: string, action: string): string {
  return `draft:${draftId}:${action}`;
}

/**
 * Build a bucket key for PaymentIntent-based limits.
 */
export function piBucketKey(piId: string, action: string): string {
  return `pi:${piId}:${action}`;
}

/**
 * Convenience: enforce a rate limit and return a 429 response if exceeded.
 */
export function buildRateLimitResponse(result: RateLimitResult, requestId: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'rate_limited',
      retry_after_seconds: result.retryAfterSeconds,
      request_id: requestId,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Bucket': result.bucket,
        'X-RateLimit-Remaining': String(result.tokensRemaining),
        'Cache-Control': 'no-store',
      },
    },
  );
}

/**
 * Cleanup old in-memory buckets (dev/mock only).
 * Called by the rate-limit module at startup.
 */
if (typeof setInterval !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const cleanup = setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000;
    for (const [k, v] of inMemoryBuckets.entries()) {
      if (now - v.lastRefill > maxAge) inMemoryBuckets.delete(k);
    }
  }, 5 * 60 * 1000);
  cleanup.unref();
}
