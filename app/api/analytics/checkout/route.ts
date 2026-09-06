/**
 * Checkout Analytics — privacy-friendly event endpoint
 * ──────────────────────────────────────────────────────
 * POST /api/analytics/checkout
 *
 * Valid events (whitelisted):
 *   checkout_started, draft_created, draft_refreshed, draft_invalidated,
 *   draft_reviewed, draft_confirmed, draft_failed, draft_expired,
 *   payment_started, payment_failed, order_completed
 *
 * Valid data keys (whitelisted, no PII):
 *   draft_id, order_id, restaurant_id, item_count, subtotal, total,
 *   payment_method, kind, error, error_code
 */
import { apiRoute, ok, log, tier } from '@/lib/api/canonical';
import { ValidationError } from '@/lib/foundation/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckoutPayload = { event?: unknown; data?: unknown };

function analyticsValue(value: unknown): string | number | boolean | null | undefined {
  if (typeof value === 'string') return value.slice(0, 160);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean' || value === null) return value;
  return undefined;
}

const VALID_EVENTS = new Set<string>([
  'checkout_started',
  'draft_created',
  'draft_refreshed',
  'draft_invalidated',
  'draft_reviewed',
  'draft_confirmed',
  'draft_failed',
  'draft_expired',
  'payment_started',
  'payment_failed',
  'order_completed',
]);

const ALLOWED_DATA_KEYS = new Set<string>([
  'draft_id',
  'order_id',
  'restaurant_id',
  'item_count',
  'subtotal',
  'total',
  'payment_method',
  'kind',
  'error',
  'error_code',
  'delivery_distance_km',
  'has_coupon',
  'has_points',
  'duration_ms',
]);

export const POST = apiRoute({
  method: 'POST',
  auth: 'optional',  // allow anonymous analytics for cart abandonment
  rateLimit: tier('system'),
  handler: async ({ req, body }) => {
    // The apiRoute has already parsed the body for us (if JSON content-type).
    // We accept either pre-parsed body or fall back to reading the raw stream.
    let payload: CheckoutPayload = {};
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      payload = body as CheckoutPayload;
    } else {
      try {
        payload = await req.json();
      } catch {
        throw new ValidationError('Invalid JSON body');
      }
    }

    const event = typeof payload.event === 'string' ? payload.event : '';
    if (!event) {
      return ok({ ok: true });  // silent drop
    }
    if (!VALID_EVENTS.has(event)) {
      return ok({ ok: true });  // silent drop unknown events
    }

    // Filter data keys
    const filtered: Record<string, unknown> = {};
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      for (const [key, value] of Object.entries(payload.data)) {
        const normalized = analyticsValue(value);
        if (ALLOWED_DATA_KEYS.has(key) && normalized !== undefined) {
          filtered[key] = normalized;
        }
      }
    }

    log.info('analytics.checkout', { event, ...filtered });

    return ok({ ok: true, event, received_at: new Date().toISOString() });
  },
});
