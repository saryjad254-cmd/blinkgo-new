/**
 * Foundation: Cache
 * ────────────────
 * Simple, typed, in-memory cache with TTL and stale-while-revalidate.
 * Production: use a Redis adapter (L1 in-memory + L2 Redis).
 * Dev: in-memory only.
 *
 * Usage:
 *   import { cache } from '@/lib/foundation/cache';
 *   const data = await cache.getOrLoad('key', 60_000, () => fetchFromDb());
 *   await cache.invalidate('key');
 *   await cache.invalidatePrefix('user:');
 */

import { log } from './logger';

interface Entry<T> {
  readonly value: T;
  readonly expiresAt: number; // ms epoch
  readonly loadedAt: number;
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
  clear(): Promise<void>;
}

// ── In-memory implementation ───────────────────────────────────
class MemoryCache implements CacheAdapter {
  private store = new Map<string, Entry<unknown>>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      loadedAt: Date.now(),
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    const keysToDelete: string[] = [];
    this.store.forEach((_v, k) => {
      if (k.startsWith(prefix)) keysToDelete.push(k);
    });
    for (const k of keysToDelete) this.store.delete(k);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /** Internal: read potentially-stale entry (for SWR). */
  async peekStale<T>(key: string): Promise<T | undefined> {
    return (this.store.get(key)?.value as T) ?? undefined;
  }
}

// ── Cache facade with SWR ──────────────────────────────────────
export class Cache {
  constructor(private readonly adapter: CacheAdapter = memory) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.adapter.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    return this.adapter.set(key, value, ttlMs);
  }

  async invalidate(key: string): Promise<void> {
    return this.adapter.delete(key);
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    return this.adapter.deleteByPrefix(prefix);
  }

  async clear(): Promise<void> {
    return this.adapter.clear();
  }

  /**
   * Get from cache, or load and store. Returns the value (fresh or stale).
   * If stale, schedules a background refresh (stale-while-revalidate).
   */
  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    options: { swr?: number; tags?: string[] } = {},
  ): Promise<T> {
    const cached = await this.adapter.get<T>(key);
    if (cached !== undefined) {
      if (options.swr && options.swr > ttlMs) {
        // Re-check expiry; if past TTL but within SWR window, refresh in bg
        // (MemoryCache already deleted past-expire entries, so this only
        // matters for adapter with explicit SWR. We approximate with a peek.)
        const stale = await (this.adapter as MemoryCache).peekStale?.<T>(key);
        if (stale === undefined) {
          // already gone, just load
          const fresh = await loader();
          await this.set(key, fresh, ttlMs);
          return fresh;
        }
        // bg refresh
        loader()
          .then((v) => this.set(key, v, ttlMs))
          .catch((e) => log.warn('cache.swr_refresh_failed', { key, error: String(e) }));
        return stale;
      }
      return cached;
    }
    const fresh = await loader();
    await this.set(key, fresh, ttlMs);
    return fresh;
  }
}

const memory = new MemoryCache();
export const cache = new Cache(memory);
export { memory as memoryCache };

// ── Cache keys (typed) ──────────────────────────────────────────
export const cacheKeys = {
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email.toLowerCase()}`,
  order: (id: string) => `order:${id}`,
  ordersByUser: (userId: string) => `order:user:${userId}`,
  restaurant: (id: string) => `restaurant:${id}`,
  product: (id: string) => `product:${id}`,
  zone: (id: string) => `zone:${id}`,
  portalStats: (role: string, userId: string) => `stats:${role}:${userId}`,
};
