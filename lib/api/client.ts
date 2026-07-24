/**
 * Optimized Browser API Client
 * ────────────────────────────
 * Production-grade fetch wrapper with:
 *  - Request deduplication (5s window)
 *  - In-memory response cache (configurable TTL)
 *  - Automatic AbortController (25s default timeout)
 *  - Standardized error handling
 *  - Type-safe responses
 *  - Lightweight (no external deps)
 *
 * Use instead of raw fetch() in components.
 */

import { logger } from '@/lib/logging';

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; statusCode: number; meta?: Record<string, unknown> };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface ApiClientOptions {
  /** Cache TTL in ms (default 30s) */
  cacheTtl?: number;
  /** Request timeout in ms (default 25s) */
  timeout?: number;
  /** Force bypass cache for this request */
  skipCache?: boolean;
  /** Optional abort signal */
  signal?: AbortSignal;
}

interface CacheEntry<T> {
  body: ApiResponse<T>;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

// In-flight request dedup
const inFlight = new Map<string, Promise<ApiResponse<unknown>>>();

// Cleanup old cache entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (v.expires < now) cache.delete(k);
    }
  }, 5 * 60 * 1000);
  if (typeof (cleanup as any).unref === 'function') (cleanup as any).unref();
}

function makeKey(url: string, method: string, body?: unknown): string {
  if (body) {
    try {
      return `${method}:${url}:${JSON.stringify(body)}`;
    } catch {
      // circular refs
    }
  }
  return `${method}:${url}`;
}

/**
 * Lightweight GET with cache + dedup.
 * Use for reads where the same URL is called multiple times in quick succession.
 */
export async function apiGet<T = unknown>(
  url: string,
  options: ApiClientOptions = {}
): Promise<ApiResponse<T>> {
  const { cacheTtl = 30_000, timeout = 25_000, skipCache = false, signal } = options;
  const key = `GET:${url}`;

  // Cache hit
  if (!skipCache) {
    const hit = cache.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expires > Date.now()) {
      return hit.body;
    }
  }

  // Dedup in-flight
  const inflight = inFlight.get(key);
  if (inflight) return inflight as Promise<ApiResponse<T>>;

  const promise = (async (): Promise<ApiResponse<T>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    // Chain external signal
    if (signal) {
      if (signal.aborted) controller.abort();
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      });
      const body = (await res.json()) as ApiResponse<T>;
      if (body.ok) {
        cache.set(key, { body, expires: Date.now() + cacheTtl });
      }
      return body;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network error';
      logger.warn('API GET failed', { url, error: message });
      return {
        ok: false,
        error: { code: 'NETWORK', message, statusCode: 0 },
      };
    } finally {
      clearTimeout(timer);
    }
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * POST without caching.
 * Use for state-changing operations.
 */
export async function apiPost<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<ApiClientOptions, 'skipCache'> = {}
): Promise<ApiResponse<T>> {
  const { timeout = 25_000, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return (await res.json()) as ApiResponse<T>;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error';
    logger.warn('API POST failed', { url, error: message });
    return {
      ok: false,
      error: { code: 'NETWORK', message, statusCode: 0 },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PATCH helper — mirrors apiPost. Added so restaurant order actions can use
 * the canonical `PATCH /api/orders/status` endpoint instead of duplicating
 * order-lifecycle logic in bespoke routes.
 */
export async function apiPatch<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<ApiClientOptions, 'skipCache'> = {}
): Promise<ApiResponse<T>> {
  const { timeout = 25_000, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return (await res.json()) as ApiResponse<T>;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error';
    logger.warn('API PATCH failed', { url, error: message });
    return {
      ok: false,
      error: { code: 'NETWORK', message, statusCode: 0 },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invalidate cached GET response for a URL.
 * Call after a mutation that would change the response.
 */
export function apiInvalidate(url: string): void {
  const key = `GET:${url}`;
  cache.delete(key);
}

/**
 * Invalidate all cached responses matching a prefix.
 * Useful after user actions that affect many endpoints.
 */
export function apiInvalidatePrefix(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.includes(prefix)) cache.delete(k);
  }
}

/**
 * Clear all cached responses.
 */
export function apiClearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics (for debugging/monitoring).
 */
export function apiCacheStats(): { size: number; inflight: number } {
  return { size: cache.size, inflight: inFlight.size };
}
