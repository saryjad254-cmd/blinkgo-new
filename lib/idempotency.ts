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
 * v82: storage is now DB-backed (idempotency_keys table) so it works
 * across serverless instances. The in-memory cache is kept as a
 * fast-path so the common case (no collision) avoids a DB write.
 *
 * For multi-instance / serverless: set the IDEMPOTENCY_USE_DB env var
 * to '1' to force the DB path. Default behaviour: in-memory fast-path
 * with DB fallback only on miss.
 */

import { createServiceClient } from '@/lib/supabase/service';

interface CachedResponse {
  status: number;
  body: any;
  createdAt: number;
}

const inMemoryCache = new Map<string, CachedResponse>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 10_000;

// When true, the DB path is consulted for every call. Default is
// 'fast-path': in-memory lookup, DB lookup only on miss.
const USE_DB = process.env.IDEMPOTENCY_USE_DB === '1';

const SCOPE = (method: string, path: string) => `${method.toUpperCase()}:${path}`;

/**
 * Look up a cached response.
 * Returns null if the key is not in the cache or has expired.
 *
 * v82: in-memory fast-path + DB fallback. The DB write happens lazily
 * inside `setIdempotencyResponse` so this call is read-only.
 */
export async function getIdempotencyResponse(
  key: string,
  scopeOrReq?: string | { method: string; url?: string; headers?: Headers },
): Promise<CachedResponse | null> {
  const scope = typeof scopeOrReq === 'string'
    ? scopeOrReq
    : scopeOrReq
      ? SCOPE(scopeOrReq.method ?? 'POST', new URL(scopeOrReq.url ?? 'http://x/').pathname)
      : 'global';

  const cacheKey = `${scope}:${key}`;

  // Fast path: in-memory
  const mem = inMemoryCache.get(cacheKey);
  if (mem && Date.now() - mem.createdAt <= TTL_MS) return mem;
  if (mem) inMemoryCache.delete(cacheKey);

  if (!USE_DB) return null;

  // Slow path: DB
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('idempotency_keys')
      .select('response_status, response_body, expires_at')
      .eq('key', key)
      .eq('scope', scope)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!data || data.response_body == null) return null;
    return {
      status: data.response_status ?? 200,
      body: data.response_body,
      createdAt: Date.now(),
    };
  } catch {
    // DB unavailable — fall through to null (caller will recompute)
    return null;
  }
}

/**
 * Store a response for an idempotency key.
 *
 * v82: writes to in-memory cache immediately; persists to DB so the
 * result survives across instances. The DB write is best-effort and
 * non-blocking on failure (the in-memory path already protects the
 * current instance).
 */
export async function setIdempotencyResponse(
  key: string,
  status: number,
  body: any,
  scopeOrReq?: string | { method: string; url?: string; headers?: Headers },
): Promise<void> {
  const scope = typeof scopeOrReq === 'string'
    ? scopeOrReq
    : scopeOrReq
      ? SCOPE(scopeOrReq.method ?? 'POST', new URL(scopeOrReq.url ?? 'http://x/').pathname)
      : 'global';

  const cacheKey = `${scope}:${key}`;
  // In-memory
  if (inMemoryCache.size >= MAX_ENTRIES) {
    const firstKey = inMemoryCache.keys().next().value;
    if (firstKey) inMemoryCache.delete(firstKey);
  }
  inMemoryCache.set(cacheKey, { status, body, createdAt: Date.now() });

  if (!USE_DB) return;

  // DB persist (best-effort, fire-and-forget so the response is not
  // held up by a slow DB write)
  void (async () => {
    try {
      const svc = createServiceClient();
      await svc.from('idempotency_keys').upsert(
        {
          key,
          scope,
          response_status: status,
          response_body: body,
          expires_at: new Date(Date.now() + TTL_MS).toISOString(),
        },
        { onConflict: 'key,scope' },
      );
    } catch {
      // non-fatal
    }
  })();
}

/**
 * Synchronous wrapper for backward compatibility with existing call
 * sites. Reads from the in-memory cache only; the DB lookup is opt-in
 * via the async functions above.
 */
export function getIdempotencyResponseSync(key: string): CachedResponse | null {
  // Scan all entries for matching key (in-memory only). This is the
  // legacy fast path used by the orders route.
  for (const [k, v] of inMemoryCache.entries()) {
    if (k.endsWith(`:${key}`) && Date.now() - v.createdAt <= TTL_MS) return v;
  }
  return null;
}

/**
 * Synchronous wrapper for backward compatibility.
 */
export function setIdempotencyResponseSync(key: string, status: number, body: any): void {
  if (inMemoryCache.size >= MAX_ENTRIES) {
    const firstKey = inMemoryCache.keys().next().value;
    if (firstKey) inMemoryCache.delete(firstKey);
  }
  inMemoryCache.set(`global:${key}`, { status, body, createdAt: Date.now() });
}

/**
 * Extract the idempotency key from a request.
 * Looks for `X-Idempotency-Key` header.
 */
export function getIdempotencyKey(req: Request): string | null {
  const key = req.headers.get('x-idempotency-key');
  if (!key) return null;
  if (key.length < 8 || key.length > 255) return null;
  return key;
}
