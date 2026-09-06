/**
 * Refund Service
 * ──────────────
 * Phase 7G-D: server-side refund operations.
 *
 * Responsibilities:
 *   1. Authenticate + authorize the operator.
 *   2. Validate payment ownership.
 *   3. Load verified payment and order data.
 *   4. Acquire a per-order advisory lock to serialize concurrent refund ops.
 *   5. Calculate remaining refundable amount.
 *   6. Validate full or partial amount.
 *   7. Create a local payment_refunds record.
 *   8. Call Stripe with an idempotency key.
 *   9. Persist Stripe refund ID + status.
 *  10. Write immutable refund_audit_log entries.
 *  11. Return a safe response.
 *
 * Idempotency: idempotency_key is UNIQUE in the DB. A retry with the same
 * key returns the existing record (no duplicate Stripe call, no duplicate
 * local record).
 *
 * Stripe timeouts: on timeout AFTER the request was accepted, we DO NOT
 * create a new record. The caller is told to retry; on retry, we look up
 * the existing record by idempotency_key and return it.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isStripeLive, requirePaymentsAvailable, getLivemode } from '@/lib/services/payment-secrets';
import { redactForLog } from '@/lib/services/payment-security';
import { computeRefundMax, computeProposedRefund } from '@/lib/services/refund-calculation';
import {
  assertAllowedTransition,
  mapStripeRefundStatus,
  type RefundStatus,
} from '@/lib/services/refund-state-machine';
import { logger } from '@/lib/logging';
import { postRefundFinancialJournal } from '@/lib/finance/ledger';

export type RefundReason =
  | 'order_canceled'
  | 'item_unavailable'
  | 'incorrect_item'
  | 'missing_item'
  | 'quality_issue'
  | 'delivery_failure'
  | 'duplicate_charge'
  | 'customer_support_adjustment'
  | 'recovery_unmatched_payment'
  | 'other';

export const REFUND_REASONS: ReadonlyArray<RefundReason> = [
  'order_canceled',
  'item_unavailable',
  'incorrect_item',
  'missing_item',
  'quality_issue',
  'delivery_failure',
  'duplicate_charge',
  'customer_support_adjustment',
  'recovery_unmatched_payment',
  'other',
];

export const ALLOWED_REFUND_REASONS = REFUND_REASONS as ReadonlyArray<string>;

export function isAllowedRefundReason(s: string): s is RefundReason {
  return (ALLOWED_REFUND_REASONS as ReadonlyArray<string>).includes(s);
}

export class RefundServiceError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = 'RefundServiceError';
  }
}

export interface RefundActor {
  userId: string;
  role: string;
  /** Must include 'payment_support' for admin operations. */
  permissions?: string[];
  /** Per-request id for trace correlation. */
  requestId?: string;
}

export interface CreateRefundInput {
  orderId: string;
  mode: 'full' | 'partial';
  /** Required when mode='partial'. Must be in cents. */
  amountCents?: number;
  reason: RefundReason;
  internalNote?: string;
  /** Recovery case ID, if this refund is from the recovery queue. */
  recoveryCaseId?: string;
  /** Optional client-supplied key; server overrides with its own if absent. */
  clientIdempotencyKey?: string;
  /** Phase 7G-E: Chaos injection (test only; never set in production code paths). */
  chaos?: { stripe_timeout?: boolean; stripe_500?: boolean; stripe_500_retry?: boolean };
}

export interface CreateRefundResult {
  ok: boolean;
  refund: {
    id: string;
    stripe_refund_id: string | null;
    status: RefundStatus;
    requested_amount_cents: number;
    refunded_amount_cents: number;
    currency: string;
    order_id: string;
    idempotency_key: string;
  };
  /** True if this was a retry of an existing refund (idempotent). */
  idempotent: boolean;
}

// ─────────────────────────────────────────────────────────────
// 1. Authorization
// ─────────────────────────────────────────────────────────────

export function assertRefundAuthorized(actor: RefundActor): void {
  if (!actor.userId) {
    throw new RefundServiceError('unauthorized', 'Authentication required', 401);
  }
  const role = actor.role;
  if (role !== 'admin' && role !== 'super_admin' && role !== 'manager') {
    throw new RefundServiceError('forbidden', 'Admin role required to issue refunds', 403);
  }
  // Least-privilege: payment_support is required (in addition to admin).
  const hasSupport = (actor.permissions ?? []).includes('payment_support') || role === 'super_admin';
  if (!hasSupport) {
    throw new RefundServiceError('forbidden', 'payment_support permission required', 403);
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Audit log helper
// ─────────────────────────────────────────────────────────────

async function writeAudit(
  supabase: SupabaseClient,
  params: {
    refundId: string;
    stripeRefundId: string | null;
    orderId: string;
    paymentIntentId: string;
    actor: RefundActor;
    action: string;
    previousStatus: RefundStatus | null;
    newStatus: RefundStatus;
    amountCents: number;
    currency: string;
    reason: string | null;
    internalNote: string | null;
    idempotencyKey: string;
    stripeEventId: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('refund_audit_log').insert({
    refund_id: params.refundId,
    stripe_refund_id: params.stripeRefundId,
    order_id: params.orderId,
    payment_intent_id: params.paymentIntentId,
    actor_user_id: params.actor.userId,
    actor_role: params.actor.role,
    action: params.action,
    previous_status: params.previousStatus,
    new_status: params.newStatus,
    amount_cents: params.amountCents,
    currency: params.currency,
    reason: params.reason,
    internal_note: params.internalNote,
    request_id: params.actor.requestId ?? null,
    stripe_event_id: params.stripeEventId,
    idempotency_key: params.idempotencyKey,
    metadata: params.metadata ?? {},
  });
  if (error) {
    // Audit is append-only and we never silently drop. Surface to the caller.
    logger.error('refund_audit_log insert failed', { ...redactForLog(params), error: error.message });
    throw new RefundServiceError('audit_log_failed', `Audit log write failed: ${error.message}`, 500);
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Idempotency key derivation
// ─────────────────────────────────────────────────────────────

/**
 * Build a stable idempotency key for a refund request.
 * Format: refund:<order_id>:<mode>:<amount>:<reason>:<actor>:<nonce>
 *
 * The amount component is the requested amount in cents (the *requested*
 * amount, not the Stripe-side refunded amount which arrives asynchronously).
 * The nonce is included so two genuinely-distinct operations on the same
 * order produce different keys. The key is hashed (sha256) for compactness.
 */
export function buildRefundIdempotencyKey(input: {
  orderId: string;
  mode: 'full' | 'partial';
  amountCents: number;
  reason: RefundReason;
  actorUserId: string;
  clientKey?: string;
}): string {
  if (input.clientKey && /^[\w-]{8,128}$/.test(input.clientKey)) {
    // If a verified client key is supplied, use it directly. We do NOT
    // accept arbitrary user input — the regex above is strict.
    return `refund:${input.orderId}:${input.clientKey}`;
  }
  const payload = `${input.orderId}|${input.mode}|${input.amountCents}|${input.reason}|${input.actorUserId}|${randomUUID()}`;
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 32);
  return `refund:${input.orderId}:${hash}`;
}

// ─────────────────────────────────────────────────────────────
// 4. Lock acquisition
// ─────────────────────────────────────────────────────────────

async function acquireOrderLock(
  supabase: SupabaseClient,
  orderId: string,
  actor: RefundActor,
): Promise<{ ok: boolean; lockId?: string }> {
  // A short bounded wait turns normal overlap into serialization while still
  // failing quickly if a worker died and left a lock behind. The persisted
  // expiry remains the final crash-recovery guard.
  const retryDelaysMs = [0, 25, 50, 100, 200, 300, 400, 500, 500];
  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await supabase
      .from('refund_operation_locks')
      .delete()
      .lt('expires_at', new Date().toISOString());

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('refund_operation_locks')
      .insert({
        order_id: orderId,
        locked_by: actor.userId,
        expires_at: expiresAt,
      })
      .select('order_id')
      .maybeSingle();

    if (!error && data) {
      return { ok: true, lockId: data.order_id };
    }
  }

  return { ok: false };
}

async function releaseOrderLock(supabase: SupabaseClient, orderId: string): Promise<void> {
  await supabase.from('refund_operation_locks').delete().eq('order_id', orderId);
}

// ─────────────────────────────────────────────────────────────
// 5. Main createRefund entry point
// ─────────────────────────────────────────────────────────────

export async function createRefund(
  supabase: SupabaseClient,
  actor: RefundActor,
  input: CreateRefundInput,
): Promise<CreateRefundResult> {
  // 1) Authorization
  assertRefundAuthorized(actor);

  // 2) Reason validation
  if (!isAllowedRefundReason(input.reason)) {
    throw new RefundServiceError('invalid_reason', 'Invalid refund reason', 400);
  }

  // 3) Idempotency: check for an existing record matching the client key
  //    (or the order+reason+actor+amount combination, dedup'd at the DB).
  if (input.clientIdempotencyKey) {
    const existing = await findRefundByIdempotencyKey(supabase, input.clientIdempotencyKey);
    if (existing) {
      return { ok: true, refund: existing, idempotent: true };
    }
  }

  // 4) Calculate max
  const max = await computeRefundMax(supabase, input.orderId);
  if (!max.ok) {
    throw new RefundServiceError(max.errorCode ?? 'invalid_state', max.errorMessage ?? 'Cannot refund', 400);
  }

  // 5) Compute proposed amount
  const proposed = computeProposedRefund(input.mode, input.amountCents, max);
  if (!proposed.ok) {
    throw new RefundServiceError(proposed.code ?? 'invalid_amount', proposed.message ?? 'Invalid refund amount', 400);
  }
  let amountCents = proposed.cents!;

  // 6) Acquire per-order lock
  const lock = await acquireOrderLock(supabase, input.orderId, actor);
  if (!lock.ok) {
    throw new RefundServiceError('concurrent_refund', 'Another refund is in progress for this order', 409);
  }

  try {
    // The balance may have changed while this request was waiting for the
    // order lock. Recompute it inside the critical section so two concurrent
    // refunds can never spend the same refundable cents.
    const lockedMax = await computeRefundMax(supabase, input.orderId);
    if (!lockedMax.ok) {
      throw new RefundServiceError(
        lockedMax.errorCode ?? 'invalid_state',
        lockedMax.errorMessage ?? 'Cannot refund',
        400,
      );
    }
    const lockedProposal = computeProposedRefund(input.mode, input.amountCents, lockedMax);
    if (!lockedProposal.ok) {
      throw new RefundServiceError(
        lockedProposal.code ?? 'invalid_amount',
        lockedProposal.message ?? 'Invalid refund amount',
        400,
      );
    }
    amountCents = lockedProposal.cents!;

    // 7) Build idempotency key
    const idempotencyKey = buildRefundIdempotencyKey({
      orderId: input.orderId,
      mode: input.mode,
      amountCents,
      reason: input.reason,
      actorUserId: actor.userId,
      clientKey: input.clientIdempotencyKey,
    });

    // 8) Re-check idempotency under the lock
    const existingUnderLock = await findRefundByIdempotencyKey(supabase, idempotencyKey);
    if (existingUnderLock) {
      return { ok: true, refund: existingUnderLock, idempotent: true };
    }

    // 9) Verify the order's PaymentIntent binding to this customer
    //    The order's payment_intent_id is the one we just received from max lookup.
    //    We must verify: PI exists in payment_binding, customer_id matches, livemode matches.
    const orderRow = await supabase
      .from('orders')
      .select('payment_intent_id, customer_id, payment_intent_id')
      .eq('id', input.orderId)
      .maybeSingle();
    const order = orderRow.data as { payment_intent_id: string | null; customer_id: string } | null;
    if (!order?.payment_intent_id) {
      throw new RefundServiceError('no_payment_intent', 'Order has no PaymentIntent', 400);
    }
    const binding = await supabase
      .from('payment_binding')
      .select('payment_intent_id, customer_id, livemode, expected_amount_cents, currency')
      .eq('payment_intent_id', order.payment_intent_id)
      .maybeSingle();
    if (!binding.data) {
      // No binding — this is a critical security event (PI is external or forged)
      await supabase.from('payment_security_events').insert({
        event_type: 'refund_pi_no_binding',
        severity: 'critical',
        payment_intent_id: order.payment_intent_id,
        draft_id: null,
        user_id: order.customer_id,
        ip: null,
        request_id: actor.requestId ?? null,
        route: '/api/admin/orders/:orderId/refunds',
        reason: `Refund attempted against unbound PI ${order.payment_intent_id}`,
      });
      throw new RefundServiceError('binding_missing', 'PaymentIntent has no binding record (refused)', 400);
    }
    if (binding.data.customer_id !== order.customer_id) {
      throw new RefundServiceError('binding_customer_mismatch', 'PI is bound to a different customer', 400);
    }
    if (binding.data.livemode !== getLivemode()) {
      throw new RefundServiceError('binding_livemode_mismatch', 'PI livemode does not match environment', 400);
    }
    const paymentIntentId = order.payment_intent_id;

    // 10) Insert local payment_refunds record in 'requested' state
    const initialStatus: RefundStatus = 'requested';
    const { data: inserted, error: insErr } = await supabase
      .from('payment_refunds')
      .insert({
        stripe_refund_id: null,
        payment_intent_id: paymentIntentId,
        charge_id: null,
        order_id: input.orderId,
        customer_id: order.customer_id,
        requested_by: actor.userId,
        requested_amount_cents: amountCents,
        refunded_amount_cents: 0,
        currency: lockedMax.currency,
        reason: input.reason,
        internal_note: input.internalNote ?? null,
        status: initialStatus,
        failure_reason: null,
        idempotency_key: idempotencyKey,
        stripe_event_id: null,
        metadata: {
          recovery_case_id: input.recoveryCaseId ?? null,
          mode: input.mode,
          actor_role: actor.role,
        },
      })
      .select('id, status, requested_amount_cents, refunded_amount_cents, currency, order_id, idempotency_key, stripe_refund_id')
      .maybeSingle();

    if (insErr || !inserted) {
      // Most likely: idempotency_key UNIQUE conflict (concurrent retry won the race)
      if (insErr?.code === '23505' || /duplicate key/i.test(insErr?.message ?? '')) {
        const reRead = await findRefundByIdempotencyKey(supabase, idempotencyKey);
        if (reRead) {
          return { ok: true, refund: reRead, idempotent: true };
        }
      }
      logger.error('payment_refunds insert failed', { error: insErr?.message, orderId: input.orderId });
      throw new RefundServiceError('insert_failed', 'Failed to create refund record', 500);
    }

    // 11) Audit: created
    await writeAudit(supabase, {
      refundId: inserted.id,
      stripeRefundId: null,
      orderId: input.orderId,
      paymentIntentId,
      actor,
      action: 'created',
      previousStatus: null,
      newStatus: initialStatus,
      amountCents,
      currency: lockedMax.currency,
      reason: input.reason,
      internalNote: input.internalNote ?? null,
      idempotencyKey,
      stripeEventId: null,
      metadata: { mode: input.mode, recovery_case_id: input.recoveryCaseId ?? null },
    });

    // 12) Validate → Submitted
    await transitionRefund(supabase, {
      refundId: inserted.id,
      from: 'requested',
      to: 'validating',
      actor,
      stripeRefundId: null,
      orderId: input.orderId,
      paymentIntentId,
      amountCents,
      currency: max.currency,
      reason: input.reason,
      internalNote: input.internalNote ?? null,
      idempotencyKey,
      stripeEventId: null,
    });

    // 13) Call Stripe
    const stripeResult = await callStripeRefund({
      paymentIntentId,
      amountCents,
      orderId: input.orderId,
      refundId: inserted.id,
      reason: input.reason,
      idempotencyKey,
      chaos: input.chaos,
    });

    if (!stripeResult.ok) {
      // Mark as failed
      await transitionRefund(supabase, {
        refundId: inserted.id,
        from: 'validating',
        to: 'failed',
        actor,
        stripeRefundId: null,
        orderId: input.orderId,
        paymentIntentId: paymentIntentId,
        amountCents,
        currency: max.currency,
        reason: input.reason,
        internalNote: input.internalNote ?? null,
        idempotencyKey,
        stripeEventId: null,
        metadata: { error_code: stripeResult.code, error_message: stripeResult.message, livemode: isStripeLive() },
        failureReason: stripeResult.message ?? stripeResult.code,
      });
      // Update the refund record with failure_reason
      await supabase
        .from('payment_refunds')
        .update({
          failure_reason: stripeResult.message ?? stripeResult.code,
          completed_at: new Date().toISOString(),
        })
        .eq('id', inserted.id);

      throw new RefundServiceError(stripeResult.code ?? 'stripe_failed', stripeResult.message ?? 'Stripe refund failed', 502);
    }

    // 14) Persist Stripe refund ID, mark as submitted
    const submittedAt = new Date().toISOString();
    await supabase
      .from('payment_refunds')
      .update({
        stripe_refund_id: stripeResult.stripeRefundId,
        status: 'submitted',
        refunded_amount_cents: amountCents,
        updated_at: submittedAt,
      })
      .eq('id', inserted.id);

    await writeAudit(supabase, {
      refundId: inserted.id,
      stripeRefundId: stripeResult.stripeRefundId,
      orderId: input.orderId,
      paymentIntentId: paymentIntentId,
      actor,
      action: 'submitted',
      previousStatus: 'validating',
      newStatus: 'submitted',
      amountCents,
      currency: max.currency,
      reason: input.reason,
      internalNote: input.internalNote ?? null,
      idempotencyKey,
      stripeEventId: null,
      metadata: { livemode: isStripeLive() },
    });

    // 15) If the Stripe response is a terminal status, transition further
    //     (most production refunds go through 'pending' first and then a webhook
    //      drives them to 'succeeded'. But for synchronous test/mock, we may
    //     already have the final state in the response.)
    const stripeStatus = mapStripeRefundStatus(stripeResult.stripeRefundStatus);
    if (stripeStatus === 'succeeded') {
      await transitionRefund(supabase, {
        refundId: inserted.id,
        from: 'submitted',
        to: 'succeeded',
        actor,
        stripeRefundId: stripeResult.stripeRefundId,
        orderId: input.orderId,
        paymentIntentId: paymentIntentId,
        amountCents,
        currency: max.currency,
        reason: input.reason,
        internalNote: input.internalNote ?? null,
        idempotencyKey,
        stripeEventId: null,
      });
      await supabase
        .from('payment_refunds')
        .update({ completed_at: submittedAt })
        .eq('id', inserted.id);
      await postRefundFinancialJournal({
        id: inserted.id,
        order_id: input.orderId,
        refunded_amount_cents: amountCents,
        completed_at: submittedAt,
      });
    } else if (stripeStatus === 'failed') {
      await transitionRefund(supabase, {
        refundId: inserted.id,
        from: 'submitted',
        to: 'failed',
        actor,
        stripeRefundId: stripeResult.stripeRefundId,
        orderId: input.orderId,
        paymentIntentId: paymentIntentId,
        amountCents,
        currency: max.currency,
        reason: input.reason,
        internalNote: input.internalNote ?? null,
        idempotencyKey,
        stripeEventId: null,
        failureReason: stripeResult.message ?? 'Stripe reported failed',
      });
      await supabase
        .from('payment_refunds')
        .update({
          failure_reason: stripeResult.message ?? 'Stripe reported failed',
          completed_at: submittedAt,
        })
        .eq('id', inserted.id);
    } else if (stripeStatus === 'pending') {
      await transitionRefund(supabase, {
        refundId: inserted.id,
        from: 'submitted',
        to: 'pending',
        actor,
        stripeRefundId: stripeResult.stripeRefundId,
        orderId: input.orderId,
        paymentIntentId: paymentIntentId,
        amountCents,
        currency: max.currency,
        reason: input.reason,
        internalNote: input.internalNote ?? null,
        idempotencyKey,
        stripeEventId: null,
      });
    }
    // 'requires_review' is treated as a no-op here; admin will see it in the queue.

    return {
      ok: true,
      refund: {
        id: inserted.id,
        stripe_refund_id: stripeResult.stripeRefundId,
        status: stripeStatus === 'pending' ? 'pending' : (stripeStatus === 'failed' ? 'failed' : (stripeStatus === 'succeeded' ? 'succeeded' : 'submitted')),
        requested_amount_cents: amountCents,
        refunded_amount_cents: stripeStatus === 'succeeded' ? amountCents : 0,
        currency: max.currency,
        order_id: input.orderId,
        idempotency_key: idempotencyKey,
      },
      idempotent: false,
    };
  } finally {
    await releaseOrderLock(supabase, input.orderId);
  }
}

// ─────────────────────────────────────────────────────────────
// 6. Stripe call (mock-aware)
// ─────────────────────────────────────────────────────────────

interface StripeRefundCallResult {
  ok: boolean;
  stripeRefundId: string | null;
  stripeRefundStatus: string;
  code?: string;
  message?: string;
}

async function callStripeRefund(params: {
  paymentIntentId: string;
  amountCents: number;
  orderId: string;
  refundId: string;
  reason: RefundReason;
  idempotencyKey: string;
  chaos?: { stripe_timeout?: boolean; stripe_500?: boolean; stripe_500_retry?: boolean };
}): Promise<StripeRefundCallResult> {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowMock = process.env.ALLOW_MOCK_PAYMENTS === 'true';

  // Production fails-closed if Stripe is not configured.
  if (isProduction) {
    try {
      requirePaymentsAvailable();
    } catch (e: unknown) {
      return { ok: false, stripeRefundId: null, stripeRefundStatus: 'failed', code: 'payments_unavailable', message: (e as Error).message };
    }
  }

  const { getStripe } = await import('@/lib/stripe/client');
  const stripe = getStripe();

  // Phase 7G-E: Chaos injection for Stripe failure modes (test only)
  // Controlled via the optional `chaos` parameter passed by the route.
  // In production, the route never passes `chaos`; this is a test-only code path.
  if (params.chaos?.stripe_timeout) {
    // Simulate Stripe timeout: hang the promise (test only)
    return new Promise(() => { /* never resolve */ }) as unknown as StripeRefundCallResult;
  }
  // Note: chaos.stripe_500 is no longer short-circuited here — it now goes through
  // the retry wrapper below, which exercises the full retry → exhaust → fail path
  // for production infrastructure testing.

  // Dev/mock mode: simulate Stripe success so the test suite can exercise the
  // full refund flow (including state transitions, audit log, and order
  // payment_status recompute). In production we always use the real Stripe.
  // (skipped when chaos is set so the retry wrapper below handles the failure)
  if (!stripe && allowMock && !isProduction && !params.chaos) {
    const fakeStripeRefundId = `re_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logger.info('refund.stripe.mock_success', {
      refundId: params.refundId,
      orderId: params.orderId,
      amount: params.amountCents,
      stripe_refund_id: fakeStripeRefundId,
    });
    return {
      ok: true,
      stripeRefundId: fakeStripeRefundId,
      stripeRefundStatus: 'succeeded',
    };
  }

  if (!stripe && !params.chaos) {
    return { ok: false, stripeRefundId: null, stripeRefundStatus: 'failed', code: 'stripe_not_configured', message: 'Stripe client not configured' };
  }

  // Phase 7G-F: Use the retry wrapper for resilience to 429/5xx/timeout.
  // The Idempotency-Key is preserved across retries so Stripe handles them correctly.
  const { stripeRetry } = await import('@/lib/infrastructure/stripe-retry');
  const result = await stripeRetry(
    async ({ signal, requestId, attempt }) => {
      // Chaos: simulate Stripe 500 error (test only) — 7G-E mode: always fail.
      // 7G-F mode (chaos.stripe_500_retry): fails on first attempt, succeeds on retry.
      if (params.chaos?.stripe_500_retry) {
        if (attempt === 0) {
          const err = new Error('simulated Stripe 500');
          (err as { statusCode?: number }).statusCode = 500;
          (err as { code?: string }).code = 'chaos_500';
          throw err;
        }
        return {
          id: `re_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          status: 'succeeded',
        } as unknown as Awaited<ReturnType<NonNullable<typeof stripe>['refunds']['create']>>;
      }
      if (params.chaos?.stripe_500) {
        // Always-fail chaos (for 7G-E "refund marked failed" test)
        const err = new Error('simulated Stripe 500');
        (err as { statusCode?: number }).statusCode = 500;
        (err as { code?: string }).code = 'chaos_500';
        throw err;
      }
      // The Stripe SDK doesn't support AbortSignal directly; we wrap the call
      // in a Promise.race with the abort signal for timeout handling.
      if (!stripe) {
        const err = new Error('Stripe client not configured');
        (err as { statusCode?: number }).statusCode = 500;
        throw err;
      }
      const abortPromise = new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new Error('aborted'));
          return;
        }
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      return Promise.race([
        stripe.refunds.create(
          {
            payment_intent: params.paymentIntentId,
            amount: params.amountCents,
            reason: 'requested_by_customer',
            metadata: {
              order_id: params.orderId,
              refund_id: params.refundId,
              reason: params.reason,
              request_id: requestId,
              attempt: String(attempt),
            },
          },
          { idempotencyKey: params.idempotencyKey },
        ),
        abortPromise,
      ]);
    },
    {
      operation: 'refunds.create',
      requestId: params.refundId,
      recoveryState: 'refund_creation',
      maxRetries: params.chaos?.stripe_500_retry ? 1 : 4,
      baseDelayMs: params.chaos?.stripe_500_retry ? 50 : undefined,
    },
  );

  if (result.ok) {
    const refund = result.value as { id: string; status?: string };
    return {
      ok: true,
      stripeRefundId: refund.id,
      stripeRefundStatus: refund.status ?? 'pending',
    };
  }

  return {
    ok: false,
    stripeRefundId: null,
    stripeRefundStatus: 'failed',
    code: result.code,
    message: `${result.message} (retried ${result.retried} times)`,
  };
}

// ─────────────────────────────────────────────────────────────
// 7. Lookup helpers
// ─────────────────────────────────────────────────────────────

export async function findRefundByIdempotencyKey(
  supabase: SupabaseClient,
  key: string,
): Promise<CreateRefundResult['refund'] | null> {
  const { data } = await supabase
    .from('payment_refunds')
    .select('id, stripe_refund_id, status, requested_amount_cents, refunded_amount_cents, currency, order_id, idempotency_key')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    stripe_refund_id: data.stripe_refund_id ?? null,
    status: (data.status as RefundStatus) ?? 'requested',
    requested_amount_cents: Number(data.requested_amount_cents),
    refunded_amount_cents: Number(data.refunded_amount_cents ?? 0),
    currency: String(data.currency),
    order_id: String(data.order_id),
    idempotency_key: String(data.idempotency_key),
  };
}

export async function findRefundByStripeId(
  supabase: SupabaseClient,
  stripeRefundId: string,
): Promise<CreateRefundResult['refund'] | null> {
  const { data } = await supabase
    .from('payment_refunds')
    .select('id, stripe_refund_id, status, requested_amount_cents, refunded_amount_cents, currency, order_id, idempotency_key')
    .eq('stripe_refund_id', stripeRefundId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    stripe_refund_id: data.stripe_refund_id ?? null,
    status: (data.status as RefundStatus) ?? 'requested',
    requested_amount_cents: Number(data.requested_amount_cents),
    refunded_amount_cents: Number(data.refunded_amount_cents ?? 0),
    currency: String(data.currency),
    order_id: String(data.order_id),
    idempotency_key: String(data.idempotency_key),
  };
}

// ─────────────────────────────────────────────────────────────
// 8. State machine transition helper
// ─────────────────────────────────────────────────────────────

async function transitionRefund(
  supabase: SupabaseClient,
  params: {
    refundId: string;
    from: RefundStatus;
    to: RefundStatus;
    actor: RefundActor;
    stripeRefundId: string | null;
    orderId: string;
    paymentIntentId: string;
    amountCents: number;
    currency: string;
    reason: string | null;
    internalNote: string | null;
    idempotencyKey: string;
    stripeEventId: string | null;
    metadata?: Record<string, unknown>;
    failureReason?: string;
  },
): Promise<void> {
  assertAllowedTransition(params.from, params.to);

  // CAS update to prevent concurrent transitions
  const updatePayload: Record<string, unknown> = {
    status: params.to,
    updated_at: new Date().toISOString(),
  };
  if (params.stripeRefundId) updatePayload.stripe_refund_id = params.stripeRefundId;
  if (params.failureReason) updatePayload.failure_reason = params.failureReason;

  const { data, error } = await supabase
    .from('payment_refunds')
    .update(updatePayload)
    .eq('id', params.refundId)
    .eq('status', params.from)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new RefundServiceError('transition_failed', `Refund state transition failed: ${error.message}`, 500);
  }
  if (!data) {
    // Either: refund doesn't exist, or someone else already changed the state.
    // Re-read to find out.
    const re = await supabase
      .from('payment_refunds')
      .select('id, status')
      .eq('id', params.refundId)
      .maybeSingle();
    if (!re) {
      throw new RefundServiceError('refund_not_found', 'Refund record not found', 404);
    }
    throw new RefundServiceError('concurrent_transition', `Refund already in state '${re.status}', expected '${params.from}'`, 409);
  }

  await writeAudit(supabase, {
    refundId: params.refundId,
    stripeRefundId: params.stripeRefundId,
    orderId: params.orderId,
    paymentIntentId: params.paymentIntentId,
    actor: params.actor,
    action: actionForTransition(params.to),
    previousStatus: params.from,
    newStatus: params.to,
    amountCents: params.amountCents,
    currency: params.currency,
    reason: params.reason,
    internalNote: params.internalNote,
    idempotencyKey: params.idempotencyKey,
    stripeEventId: params.stripeEventId,
    metadata: params.metadata ?? {},
  });
}

function actionForTransition(to: RefundStatus): string {
  switch (to) {
    case 'validating': return 'validating';
    case 'submitted': return 'submitted';
    case 'pending': return 'pending_update';
    case 'succeeded': return 'succeeded';
    case 'failed': return 'failed';
    case 'canceled': return 'canceled';
    case 'requires_review': return 'requires_review';
    default: return to;
  }
}

// ─────────────────────────────────────────────────────────────
// 9. Webhook-side state update
// ─────────────────────────────────────────────────────────────

export async function applyStripeRefundWebhook(
  supabase: SupabaseClient,
  stripeRefundId: string,
  stripeEventId: string,
  stripeEventType: string,
  newStatus: RefundStatus,
  refundedAmountCents: number,
  paymentIntentId: string,
  orderId: string,
  failureReason: string | null,
): Promise<{ ok: boolean; refund?: CreateRefundResult['refund']; code?: string; message?: string }> {
  // Find the local refund by stripe_refund_id
  const local = await findRefundByStripeId(supabase, stripeRefundId);
  if (!local) {
    // No local record — this is an EXTERNAL Stripe refund (not from us).
    // Per spec, we acknowledge it but do not act on it. Audit and return ok.
    await supabase.from('refund_audit_log').insert({
      refund_id: '00000000-0000-0000-0000-000000000000',
      stripe_refund_id: stripeRefundId,
      order_id: orderId,
      payment_intent_id: paymentIntentId,
      actor_user_id: null,
      actor_role: 'stripe_webhook',
      action: 'webhook_sync',
      previous_status: null,
      new_status: newStatus,
      amount_cents: refundedAmountCents,
      currency: 'EUR',
      reason: null,
      internal_note: 'External Stripe refund not linked to BlinkGo',
      request_id: null,
      stripe_event_id: stripeEventId,
      idempotency_key: null,
      metadata: { event_type: stripeEventType, external: true },
    });
    return { ok: true, code: 'external_refund_acknowledged', message: 'External Stripe refund acknowledged (no local record)' };
  }

  // Validate state transition
  if (!isAllowedTransitionForWebhook(local.status, newStatus)) {
    return { ok: false, code: 'invalid_transition', message: `Webhook transition ${local.status} → ${newStatus} not allowed` };
  }

  // CAS update
  const { data, error } = await supabase
    .from('payment_refunds')
    .update({
      status: newStatus,
      refunded_amount_cents: newStatus === 'succeeded' ? refundedAmountCents : local.refunded_amount_cents,
      stripe_event_id: stripeEventId,
      completed_at: newStatus === 'succeeded' || newStatus === 'failed' || newStatus === 'canceled' ? new Date().toISOString() : null,
      failure_reason: newStatus === 'failed' ? (failureReason ?? 'unknown') : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', local.id)
    .eq('status', local.status)
    .select('id, stripe_refund_id, status, requested_amount_cents, refunded_amount_cents, currency, order_id, idempotency_key')
    .maybeSingle();

  if (error) {
    return { ok: false, code: 'update_failed', message: error.message };
  }
  if (!data) {
    return { ok: false, code: 'concurrent_transition', message: 'Refund state changed before webhook applied' };
  }

  await supabase.from('refund_audit_log').insert({
    refund_id: local.id,
    stripe_refund_id: stripeRefundId,
    order_id: orderId,
    payment_intent_id: paymentIntentId,
    actor_user_id: null,
    actor_role: 'stripe_webhook',
    action: 'webhook_sync',
    previous_status: local.status,
    new_status: newStatus,
    amount_cents: refundedAmountCents,
    currency: local.currency,
    reason: null,
    internal_note: null,
    request_id: null,
    stripe_event_id: stripeEventId,
    idempotency_key: local.idempotency_key,
    metadata: { event_type: stripeEventType },
  });

  if (newStatus === 'succeeded') {
    await postRefundFinancialJournal({
      id: data.id,
      order_id: String(data.order_id),
      refunded_amount_cents: Number(data.refunded_amount_cents ?? refundedAmountCents),
      completed_at: new Date().toISOString(),
    });
  }

  return {
    ok: true,
    refund: {
      id: data.id,
      stripe_refund_id: data.stripe_refund_id ?? null,
      status: (data.status as RefundStatus) ?? newStatus,
      requested_amount_cents: Number(data.requested_amount_cents),
      refunded_amount_cents: Number(data.refunded_amount_cents ?? 0),
      currency: String(data.currency),
      order_id: String(data.order_id),
      idempotency_key: String(data.idempotency_key),
    },
  };
}

function isAllowedTransitionForWebhook(from: RefundStatus, to: RefundStatus): boolean {
  // Stripe webhooks may drive the state forward but cannot go backwards.
  // Allowed forward transitions:
  //   requested → validating, submitted, pending, succeeded, failed, canceled, requires_review
  //   validating → submitted, pending, succeeded, failed, canceled, requires_review
  //   submitted → pending, succeeded, failed, requires_review
  //   pending → succeeded, failed, requires_review
  //   requires_review → submitted, succeeded, failed, canceled
  //   succeeded/failed/canceled → no transitions (terminal)
  // We reuse the same state machine but a webhook is allowed to apply the same
  // transition as the application would.
  try {
    assertAllowedTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 10. Recovery-queue integration
// ─────────────────────────────────────────────────────────────

/**
 * Issue a refund from the recovery queue. Same logic as createRefund but
 * the actor carries the recovery_case_id in metadata and the reason is
 * 'recovery_unmatched_payment'.
 */
export async function createRecoveryRefund(
  supabase: SupabaseClient,
  actor: RefundActor,
  input: { orderId: string; amountCents?: number; recoveryCaseId: string; internalNote?: string },
): Promise<CreateRefundResult> {
  return createRefund(supabase, actor, {
    orderId: input.orderId,
    mode: input.amountCents === undefined ? 'full' : 'partial',
    amountCents: input.amountCents,
    reason: 'recovery_unmatched_payment',
    internalNote: input.internalNote ?? `Linked to recovery case ${input.recoveryCaseId}`,
    recoveryCaseId: input.recoveryCaseId,
  });
}
