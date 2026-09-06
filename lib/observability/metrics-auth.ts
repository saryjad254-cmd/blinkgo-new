import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Protect operational metrics from public discovery and scraping. */
export function requireMetricsToken(request: Request): NextResponse | null {
  const configured = process.env.METRICS_TOKEN;
  if (!configured) {
    if (process.env.NODE_ENV !== 'production') return null;
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!supplied || !secureEqual(supplied, configured)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer' } },
    );
  }
  return null;
}
