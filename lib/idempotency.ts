/**
 * Idempotency Manager
 * ───────────────────
 * Prevents duplicate order processing when the client retries the same
 * request (e.g., after a network failure, double-tap on Place Order).
 *
 * Pattern: DoorDash / Stripe style
 * - Client generates a unique key (UUID) per logical operation
 * - Server stores the result against the key
 * - On retry with the same key, return the cached result
 *
 * Storage: in-memory + optional persistence to DB.
 * For v44: in-memory only (sufficient for single-instance deployments).
 * For multi-instance: use Redis or the `idempotency_keys` table.
 */

interface CachedResponse {
  status: number;
  body: any;
  createdAt: number;
}

const cache = new Map<string, CachedResponse>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 10_000;

/**
 * Get a cached response for an idempotency key.
 * Returns null if the key is not in the cache or has expired.
 */
export function getIdempotencyResponse(key: string): CachedResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

/**
 * Store a response for an idempotency key.
 */
export function setIdempotencyResponse(key: string, status: number, body: any): void {
  // Evict oldest entries if we hit the limit
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, {
    status,
    body,
    createdAt: Date.now(),
  });
}

/**
 * Extract the idempotency key from a request.
 * Looks for `X-Idempotency-Key` header.
 */
export function getIdempotencyKey(req: Request): string | null {
  const key = req.headers.get('x-idempotency-key');
  if (!key) return null;
  // Basic validation: UUIDs are 36 chars, also allow longer custom keys
  if (key.length < 8 || key.length > 255) return null;
  return key;
}
