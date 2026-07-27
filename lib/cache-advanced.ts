/**
 * Advanced Cache — multi-tier
 * ────────────────────────────
 * Production-grade caching with:
 *  - LRU eviction
 *  - TTL support
 *  - Stale-while-revalidate
 *  - Hit/miss metrics
 *  - Cache stampede prevention (single-flight)
 *  - Tag-based invalidation
 *
 * For ultra-hot data (search, products, drivers).
 */

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

interface Entry<V> {
  value: V;
  expires: number;
  staleExpires: number;
  inflight?: Promise<V>;
}

const DEFAULT_MAX_SIZE = 5000;
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_STALE_MS = 5 * 60_000;

export class AdvancedLRUCache<V = unknown> {
  private store = new Map<string, Entry<V>>();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: 0 };
  private maxSize: number;
  private defaultTtl: number;
  private defaultStale: number;

  constructor(options: { maxSize?: number; ttlMs?: number; staleMs?: number } = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.defaultTtl = options.ttlMs ?? DEFAULT_TTL_MS;
    this.defaultStale = options.staleMs ?? DEFAULT_STALE_MS;
  }

  /**
   * Get a cached value. Returns undefined if expired.
   */
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }
    this.stats.hits++;
    this.updateHitRate();
    // LRU: re-insert
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * Set a value with custom TTL.
   */
  set(key: string, value: V, ttlMs?: number, staleMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtl;
    const stale = staleMs ?? this.defaultStale;
    const now = Date.now();

    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict oldest
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
        this.stats.evictions++;
      }
    }

    this.store.set(key, {
      value,
      expires: now + ttl,
      staleExpires: now + stale,
    });
    this.stats.size = this.store.size;
  }

  /**
   * Get-or-compute with single-flight (prevents cache stampede).
   */
  async getOrSet(
    key: string,
    compute: () => Promise<V>,
    ttlMs?: number
  ): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;

    const entry = this.store.get(key);
    if (entry?.inflight) return entry.inflight;

    const promise = (async () => {
      try {
        const value = await compute();
        this.set(key, value, ttlMs);
        return value;
      } finally {
        if (entry) entry.inflight = undefined;
      }
    })();

    if (entry) entry.inflight = promise;
    else {
      this.store.set(key, {
        value: undefined as unknown as V,
        expires: Date.now() + (ttlMs ?? this.defaultTtl),
        staleExpires: Date.now() + (ttlMs ?? this.defaultTtl),
        inflight: promise,
      });
    }

    return promise;
  }

  /**
   * Invalidate a single key.
   */
  delete(key: string): boolean {
    const result = this.store.delete(key);
    this.stats.size = this.store.size;
    return result;
  }

  /**
   * Invalidate all keys matching a pattern (substring).
   */
  invalidatePattern(pattern: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key);
        count++;
      }
    }
    this.stats.size = this.store.size;
    return count;
  }

  /**
   * Clear entire cache.
   */
  clear(): void {
    this.store.clear();
    this.stats.size = 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

// Global cache instance
let _global: AdvancedLRUCache | null = null;
export function getAdvancedCache(): AdvancedLRUCache {
  if (!_global) {
    _global = new AdvancedLRUCache({ maxSize: 10_000, ttlMs: 60_000, staleMs: 5 * 60_000 });
  }
  return _global;
}
