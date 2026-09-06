/**
 * POST /api/analytics/cart
 *
 * Privacy-friendly cart analytics. No PII. Just event counts.
 *
 * Body: { event: string, data?: object, ts?: number }
 *
 * Used by the cart page to track:
 *   - cart_viewed
 *   - item_removed
 *   - quantity_changed
 *   - coupon_applied
 *   - coupon_rejected
 *   - cart_abandoned
 *   - checkout_started
 *
 * Failures are silent (analytics must never block the customer).
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_EVENTS = new Set<string>([
  'cart_viewed',
  'item_added',
  'item_removed',
  'quantity_changed',
  'coupon_applied',
  'coupon_rejected',
  'tip_changed',
  'cart_abandoned',
  'checkout_started',
  'cart_refreshed',
  'cart_invalidated',
]);

const ALLOWED_DATA_KEYS = new Set<string>([
  'product_id',
  'category',
  'restaurant_id',
  'quantity',
  'kind',
  'error',
  'subtotal',
  'item_count',
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
    // In production, this would write to a cart_analytics_events table.
    // For now, just acknowledge.
    return NextResponse.json({ ok: true, event, received_at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  }
}
