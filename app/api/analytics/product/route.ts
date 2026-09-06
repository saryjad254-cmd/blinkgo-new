/**
 * POST /api/analytics/product
 *
 * Privacy-friendly product analytics. No PII. Just event counts.
 *
 * Body: { event: string, data?: object, ts?: number }
 *
 * Used by the ProductDetailModal to track:
 *   - product_viewed
 *   - modifier_selected
 *   - add_to_cart_attempted / succeeded / failed / validation_failed
 *
 * Failures are silent (analytics must never block the customer).
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_EVENTS = new Set<string>([
  'product_viewed',
  'modifier_selected',
  'add_to_cart_attempted',
  'add_to_cart_succeeded',
  'add_to_cart_failed',
  'add_to_cart_validation_failed',
]);

const ALLOWED_DATA_KEYS = new Set<string>([
  'product_id',
  'category',
  'modifier_id',
  'option_id',
  'quantity',
  'kind',
  'error',
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
    }
    const event = String(body.event || '').slice(0, 64);
    if (!VALID_EVENTS.has(event)) {
      // Silently accept but don't log unknown events
      return NextResponse.json({ ok: true });
    }
    // Whitelist data fields — never trust client keys
    const data: Record<string, unknown> = {};
    if (body.data && typeof body.data === 'object') {
      for (const k of Object.keys(body.data)) {
        if (ALLOWED_DATA_KEYS.has(k)) {
          const v = (body.data as Record<string, unknown>)[k];
          if (typeof v === 'string') data[k] = v.slice(0, 128);
          else if (typeof v === 'number') data[k] = v;
        }
      }
    }
    // In production, this would write to a product_analytics_events table.
    // For now, just acknowledge — the route exists so the sendBeacon call
    // doesn't fail in the browser console. Hook this up to a real sink
    // when the analytics pipeline is built out.
    return NextResponse.json({ ok: true, event, received_at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  }
}
