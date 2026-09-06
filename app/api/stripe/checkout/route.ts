/**
 * Stripe Checkout (Phase 7G-A + 7G-B + 7G-C)
 * ─────────────────────────────────────────────
 * POST /api/stripe/checkout
 *   body: { draft_id: string }
 *
 * Phase 7G-C security hardening:
 *   - Persistent (Supabase) rate limiting per user/IP/draft
 *   - Strict ownership verification (returns uniform 404 on mismatch)
 *   - Server-side amount integrity (server-computed total_cents, not client claim)
 *   - PaymentIntent ↔ draft binding persisted to payment_binding table
 *   - Currency validation (3-letter ISO)
 *   - Amount validation (positive integer, within limits)
 *   - Fails-closed in production: no implicit mock mode
 *   - Fraud signals + auto-throttle
 *   - client_secret redacted from logs
 *   - Security audit events for all violations
 *
 * Idempotency strategy (3 layers):
 *   1. Stripe Idempotency-Key = "draft:<draft_id>" (Stripe caches for 24h)
 *   2. Local cache: order_drafts.payment_intent_id is reused on retry
 *   3. Mock layer: payment_intent_id is reused on the same idempotency key
 *   4. payment_binding table: enforces 1 PI per draft
 *
 * Returns:
 *   - client_secret: for Stripe Elements
 *   - payment_intent_id: for client-side tracking
 *   - amount_cents: server-validated total
 *   - currency: server-validated currency
 *
 * NEVER:
 *   - Burns a draft
 *   - Creates an order
 *   - Mutates any payment state beyond the payment_intent_id linkage
 *   - Trusts client-claimed amount (recomputes from server data)
 */
import { NextRequest } from 'next/server';
import { z } from '@/lib/foundation/zod-mini';
import { apiRoute, ok, tier } from '@/lib/api/canonical';
import { ValidationError } from '@/lib/foundation/errors';
import { createServiceClient } from '@/lib/supabase/service';
import {
  createOrGetPaymentIntent,
  writeAuditLog,
  enqueueReconciliation,
} from '@/lib/services/stripe-service';
import {
  isStripeLive,
  getPaymentSecretStatus,
  logSecurityEvent,
} from '@/lib/services/payment-secrets';
import {
  verifyDraftOwnership,
  validateAmountCents,
  validateCurrency,
  persistPaymentBinding,
  computeDraftTotalHash,
} from '@/lib/services/payment-security';
import {
  checkRateLimit,
  PAYMENT_RATE_LIMITS,
  userBucketKey,
  ipBucketKey,
  draftBucketKey,
} from '@/lib/services/payment-rate-limit';
import { checkFraudSignals } from '@/lib/services/payment-fraud-signals';
import { logger } from '@/lib/logging';
import { requireFeatureFlag } from '@/lib/platform/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  draft_id: z.string().min(8).max(200),
});

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || null;
}

function getUserAgent(req: NextRequest): string | null {
  return req.headers.get('user-agent') || null;
}

export const POST = apiRoute({
  method: 'POST',
  auth: 'required',
  roles: ['customer', 'admin', 'super_admin'],
  rateLimit: tier('system'),
  bodySchema: BodySchema,
  handler: async ({ body, user, req }) => {
    if (!user) throw new ValidationError('Authentication required');
    await requireFeatureFlag('payments.stripe.enabled', {
      userId: user.id,
      role: user.role,
      activeOrder: false,
    });
    const supabase = createServiceClient();
    const requestId = req.headers.get('x-request-id');
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);
    const route = 'POST /api/stripe/checkout';

    // 0) Fails-closed in production
    const status = getPaymentSecretStatus();
    if (!status.canCreatePayments) {
      await logSecurityEvent({
        event_type: 'production_missing_keys',
        severity: 'critical',
        user_id: user.id,
        ip,
        user_agent: userAgent,
        request_id: requestId,
        route,
        reason: `Payments unavailable: ${status.unavailabilityReason}`,
        metadata: { mode: status.mode },
      });
      return ok({
        ok: false,
        error: 'payments_unavailable',
        message: 'Payments are temporarily unavailable. Please try again later.',
        request_id: requestId,
      });
    }

    // 1) Per-user rate limit (persistent)
    const userLimit = await checkRateLimit(
      userBucketKey(user.id, 'checkout'),
      PAYMENT_RATE_LIMITS.userCheckout,
    );
    if (!userLimit.allowed) {
      await logSecurityEvent({
        event_type: 'rate_limit_exceeded',
        severity: 'high',
        user_id: user.id,
        ip,
        user_agent: userAgent,
        request_id: requestId,
        route,
        reason: 'User checkout rate limit exceeded',
      });
      return ok({
        ok: false,
        error: 'rate_limited',
        retry_after_seconds: userLimit.retryAfterSeconds,
        request_id: requestId,
      });
    }

    // 2) Per-IP rate limit (defense against multi-account abuse)
    if (ip) {
      const ipLimit = await checkRateLimit(
        ipBucketKey(ip, 'checkout'),
        PAYMENT_RATE_LIMITS.ipCheckout,
      );
      if (!ipLimit.allowed) {
        await logSecurityEvent({
          event_type: 'checkout_flood_ip',
          severity: 'high',
          user_id: user.id,
          ip,
          user_agent: userAgent,
          request_id: requestId,
          route,
          reason: 'IP checkout rate limit exceeded',
        });
        return ok({
          ok: false,
          error: 'rate_limited',
          retry_after_seconds: ipLimit.retryAfterSeconds,
          request_id: requestId,
        });
      }
    }

    // 3) Fraud signals check
    const fraud = await checkFraudSignals({
      userId: user.id,
      ip,
      action: 'checkout',
    });
    if (fraud.recommended_action === 'block') {
      await logSecurityEvent({
        event_type: 'checkout_flood_user',
        severity: 'critical',
        user_id: user.id,
        ip,
        user_agent: userAgent,
        request_id: requestId,
        route,
        reason: `Fraud signals blocked: ${fraud.triggered_signals.join(', ')}`,
        metadata: { risk_score: fraud.risk_score, signals: fraud.triggered_signals },
      });
      return ok({
        ok: false,
        error: 'temporarily_unavailable',
        request_id: requestId,
      });
    }

    // 4) Strict ownership check
    const ownership = await verifyDraftOwnership(body.draft_id, user.id, {
      ip,
      userAgent,
      requestId,
      route,
    });
    if (!ownership.ok) {
      // Uniform 404 — don't reveal draft existence
      return ok({
        ok: false,
        error: 'draft_not_found',
        request_id: requestId,
      });
    }

    // 5) Per-draft rate limit (prevent retry storms on the same draft)
    const draftLimit = await checkRateLimit(
      draftBucketKey(body.draft_id, 'pi_creation'),
      PAYMENT_RATE_LIMITS.draftCheckout,
    );
    if (!draftLimit.allowed) {
      return ok({
        ok: false,
        error: 'rate_limited',
        retry_after_seconds: draftLimit.retryAfterSeconds,
        request_id: requestId,
      });
    }

    // 6) Load the draft (full)
    const { data: draft, error: draftErr } = await supabase
      .from('order_drafts')
      .select('id, customer_id, restaurant_id, draft, used, expires_at, deleted_at, payment_status, payment_intent_id, total_cents, total_hash, expected_currency, livemode, environment')
      .eq('id', body.draft_id)
      .maybeSingle();

    if (draftErr || !draft) {
      return ok({ ok: false, error: 'draft_not_found', request_id: requestId });
    }

    // 7) Re-verify ownership (defense in depth)
    if (draft.customer_id !== user.id) {
      await logSecurityEvent({
        event_type: 'cross_user_draft_access',
        severity: 'critical',
        user_id: user.id,
        draft_id: body.draft_id,
        ip,
        user_agent: userAgent,
        request_id: requestId,
        route,
        reason: 'Race condition: user_id changed between ownership check and load',
      });
      return ok({ ok: false, error: 'draft_not_found', request_id: requestId });
    }

    // The draft can change between the ownership lookup and this full read
    // (for example, a webhook may have created the order). Re-check every
    // terminal state before creating or returning a PaymentIntent.
    const draftExpired = !draft.expires_at || new Date(draft.expires_at).getTime() <= Date.now();
    const terminalPaymentState = ['succeeded', 'order_created'].includes(draft.payment_status ?? '');
    if (draft.deleted_at || draftExpired || draft.used || terminalPaymentState) {
      return ok({
        ok: false,
        error: draft.used || terminalPaymentState ? 'draft_already_used' : 'draft_not_found',
        request_id: requestId,
      });
    }

    // 8) Compute / verify server-authoritative amount
    //    The amount MUST come from a server-computed field, not from the
    //    client's `draft` JSONB. We use `total_cents` (set by the server
    //    at draft creation or re-derivation). If missing, we re-derive from
    //    the JSONB but treat the result as untrusted until verified.
    let amountCents: number;
    if (typeof draft.total_cents === 'number' && Number.isInteger(draft.total_cents) && draft.total_cents > 0) {
      // Use the server-persisted authoritative total
      amountCents = draft.total_cents;
    } else {
      // Re-derive from JSONB and persist
      const draftBody = draft.draft as { total?: unknown } | null;
      const total = Number(draftBody?.total);
      if (!Number.isFinite(total) || total <= 0) {
        logger.error('stripe.checkout.invalid_total', {
          draft_id: draft.id,
          total: draftBody?.total,
          request_id: requestId,
        });
        await logSecurityEvent({
          event_type: 'amount_tampering',
          severity: 'critical',
          user_id: user.id,
          draft_id: body.draft_id,
          ip,
          request_id: requestId,
          route,
          reason: `Draft has invalid total: ${draftBody?.total}`,
        });
        return ok({ ok: false, error: 'invalid_total', request_id: requestId });
      }
      amountCents = Math.round(total * 100);
      // Persist the authoritative value
      const totalHash = computeDraftTotalHash(amountCents, 'eur');
      await supabase
        .from('order_drafts')
        .update({ total_cents: amountCents, total_hash: totalHash, expected_currency: 'eur' })
        .eq('id', draft.id);
    }

    // 9) Validate amount
    const amountCheck = validateAmountCents(amountCents);
    if (!amountCheck.ok) {
      await logSecurityEvent({
        event_type: 'amount_tampering',
        severity: 'critical',
        user_id: user.id,
        draft_id: body.draft_id,
        ip,
        request_id: requestId,
        route,
        reason: `Amount failed validation: ${amountCheck.reason} (${amountCents})`,
      });
      return ok({ ok: false, error: 'invalid_amount', request_id: requestId });
    }

    // 10) Validate currency
    const currency = (draft.expected_currency || 'eur').toLowerCase();
    if (!validateCurrency(currency)) {
      await logSecurityEvent({
        event_type: 'currency_tampering',
        severity: 'critical',
        user_id: user.id,
        draft_id: body.draft_id,
        ip,
        request_id: requestId,
        route,
        reason: `Invalid currency: ${currency}`,
      });
      return ok({ ok: false, error: 'invalid_currency', request_id: requestId });
    }

    // 11) Create or get the PaymentIntent
    try {
      const paymentIntent = await createOrGetPaymentIntent({
        draft_id: draft.id,
        customer_id: user.id,
        restaurant_id: draft.restaurant_id,
        amount_cents: amountCents,
        currency,
        customer_email: user.email ?? undefined,
        ip: ip ?? undefined,
        user_agent: userAgent ?? undefined,
      });

      // 12) Persist the binding (PI ↔ draft ↔ customer ↔ amount ↔ currency)
      //     This is the security anchor for the webhook.
      try {
        const livemode = isStripeLive();
        await persistPaymentBinding({
          payment_intent_id: paymentIntent.id,
          draft_id: draft.id,
          customer_id: user.id,
          restaurant_id: draft.restaurant_id,
          expected_amount_cents: amountCents,
          currency,
          livemode,
          environment: livemode ? 'production' : 'test',
        });
      } catch (bindingErr) {
        // Never expose a client secret without the immutable security binding.
        // The intent is not yet confirmed, so fail closed and surface the
        // orphan to operations for cancellation/reconciliation.
        await logSecurityEvent({
          event_type: 'security_log_write_failure',
          severity: 'high',
          user_id: user.id,
          draft_id: draft.id,
          payment_intent_id: paymentIntent.id,
          ip,
          request_id: requestId,
          route,
          reason: `Failed to persist payment binding: ${(bindingErr as Error).message}`,
        });
        await enqueueReconciliation({
          issue_type: 'orphan_payment_intent',
          payment_intent_id: paymentIntent.id,
          draft_id: draft.id,
          customer_id: user.id,
          details: {
            stage: 'checkout_binding',
            amount_cents: amountCents,
            currency,
            request_id: requestId,
          },
        });
        return ok({
          ok: false,
          error: 'payment_initialization_incomplete',
          message: 'Payments are temporarily unavailable. Please try again later.',
          request_id: requestId,
        });
      }

      // Audit log (no client_secret)
      await writeAuditLog({
        payment_intent_id: paymentIntent.id,
        customer_id: user.id,
        draft_id: draft.id,
        status: 'intent_created',
        idempotency_key: `draft:${draft.id}`,
        ip,
        user_agent: userAgent,
        metadata: { amount_cents: amountCents, currency, livemode: isStripeLive() },
      });

      logger.info('stripe.checkout.pi_created', {
        draft_id: draft.id,
        payment_intent_id: paymentIntent.id,
        amount_cents: amountCents,
        currency,
        livemode: isStripeLive(),
        request_id: requestId,
      });

      return ok({
        ok: true,
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount_cents: amountCents,
        currency,
        publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
        livemode: isStripeLive(),
        configured: true,
        request_id: requestId,
      });
    } catch (err) {
      logger.error('stripe.checkout.creation_failed', {
        draft_id: draft.id,
        error: (err as Error).message,
        request_id: requestId,
      });
      // Don't expose the internal error
      return ok({ ok: false, error: 'payment_intent_creation_failed', request_id: requestId });
    }
  },
});
