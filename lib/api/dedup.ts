/**
 * Request Deduplication
 * ─────────────────────
 * Prevents duplicate concurrent requests (e.g. user double-taps submit).
 *
 * Uses a request key (e.g. orderId + action) to track in-flight requests.
 * Returns the same Promise for concurrent calls with the same key.
 */

const inflight = new Map<string, Promise<any>>();

/**
 * Run an async function only once for a given key while in flight.
 * Concurrent calls with the same key will await the same promise.
 */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/**
 * Check if a key is in flight.
 */
export function isInFlight(key: string): boolean {
  return inflight.has(key);
}

/**
 * Cancel all in-flight requests (for testing).
 */
export function clearAll(): void {
  inflight.clear();
}
