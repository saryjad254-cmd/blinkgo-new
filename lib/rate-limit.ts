/**
 * Token Bucket Rate Limiter
 * ─────────────────────────
 * Production-grade rate limiter using token bucket algorithm.
 * 
 * Benefits over sliding window:
 *  - More predictable behavior
 *  - Allows burst traffic up to bucket size
 *  - Lower memory footprint
 *  - Linear time complexity
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSec: number;
  /** Identifier for the bucket */
  name: string;
  /** Custom key generator */
  keyFn?: (req: NextRequest) => string | null;
}

interface Bucket {
  tokens: number;      // Available tokens
  lastRefill: number;  // Last refill timestamp (ms)
}

/**
 * In-memory bucket store.
 * For multi-instance production, swap with Redis-based implementation.
 */
const store = new Map<string, Bucket>();

// Cleanup old buckets every 5 minutes
if (typeof setInterval !== 'undefined') {
  const cleanup = setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    for (const [k, v] of store.entries()) {
      if (now - v.lastRefill > maxAge) {
        store.delete(k);
      }
    }
  }, 5 * 60 * 1000);
  if (typeof (cleanup as any).unref === 'function') {
    (cleanup as any).unref();
  }
}

/**
 * Extract client IP from various headers (works in dev and behind proxies)
 */
export function getClientIp(req: NextRequest | Request): string {
  // Try common headers in order of preference
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0]?.trim() || 'unknown';
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Refill bucket based on elapsed time
 */
function refillBucket(bucket: Bucket, rate: number, capacity: number, now: number): void {
  const elapsedMs = now - bucket.lastRefill;
  const tokensToAdd = (elapsedMs / 1000) * rate;
  bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

/**
 * Check rate limit using token bucket algorithm.
 * Returns a NextResponse with 429 status if rate limited, null otherwise.
 */
export function rateLimit(
  config: RateLimitConfig,
  req: NextRequest | Request
): NextResponse | null {
  const { limit, windowSec, name } = config;
  const keyFn = config.keyFn || ((r) => getClientIp(r as NextRequest));
  const key = keyFn(req as NextRequest);
  
  if (!key) return null; // Can't apply rate limit without key
  
  const bucketKey = `rate:${name}:${key}`;
  const capacity = limit;
  const rate = limit / windowSec; // tokens per second
  const now = Date.now();
  
  let bucket = store.get(bucketKey);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now };
    store.set(bucketKey, bucket);
  } else {
    refillBucket(bucket, rate, capacity, now);
  }
  
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return null;
  }
  
  // Calculate retry-after
  const tokensNeeded = 1 - bucket.tokens;
  const retryAfterSec = Math.ceil(tokensNeeded / rate);
  
  logger.warn('Rate limit exceeded', {
    bucket: bucketKey,
    name,
    tokens: bucket.tokens,
    retryAfterSec,
  });
  
  const response = NextResponse.json(
    {
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        retryAfter: retryAfterSec,
      },
    },
    { status: 429 }
  );
  response.headers.set('Retry-After', String(retryAfterSec));
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', '0');
  response.headers.set('X-RateLimit-Reset', String(Math.floor((now + retryAfterSec * 1000) / 1000)));
  return response;
}

/**
 * Auth-specific rate limiters (predefined configurations)
 */
export const authRateLimiters = {
  login: (req: NextRequest, email?: string) =>
    rateLimit(
      {
        limit: 20,
        windowSec: 15 * 60, // 20 per 15 min
        name: email ? `login:ip:${getClientIp(req)}:email:${email.toLowerCase()}` : 'login',
        keyFn: (r) => {
          const ip = getClientIp(r);
          return email ? `${ip}:${email.toLowerCase()}` : ip;
        },
      },
      req
    ),
  
  register: (req: NextRequest) =>
    rateLimit(
      { limit: 10, windowSec: 15 * 60, name: 'register' },
      req
    ),
  
  passwordReset: (req: NextRequest) =>
    rateLimit(
      { limit: 5, windowSec: 15 * 60, name: 'password-reset' },
      req
    ),
  
  otpVerify: (req: NextRequest, email?: string) =>
    rateLimit(
      {
        limit: 10,
        windowSec: 15 * 60,
        name: email ? `otp:email:${email.toLowerCase()}` : 'otp',
      },
      req
    ),
  
  magicLink: (req: NextRequest) =>
    rateLimit(
      { limit: 3, windowSec: 15 * 60, name: 'magic-link' },
      req
    ),
};

/**
 * Get current rate limit stats (for monitoring)
 */
export function getRateLimitStats(): {
  totalBuckets: number;
  bucketsByName: Record<string, number>;
} {
  const bucketsByName: Record<string, number> = {};
  for (const key of store.keys()) {
    const name = key.split(':')[1] || 'unknown';
    bucketsByName[name] = (bucketsByName[name] || 0) + 1;
  }
  return {
    totalBuckets: store.size,
    bucketsByName,
  };
}

/**
 * Clear all rate limit buckets (admin only)
 */
export function clearRateLimits(): void {
  store.clear();
}
