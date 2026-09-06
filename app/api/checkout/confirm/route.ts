/**
 * Checkout Status (Phase 7G-A: read-only, 7G-B: enriched, 7G-C: hardened)
 * ──────────────────────────────────────────────────────────────────────
 * GET /api/checkout/confirm?draft_id=...
 *
 * Phase 7G-C security hardening:
 *   - Cache-Control: no-store on all responses
 *   - Uniform 404 on cross-user access (no enumeration)
 *   - Internal reasons (ttl, deleted) never exposed
 *   - No client_secret, no auth headers in response
 *   - Persistent per-user rate limit
 *   - Fraud signals
 *   - Read-only (no mutations, even on error)
 *
 * Returns one of these UI states:
 *   - 'awaiting_payment'         No PaymentIntent yet
 *   - 'awaiting_payment_method'  PI created, customer must enter card
 *   - 'requires_action'          3DS challenge required
 *   - 'processing'               Bank processing
 *   - 'paid'                     Payment succeeded, order being created
 *   - 'order_created'            Order exists
 *   - 'failed'                   Payment failed
 *   - 'canceled'                 Payment canceled
 *   - 'expired'                  Draft expired
 *   - 'unavailable'              Payments disabled (rare)
 */
import { NextRequest, NextResponse } from 'next/server';
import { apiRoute, tier } from '@/lib/api/canonical';
import { ValidationError } from '@/lib/foundation/errors';
import { createServiceClient } from '@/lib/supabase/service';
import {
  checkRateLimit,
  PAYMENT_RATE_LIMITS,
  userBucketKey,
  ipBucketKey,
} from '@/lib/services/payment-rate-limit';
import { checkFraudSignals } from '@/lib/services/payment-fraud-signals';
import { logSecurityEvent } from '@/lib/services/payment-secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PaymentUiStatus = 'awaiting_payment' | 'awaiting_payment_method' | 'requires_action'
  | 'processing' | 'paid' | 'order_created' | 'failed' | 'canceled' | 'expired';

interface CheckoutOrderSummary {
  id: string;
  payment_intent_id: string | null;
  status: string;
  payment_status: string;
  created_at: string;
  total: number;
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function validateConfirmQuery(input: unknown): { ok: true; data: { draft_id: string } } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_query' };
  const draftId = (input as Record<string, unknown>).draft_id;
  if (typeof draftId !== 'string' || draftId.length < 8 || draftId.length > 200) {
    return { ok: false, error: 'invalid_draft_id' };
  }
  return { ok: true, data: { draft_id: draftId } };
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || null;
}

/**
 * Wrap a response with no-store headers.
 * Never expose the client_secret or auth-related fields.
 */
function buildResponse(data: Record<string, unknown>, status = 200): NextResponse {
  const safe = { ...data };
  // Strip any sensitive fields if they somehow leak
  delete safe.client_secret;
  delete safe.authorization;
  delete safe.cookie;
  delete safe.draft_body;  // the full draft JSON
  delete safe.delivery_address_full;  // explicit PII
  return NextResponse.json(safe, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

/**
 * GET /api/checkout/confirm?draft_id=...
 * Read-only status endpoint with strict security.
 */
export const GET = apiRoute({
  method: 'GET',
  auth: 'required',
  roles: ['customer', 'admin', 'super_admin'],
  rateLimit: tier('lenient'),
  handler: async ({ query, user, req }) => {
    if (!user) throw new ValidationError('Authentication required');
    const validated = validateConfirmQuery(query);
    if (!validated.ok) {
      return buildResponse({ ok: false, error: validated.error });
    }
    const { draft_id } = validated.data;
    const requestId = req.headers.get('x-request-id') || null;
    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || null;
    const route = 'GET /api/checkout/confirm';

    // 1) Per-user rate limit
    const userLimit = await checkRateLimit(
      userBucketKey(user.id, 'status_poll'),
      PAYMENT_RATE_LIMITS.userStatusPoll,
    );
    if (!userLimit.allowed) {
      await logSecurityEvent({
        event_type: 'polling_flood',
        severity: 'high',
        user_id: user.id,
        ip,
        user_agent: userAgent,
        request_id: requestId,
        route,
        reason: 'User status poll rate limit exceeded',
      });
      return buildResponse({
        ok: false,
        error: 'rate_limited',
        retry_after_seconds: userLimit.retryAfterSeconds,
        request_id: requestId,
      }, 429);
    }

    // 2) Per-IP rate limit
    if (ip) {
      const ipLimit = await checkRateLimit(
        ipBucketKey(ip, 'status_poll'),
        PAYMENT_RATE_LIMITS.ipStatusPoll,
      );
      if (!ipLimit.allowed) {
        return buildResponse({
          ok: false,
          error: 'rate_limited',
          retry_after_seconds: ipLimit.retryAfterSeconds,
          request_id: requestId,
        }, 429);
      }
    }

    // 3) Fraud signals
    const fraud = await checkFraudSignals({
      userId: user.id,
      ip,
      action: 'status_poll',
    });
    if (fraud.recommended_action === 'block') {
      return buildResponse({
        ok: false,
        error: 'temporarily_unavailable',
        request_id: requestId,
      }, 429);
    }

    return getCheckoutStatus(draft_id, user.id, requestId, ip, route);
  },
});

/**
 * POST is NOT ALLOWED in Phase 7G-A. Returns 405.
 */
export const POST = () => {
  return new NextResponse(
    JSON.stringify({
      ok: false,
      error: 'method_not_allowed',
      message: 'POST is not supported on /api/checkout/confirm.',
    }),
    {
      status: 405,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/json',
        'Allow': 'GET',
      },
    },
  );
};

function paymentStateToUiStatus(state: string): PaymentUiStatus {
  switch (state) {
    case 'none': return 'awaiting_payment';
    case 'awaiting_payment_method': return 'awaiting_payment_method';
    case 'requires_action': return 'requires_action';
    case 'requires_payment_method': return 'awaiting_payment_method';
    case 'processing': return 'processing';
    case 'succeeded': return 'paid';
    case 'failed': return 'failed';
    case 'canceled': return 'canceled';
    case 'expired': return 'expired';
    default: return 'awaiting_payment';
  }
}

async function getCheckoutStatus(
  draftId: string,
  userId: string,
  requestId: string | null,
  ip: string | null,
  route: string,
) {
  const supabase = createServiceClient();
  const now = new Date();

  // 1) Load the draft
  const { data: draft, error: draftErr } = await supabase
    .from('order_drafts')
    .select('id, customer_id, used, expires_at, deleted_at, created_at, payment_intent_id, payment_status, last_payment_event_at, last_payment_event_type')
    .eq('id', draftId)
    .maybeSingle();

  // 2) ANY failure case returns the SAME response (no enumeration)
  const notFoundResponse = () => buildResponse({
    ok: true,
    status: 'expired',
    payment_status: 'expired',
    payment_intent_id: null,
    order_id: null,
    request_id: requestId,
  });

  if (draftErr || !draft) {
    return notFoundResponse();
  }
  // SECURITY: cross-user access returns the same as not-found.
  if (draft.customer_id !== userId) {
    await logSecurityEvent({
      event_type: 'cross_user_status_poll',
      severity: 'critical',
      user_id: userId,
      draft_id: draftId,
      ip,
      request_id: requestId,
      route,
      reason: `User ${userId} polled status of draft owned by ${draft.customer_id}`,
    });
    return notFoundResponse();
  }
  // All other "not yours" cases also return the same not-found response
  if (draft.deleted_at) return notFoundResponse();
  if (new Date(draft.expires_at) < now) return notFoundResponse();

  // 3) If draft is burned, look for the order by payment_intent_id
  let order: CheckoutOrderSummary | null = null;
  if (draft.used || draft.payment_status === 'succeeded') {
    if (draft.payment_intent_id) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, payment_intent_id, status, payment_status, created_at, total')
        .eq('payment_intent_id', draft.payment_intent_id)
        .limit(1);
      order = (orders?.[0] as CheckoutOrderSummary | undefined) ?? null;
    }
    if (order) {
      // Order exists → terminal state
      return buildResponse({
        ok: true,
        status: 'order_created',
        payment_status: 'succeeded',
        payment_intent_id: draft.payment_intent_id,
        order_id: order.id,
        order: {
          id: order.id,
          status: order.status,
          payment_status: order.payment_status,
          total: order.total,
          created_at: order.created_at,
        },
        created_at: draft.created_at,
        expires_at: draft.expires_at,
        request_id: requestId,
      });
    }
    // Burned but no order found
    if (draft.payment_status === 'succeeded') {
      return buildResponse({
        ok: true,
        status: 'paid',
        payment_status: 'succeeded',
        payment_intent_id: draft.payment_intent_id,
        order_id: null,
        created_at: draft.created_at,
        expires_at: draft.expires_at,
        request_id: requestId,
      });
    }
  }

  // 4) Draft is valid and not burned (or burned but payment failed/canceled)
  if (draft.payment_intent_id) {
    const uiStatus = paymentStateToUiStatus(draft.payment_status || 'awaiting_payment_method');
    return buildResponse({
      ok: true,
      status: uiStatus,
      payment_status: draft.payment_status || 'awaiting_payment_method',
      payment_intent_id: draft.payment_intent_id,
      order_id: null,
      created_at: draft.created_at,
      expires_at: draft.expires_at,
      request_id: requestId,
    });
  }

  // 5) Default: no PaymentIntent yet
  return buildResponse({
    ok: true,
    status: 'awaiting_payment',
    payment_status: 'none',
    payment_intent_id: null,
    order_id: null,
    created_at: draft.created_at,
    expires_at: draft.expires_at,
    request_id: requestId,
  });
}
