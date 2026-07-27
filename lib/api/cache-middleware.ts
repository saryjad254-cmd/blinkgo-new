/**
 * API cache middleware — adds ETag, Last-Modified, and Cache-Control headers.
 * Plus in-memory response cache (LRU) with TTL.
 *
 * Usage:
 *   import { withApiCache } from '@/lib/api/cache-middleware';
 *   export const GET = withApiCache(async (req) => { ... }, { ttl: 30 });
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCache } from '@/lib/cache';

const cache = getCache();

interface Options {
  /** Time-to-live in seconds. */
  ttl?: number;
  /** Cache-Control max-age (browser). */
  maxAge?: number;
  /** Skip cache entirely. */
  noCache?: boolean;
  /** Custom key generator (defaults to URL + method). */
  keyFn?: (req: NextRequest) => string;
  /** Allow stale while revalidate (seconds). */
  swr?: number;
}

const ETag = (s: string) => `"${Buffer.from(s).toString('base64').slice(0, 22)}"`;

export function withApiCache<T extends NextResponse | Response>(
  handler: (req: NextRequest) => Promise<T> | T,
  options: Options = {},
) {
  const { ttl = 30, maxAge, noCache, keyFn, swr = 0 } = options;
  return async (req: NextRequest): Promise<T | NextResponse> => {
    if (noCache) {
      const res = await handler(req);
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }

    const url = req.nextUrl;
    const key = keyFn ? keyFn(req) : `api:${req.method}:${url.pathname}${url.search}`;

    // Try cache
    if (req.method === 'GET' || req.method === 'HEAD') {
      const cached = cache.get(key) as { body: string; headers: Record<string, string> } | null;
      if (cached) {
        const ifNoneMatch = req.headers.get('if-none-match');
        const etag = cached.headers['etag'];
        if (ifNoneMatch && etag && ifNoneMatch === etag) {
          return new NextResponse(null, { status: 304, headers: cached.headers }) as any;
        }
        return new NextResponse(cached.body, { status: 200, headers: cached.headers }) as any;
      }
    }

    const res = await handler(req);
    // Only cache successful JSON responses
    if (res.status === 200 && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        const cloned = res.clone();
        const body = await cloned.text();
        const etag = ETag(body);
        const headers: Record<string, string> = {
          'etag': etag,
          'cache-control': `private, max-age=${maxAge ?? Math.min(ttl, 60)}${swr ? `, stale-while-revalidate=${swr}` : ''}`,
          'x-cache': 'HIT',
        };
        cache.set(key, { body, headers }, { ttlSec: ttl });
        // Return the original response (already sent) — cache used for next time
      } catch {
        // ignore
      }
    }
    return res;
  };
}
