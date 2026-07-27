/**
 * Cache utilities — Next.js cache helpers for API routes and server components.
 *
 * Use cases:
 *  - In-memory LRU for hot data (with TTL)
 *  - Next.js unstable_cache for server-side data
 *  - HTTP cache headers via NextResponse
 */

interface CacheEntry<T> {
  value: T;
  expires: number;
  hits: number;
}

class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    entry.hits++;
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlOrOptions: number | { ttlSec?: number; tags?: string[] }): void {
    const ttlMs = typeof ttlOrOptions === 'number' ? ttlOrOptions : (ttlOrOptions?.ttlSec ?? 60) * 1000;
    // Evict oldest if over capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      value,
      expires: Date.now() + ttlMs,
      hits: 0,
    });
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  stats() {
    let totalHits = 0;
    let valid = 0;
    const now = Date.now();
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      if (entry.expires > now) valid++;
    }
    return { size: this.cache.size, valid, total_hits: totalHits };
  }
}

// Hot caches (in-memory, in-process)
export const searchCache = new LRUCache<string, any>(500);
export const restaurantCache = new LRUCache<string, any>(1000);
export const categoryCache = new LRUCache<string, any>(100);
export const userCache = new LRUCache<string, any>(2000);
export const productCache = new LRUCache<string, any>(2000);

/**
 * Memoize with TTL — wraps an async function to cache results.
 */
export function memoize<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyFn: (...args: Parameters<T>) => string,
  ttlMs: number = 60_000,
  cache: LRUCache<string, any> = new LRUCache(1000),
): T {
  return (async (...args: Parameters<T>) => {
    const key = keyFn(...args);
    const cached = cache.get(key);
    if (cached !== null) return cached;
    const result = await fn(...args);
    cache.set(key, result, ttlMs);
    return result;
  }) as T;
}

/**
 * HTTP cache headers for NextResponse.
 */
export const CACHE_HEADERS = {
  // No cache (always fresh)
  noStore: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },

  // Short cache (10s) — for data that may change
  short: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60' },

  // Medium cache (60s) — for moderate data
  medium: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },

  // Long cache (5min) — for static-ish data
  long: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },

  // Very long (1h) — for truly static
  hour: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },

  // Private (browser only) — for user-specific data
  private: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
};

/**
 * Apply cache headers to a NextResponse.
 */
export function withCache(response: Response, headers: Record<string, string>): Response {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) {
    newHeaders.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Generate a cache key from request URL + user (if any).
 */
export function cacheKey(method: string, url: string, userId?: string): string {
  return `${method}:${url}:${userId ?? 'anon'}`;
}


/**
 * Get a cache by name (for backwards compatibility).
 */
export function getCache(name: string = 'default'): LRUCache<string, any> {
  switch (name) {
    case 'search': return searchCache;
    case 'restaurants': return restaurantCache;
    case 'categories': return categoryCache;
    case 'users': return userCache;
    case 'products': return productCache;
    default: return new LRUCache(1000);
  }
}


/**
 * Higher-order cache wrapper.
 * @param key Cache key
 * @param ttlOrFn Either TTL in seconds, or the compute function
 * @param fnOrUndefined Either the compute function, or undefined if tags provided
 * @param tags Optional tags for cache invalidation
 */
export async function cached<T>(
  key: string,
  ttlOrFn: number | (() => Promise<T>),
  fnOrUndefined?: (() => Promise<T>) | string[],
  tagsOrUndefined?: string[],
): Promise<T> {
  // Detect overload: (key, fn) or (key, ttl, fn) or (key, ttl, fn, tags)
  let ttlSec: number;
  let fn: () => Promise<T>;
  let _tags: string[] | undefined;

  if (typeof ttlOrFn === 'function') {
    fn = ttlOrFn;
    ttlSec = 60;
    _tags = undefined;
  } else {
    ttlSec = ttlOrFn;
    if (Array.isArray(fnOrUndefined)) {
      _tags = fnOrUndefined;
      fn = tagsOrUndefined as any;
    } else {
      fn = fnOrUndefined as any;
      _tags = undefined;
    }
  }

  const lru = new LRUCache<string, any>(1000);
  const hit = lru.get(key);
  if (hit !== null) return hit as T;
  const result = await fn();
  lru.set(key, result, ttlSec * 1000);
  return result;
}
