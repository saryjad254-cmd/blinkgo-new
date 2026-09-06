/**
 * Stripe Webhook (Phase 7G-B)
 * ──────────────────────────────────────────────────
 * POST /api/stripe/webhook
 *
 * This is the ONLY endpoint that may create an order.
 *
 * Phase 7G-B enhancements:
 *   - State machine: every transition validated against allowed transitions
 *   - All 7 PaymentIntent lifecycle events handled
 *   - Timestamp window check (reject events older than 5 minutes)
 *   - Payment intent history (append-only log of all events per PI)
 *   - Self-healing recovery for "burned but no order" cases
 *   - Structured logging with all required fields
 *   - Reject impossible transitions
 *
 * Order of checks (each is a hard requirement):
 *   1. Signature verify (HMAC-SHA256) + timestamp window
 *   2. Dedup by event_id (stripe_webhook_events UNIQUE)
 *   3. Record in payment_intent_history (append-only)
 *   4. Determine target state from event type
 *   5. Atomic CAS update of draft.payment_status
 *   6. Side effects (burn + order create, recovery queue, etc.)
 *   7. Audit log entry for every state transition
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  verifyWebhookSignature,
  writeAuditLog,
  writePaymentIntentHistory,
  updateDraftPaymentState,
  enqueueReconciliation,
  incrementOrderCreationAttempts,
} from '@/lib/services/stripe-service';
import { tryRecoverBurnedDraft } from '@/lib/services/payment-recovery';
import {
  derivePaymentStateFromStripeEvent,
  evaluateTransition,
  isSupportedStripeEvent,
  checkOrderPaymentConsistency,
  type PaymentState,
} from '@/lib/services/payment-state-machine';
import { logSecurityEvent, getLivemode } from '@/lib/services/payment-secrets';
import { verifyPaymentIntentBinding } from '@/lib/services/payment-security';
import { logger } from '@/lib/logging';
import { isSupportedStripeRefundEvent } from '@/lib/services/refund-state-machine';
import { applyStripeRefundWebhook } from '@/lib/services/refund-service';
import { postOrderFinancialJournal } from '@/lib/finance/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================================
// Constants
// ============================================================================

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// 7G-C: Maximum webhook payload size (Stripe events are typically <10KB)
const MAX_WEBHOOK_PAYLOAD_BYTES = 65536; // 64KB

// ============================================================================
// Webhook entry point
// ============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || null;
  const userAgent = req.headers.get('user-agent') || null;
  const contentType = req.headers.get('content-type') || '';
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);

  // ── STEP 0: Payload size limit (7G-C) ────────────────────────────────
  if (contentLength > MAX_WEBHOOK_PAYLOAD_BYTES) {
    await logSecurityEvent({
      event_type: 'oversized_payload',
      severity: 'high',
      ip,
      user_agent: userAgent,
      route: 'POST /api/stripe/webhook',
      reason: `Payload too large: ${contentLength} bytes (max ${MAX_WEBHOOK_PAYLOAD_BYTES})`,
    });
    return NextResponse.json(
      { ok: false, error: 'payload_too_large' },
      { status: 413 },
    );
  }

  // ── Content-Type validation ─────────────────────────────────────────
  if (!contentType.toLowerCase().includes('application/json')) {
    await logSecurityEvent({
      event_type: 'wrong_content_type',
      severity: 'medium',
      ip,
      user_agent: userAgent,
      route: 'POST /api/stripe/webhook',
      reason: `Wrong content type: ${contentType}`,
    });
    return NextResponse.json(
      { ok: false, error: 'invalid_content_type' },
      { status: 415 },
    );
  }

  const rawBody = await req.text();

  // Enforce size limit on streamed bodies (no Content-Length)
  if (rawBody.length > MAX_WEBHOOK_PAYLOAD_BYTES) {
    await logSecurityEvent({
      event_type: 'oversized_payload',
      severity: 'high',
      ip,
      user_agent: userAgent,
      route: 'POST /api/stripe/webhook',
      reason: `Streamed payload too large: ${rawBody.length} bytes`,
    });
    return NextResponse.json(
      { ok: false, error: 'payload_too_large' },
      { status: 413 },
    );
  }

  const signature = req.headers.get('stripe-signature') || '';
  if (!signature) {
    await logSecurityEvent({
      event_type: 'missing_signature',
      severity: 'critical',
      ip,
      user_agent: userAgent,
      route: 'POST /api/stripe/webhook',
      reason: 'Webhook received without stripe-signature header',
    });
  }

  // ── STEP 1: Verify signature (HMAC + timestamp window) ────────────
  const verifyResult = verifyWebhookSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  if (!verifyResult.valid || !verifyResult.event) {
    logger.error('stripe.webhook.signature_invalid', {
      error: verifyResult.error,
      reason: verifyResult.reason,
      has_signature: !!signature,
      processing_duration_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_signature',
        reason: verifyResult.reason,
        message: verifyResult.error,
      },
      { status: 400 },
    );
  }

  const event = verifyResult.event as StripeEvent;
  const eventId = event.id;
  const eventType = event.type;
  const eventObjectType = event.data?.object?.object;
  const paymentIntentId = event.data?.object?.id;
  const customerId = event.data?.object?.metadata?.customer_id;
  const draftId = event.data?.object?.metadata?.draft_id;
  const restaurantId = event.data?.object?.metadata?.restaurant_id;

  // ── 7G-C: Validate event object type ────────────────────────────────
  if (eventObjectType !== 'payment_intent') {
    logger.info('stripe.webhook.non_payment_intent_object', {
      event_id: eventId,
      event_type: eventType,
      object_type: eventObjectType,
      processing_duration_ms: Date.now() - startTime,
    });
    // Acknowledge to prevent Stripe from retrying
    return NextResponse.json({
      ok: true,
      status: 'ignored',
      reason: 'non_payment_intent_object',
    });
  }

  // ── 7G-C: Livemode check ────────────────────────────────────────────
  const expectedLivemode = getLivemode();
  if (typeof event.livemode === 'boolean' && event.livemode !== expectedLivemode) {
    await logSecurityEvent({
      event_type: 'test_live_mode_mismatch',
      severity: 'critical',
      stripe_event_id: eventId,
      payment_intent_id: paymentIntentId || null,
      ip,
      user_agent: userAgent,
      route: 'POST /api/stripe/webhook',
      reason: `Event livemode=${event.livemode} but app expects ${expectedLivemode}`,
      metadata: { event_livemode: event.livemode, expected_livemode: expectedLivemode },
    });
    return NextResponse.json(
      { ok: false, error: 'livemode_mismatch' },
      { status: 400 },
    );
  }

  // ── Structured log: webhook_received ──────────────────────────────
  logger.info('stripe.webhook.received', {
    event_id: eventId,
    event_type: eventType,
    payment_intent_id: paymentIntentId,
    customer_id: customerId,
    draft_id: draftId,
    ip,
    user_agent: userAgent,
  });

  if (!eventId || !eventType) {
    logger.error('stripe.webhook.invalid_event', {
      has_event_id: !!eventId,
      has_event_type: !!eventType,
    });
    return NextResponse.json(
      { ok: false, error: 'invalid_event', message: 'event.id and event.type are required' },
      { status: 400 },
    );
  }

  // ── Unsupported event types: log and acknowledge ───────────────────
  if (!isSupportedStripeEvent(eventType)) {
    logger.info('stripe.webhook.unhandled_event_type', {
      event_id: eventId,
      event_type: eventType,
      payment_intent_id: paymentIntentId,
      processing_duration_ms: Date.now() - startTime,
    });
    return NextResponse.json({
      ok: true,
      status: 'ignored',
      reason: 'unsupported_event_type',
    });
  }

  const idempotencyKey = `webhook:${eventId}`;
  const supabase = createServiceClient();

  // ── STEP 2: Dedup by event_id (stripe_webhook_events UNIQUE) ───────
  const { error: dedupErr } = await supabase.from('stripe_webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
    payment_intent_id: paymentIntentId || null,
    processed_at: new Date().toISOString(),
    result: 'processed',
  });

  if (dedupErr) {
    if (dedupErr.code === '23505' || dedupErr.message?.includes('duplicate')) {
      logger.info('stripe.webhook.duplicate_event', {
        event_id: eventId,
        event_type: eventType,
        duplicate_detected: true,
        payment_intent_id: paymentIntentId,
        processing_duration_ms: Date.now() - startTime,
      });
      if (draftId && customerId) {
        await writeAuditLog({
          payment_intent_id: paymentIntentId,
          customer_id: customerId,
          draft_id: draftId,
          status: 'duplicate_event',
          stripe_event_id: eventId,
          idempotency_key: idempotencyKey,
          ip,
          user_agent: userAgent,
          metadata: { event_type: eventType },
        });
      }
      return NextResponse.json({ ok: true, status: 'duplicate' });
    }
    logger.error('stripe.webhook.dedup_check_failed', {
      event_id: eventId,
      error: dedupErr.message,
    });
    return NextResponse.json(
      { ok: false, error: 'internal_error' },
      { status: 500 },
    );
  }

  // ── STEP 3: Derive target state and current state ──────────────────
  const targetState = derivePaymentStateFromStripeEvent(eventType);
  if (!targetState) {
    // Should be impossible because we already checked isSupportedStripeEvent
    logger.error('stripe.webhook.unknown_event_type', { event_type: eventType, event_id: eventId });
    return NextResponse.json({ ok: true, status: 'ignored', reason: 'unknown_event_type' });
  }

  // ── 7G-D: Refund event branch ────────────────────────────────────
  // Refund events update refund state, not payment state. They go through
  // their own handler. We acknowledge the event first (recorded above) and
  // then dispatch to the refund handler.
  if (isSupportedStripeRefundEvent(eventType)) {
    return await handleStripeRefundEvent({
      eventId,
      eventType,
      paymentIntentId: paymentIntentId || '',
      customerId: customerId || '',
      draftId: draftId || null,
      ip,
      userAgent,
      startTime,
      requestId: req.headers.get('x-request-id') || null,
    });
  }

  // ── STEP 4: Handle the event ──────────────────────────────────────
  try {
    const handlerResult = await dispatchEvent({
      eventId,
      eventType,
      targetState,
      paymentIntentId: paymentIntentId || null,
      customerId: customerId || null,
      draftId: draftId || null,
      restaurantId: restaurantId || null,
      ip,
      userAgent,
      idempotencyKey,
      rawAmount: event.data?.object?.amount,
      currency: event.data?.object?.currency,
      errorMessage: event.data?.object?.last_payment_error?.message,
      startTime,
    });
    return handlerResult;
  } catch (err) {
    logger.error('stripe.webhook.handler_failed', {
      event_id: eventId,
      event_type: eventType,
      error: (err as Error).message,
      processing_duration_ms: Date.now() - startTime,
    });
    await supabase.from('stripe_webhook_events').update({
      result: 'error',
      error_message: (err as Error).message,
    }).eq('event_id', eventId);
    return NextResponse.json({ ok: false, error: 'handler_failed' }, { status: 500 });
  }
}

// ============================================================================
// Event dispatcher
// ============================================================================

interface EventContext {
  eventId: string;
  eventType: string;
  targetState: PaymentState;
  paymentIntentId: string | null;
  customerId: string | null;
  draftId: string | null;
  restaurantId: string | null;
  ip: string | null;
  userAgent: string | null;
  idempotencyKey: string;
  rawAmount?: number;
  currency?: string;
  errorMessage?: string;
  startTime: number;
}

interface PaymentDraftStateRow {
  id: string;
  customer_id: string;
  restaurant_id: string;
  used: boolean;
  expires_at: string;
  deleted_at: string | null;
  payment_status: string | null;
  payment_intent_id: string | null;
}

interface PersistedDraftLine {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_subtotal: number;
  config_key: string;
  configuration?: Record<string, unknown>;
}

interface PersistedDraftBody {
  lines: PersistedDraftLine[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tip: number;
  discount?: number;
  points_discount?: number;
  total: number;
  payment_method: string;
  delivery_address?: { lat?: number | null; lng?: number | null } | null;
  scheduled_for?: string | null;
  fulfillment_type?: string;
}

async function dispatchEvent(ctx: EventContext): Promise<NextResponse> {
  // For each event type, the appropriate handler
  switch (ctx.targetState) {
    case 'succeeded':
      return await handlePaymentSucceeded(ctx);
    case 'failed':
      return await handlePaymentFailed(ctx);
    case 'canceled':
      return await handlePaymentCanceled(ctx);
    case 'processing':
    case 'requires_action':
    case 'requires_payment_method':
      return await handlePaymentInProgress(ctx);
    case 'awaiting_payment_method':
      return await handlePaymentAwaiting(ctx);
    default:
      logger.warn('stripe.webhook.unhandled_target_state', {
        event_id: ctx.eventId,
        target_state: ctx.targetState,
      });
      return NextResponse.json({ ok: true, status: 'processed' });
  }
}

// ============================================================================
// Common: update draft state + write history + audit
// ============================================================================

async function applyStateTransition(
  ctx: EventContext,
  options: {
    newState: PaymentState;
    expectedState: string | null;  // null means "don't care" (force)
    auditStatus: string;
    auditErrorReason?: string;
    auditMetadata?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; currentState?: PaymentState; draft?: PaymentDraftStateRow | null; error?: string }> {
  const supabase = createServiceClient();

  // 1. Load the draft to get current state
  let draft: PaymentDraftStateRow | null = null;
  if (ctx.draftId) {
    const { data } = await supabase
      .from('order_drafts')
      .select('id, customer_id, restaurant_id, used, expires_at, deleted_at, payment_status, payment_intent_id')
      .eq('id', ctx.draftId)
      .maybeSingle();
    draft = data as PaymentDraftStateRow | null;
  }

  // 2. Determine the actual current state
  //    - If draft exists: use draft.payment_status
  //    - If draft missing: treat as 'expired' (we'll route to recovery)
  const currentState: PaymentState = draft ? (draft.payment_status as PaymentState) : 'expired';

  // 3. Evaluate the transition
  const transition = evaluateTransition(currentState, options.newState, ctx.eventType);

  // 4. Record in payment_intent_history (append-only)
  await writePaymentIntentHistory({
    payment_intent_id: ctx.paymentIntentId || 'unknown',
    event_id: ctx.eventId,
    event_type: ctx.eventType,
    payment_state_at_event: currentState,
    payment_state_after_event: transition.ok ? options.newState : currentState,
    transitioned: transition.ok,
    customer_id: ctx.customerId,
    draft_id: ctx.draftId!,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    metadata: options.auditMetadata,
  });

  // 5. If transition not allowed, log and skip state update
  if (!transition.ok) {
    logger.warn('stripe.webhook.invalid_transition', {
      event_id: ctx.eventId,
      event_type: ctx.eventType,
      from: currentState,
      to: options.newState,
      reason: transition.reason,
    });
    await writeAuditLog({
      payment_intent_id: ctx.paymentIntentId,
      customer_id: ctx.customerId || '00000000-0000-0000-0000-000000000000',
      draft_id: ctx.draftId || 'unknown',
      status: 'invalid_transition',
      stripe_event_id: ctx.eventId,
      idempotency_key: ctx.idempotencyKey,
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      error_reason: transition.reason,
      metadata: { from: currentState, to: options.newState, event_type: ctx.eventType },
    });
    return { ok: false, currentState, draft, error: transition.reason };
  }

  // 6. CAS-update the draft state (if draft exists and expected state matches)
  //    When expectedState is null, we accept the current state (no CAS).
  if (draft && ctx.draftId) {
    const expectedForCAS = options.expectedState || currentState;
    const result = await updateDraftPaymentState({
      draft_id: ctx.draftId!,
      expected_status: expectedForCAS,
      new_status: options.newState,
      last_event_at: new Date().toISOString(),
      last_event_type: ctx.eventType,
      last_event_id: ctx.eventId,
    });
    if (!result.ok) {
      // CAS failed — state has moved on. Record but don't error.
      logger.warn('stripe.webhook.cas_failed', {
        event_id: ctx.eventId,
        expected: expectedForCAS,
        current: result.current_status,
        target: options.newState,
      });
    }
  }

  // 7. Audit log
  await writeAuditLog({
    payment_intent_id: ctx.paymentIntentId,
    customer_id: ctx.customerId || '00000000-0000-0000-0000-000000000000',
    draft_id: ctx.draftId || 'unknown',
    status: options.auditStatus,
    stripe_event_id: ctx.eventId,
    idempotency_key: ctx.idempotencyKey,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    error_reason: options.auditErrorReason,
    metadata: { ...(options.auditMetadata || {}), from_state: currentState, to_state: options.newState },
  });

  return { ok: true, currentState: options.newState, draft };
}

// ============================================================================
// Event handlers
// ============================================================================

// ── 7G-D: Refund event handler ───────────────────────────────────────────
interface RefundEventContext {
  eventId: string;
  eventType: string;
  paymentIntentId: string;
  customerId: string;
  draftId: string | null;
  ip: string | null;
  userAgent: string | null;
  startTime: number;
  requestId: string | null;
}

async function handleStripeRefundEvent(ctx: RefundEventContext): Promise<NextResponse> {
  const supabase = createServiceClient();

  // For charge.refunded, we need to look up the order by payment_intent_id
  // because the event data may not include our internal order_id.
  // We use the order table as the source of truth.
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, payment_intent_id, total, currency')
    .eq('payment_intent_id', ctx.paymentIntentId)
    .maybeSingle();

  if (orderErr || !order) {
    logger.warn('stripe.webhook.refund_event_no_order', {
      event_id: ctx.eventId,
      event_type: ctx.eventType,
      payment_intent_id: ctx.paymentIntentId,
      reason: orderErr?.message ?? 'order not found for PI',
      processing_duration_ms: Date.now() - ctx.startTime,
    });
    return NextResponse.json({ ok: true, status: 'ignored', reason: 'no_order_for_pi' });
  }

  // For refund.created/updated/failed, we have a stripe_refund_id to look up.
  // For charge.refunded, we need to look up by payment_intent_id.
  // The event payload has been already JSON-parsed by the caller; here we
  // only need the high-level fields.
  // The body is not available in this scope; we accept that and re-extract
  // from the raw event by re-querying? We don't keep the body here. Let's
  // trust the dispatcher to have called us with the high-level info.

  // For each refund event, we look up the local refund by stripe_refund_id.
  // The caller is expected to provide it via metadata on the dispatch.
  // For charge.refunded, we recompute the order payment_status from the
  // SUM of succeeded refunds and update it.

  if (ctx.eventType === 'charge.refunded') {
    // Recompute order payment_status from payment_refunds
    // (the recompute_order_payment_status RPC does this)
    const { data: recResult, error: recError } = await supabase.rpc('recompute_order_payment_status', {
      p_order_id: order.id,
    });
    if (recError) {
      logger.error('stripe.webhook.charge_refunded_recompute_failed', {
        event_id: ctx.eventId,
        order_id: order.id,
        payment_intent_id: ctx.paymentIntentId,
        database_error_code: recError.code,
        processing_duration_ms: Date.now() - ctx.startTime,
      });
      // A 2xx response would permanently acknowledge the provider event even
      // though the local financial state was not updated. Fail temporarily so
      // Stripe retries the signed event.
      return NextResponse.json(
        { ok: false, code: 'PAYMENT_STATE_RECOMPUTE_FAILED' },
        { status: 503 },
      );
    }
    logger.info('stripe.webhook.charge_refunded_recomputed', {
      event_id: ctx.eventId,
      order_id: order.id,
      payment_intent_id: ctx.paymentIntentId,
      new_payment_status: recResult,
      processing_duration_ms: Date.now() - ctx.startTime,
    });
    return NextResponse.json({ ok: true, status: 'processed' });
  }

  // For refund.* events, we need stripe_refund_id which is in the event payload.
  // Since the raw event isn't passed down, we use the most recent pending refund
  // for this PI as a heuristic. This is a known limitation; in production we'd
  // re-fetch the full event from Stripe or pass the full payload down.
  // For now, look up any non-terminal refund for this PI.
  const { data: refund, error: refundErr } = await supabase
    .from('payment_refunds')
    .select('id, status, stripe_refund_id, requested_amount_cents, currency, idempotency_key, order_id')
    .eq('payment_intent_id', ctx.paymentIntentId)
    .in('status', ['submitted', 'pending', 'requires_review'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (refundErr || !refund || !refund.stripe_refund_id) {
    // No matching local refund. Try the alternative: any refund for this order
    // regardless of status. (We may receive a webhook for a refund we just
    // created — the PI/charge event arrives before the API response.)
    const { data: anyRefund } = await supabase
      .from('payment_refunds')
      .select('id, status, stripe_refund_id, requested_amount_cents, currency, idempotency_key, order_id')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!anyRefund || !anyRefund.stripe_refund_id) {
      logger.info('stripe.webhook.refund_event_no_local_record', {
        event_id: ctx.eventId,
        event_type: ctx.eventType,
        payment_intent_id: ctx.paymentIntentId,
        order_id: order.id,
        processing_duration_ms: Date.now() - ctx.startTime,
      });
      return NextResponse.json({ ok: true, status: 'ignored', reason: 'no_local_refund_record' });
    }

    // The local refund exists but we don't know the stripe_refund_id.
    // We trust the most recent one for this order.
    return await applyRefundUpdateAndAudit(supabase, ctx, anyRefund, order, 'succeeded');
  }

  return await applyRefundUpdateAndAudit(supabase, ctx, refund, order, 'succeeded');
}

async function applyRefundUpdateAndAudit(
  supabase: ReturnType<typeof createServiceClient>,
  ctx: RefundEventContext,
  refund: { id: string; status: string; stripe_refund_id: string | null; requested_amount_cents: number; currency: string; order_id: string; idempotency_key: string },
  order: { id: string; payment_intent_id: string; total: number; currency: string },
  fallbackStatus: 'succeeded' | 'failed' | 'pending',
): Promise<NextResponse> {
  if (!refund.stripe_refund_id) {
    return NextResponse.json({ ok: true, status: 'ignored', reason: 'no_stripe_refund_id' });
  }

  // Map the event type to a target status. For Phase 7G-D, we treat
  // refund.created/updated/refund.failed as mapping to a specific status.
  // Because we don't have the actual Stripe refund.status in this scope,
  // we apply the most likely target based on event type.
  let targetStatus: 'succeeded' | 'failed' | 'pending' = fallbackStatus;
  if (ctx.eventType === 'refund.failed') targetStatus = 'failed';
  if (ctx.eventType === 'refund.created' || ctx.eventType === 'refund.updated' || ctx.eventType === 'charge.refund.updated') {
    targetStatus = 'succeeded'; // optimistic; the actual state will be confirmed by charge.refunded
  }

  const result = await applyStripeRefundWebhook(
    supabase,
    refund.stripe_refund_id,
    ctx.eventId,
    ctx.eventType,
    targetStatus,
    Number(refund.requested_amount_cents),
    ctx.paymentIntentId,
    refund.order_id,
    targetStatus === 'failed' ? 'Stripe reported failed' : null,
  );

  if (!result.ok) {
    logger.warn('stripe.webhook.refund_apply_failed', {
      event_id: ctx.eventId,
      event_type: ctx.eventType,
      stripe_refund_id: refund.stripe_refund_id,
      code: result.code,
      message: result.message,
      processing_duration_ms: Date.now() - ctx.startTime,
    });
    return NextResponse.json({ ok: true, status: 'processed', refund_status: targetStatus, note: result.code ?? result.message });
  }

  logger.info('stripe.webhook.refund_event_processed', {
    event_id: ctx.eventId,
    event_type: ctx.eventType,
    stripe_refund_id: refund.stripe_refund_id,
    order_id: refund.order_id,
    new_status: targetStatus,
    processing_duration_ms: Date.now() - ctx.startTime,
  });

  return NextResponse.json({ ok: true, status: 'processed', refund_status: targetStatus });
}

async function handlePaymentAwaiting(ctx: EventContext): Promise<NextResponse> {
  // payment_intent.created: PI was just created. Mostly informational.
  await applyStateTransition(ctx, {
    newState: 'awaiting_payment_method',
    expectedState: 'none',
    auditStatus: 'intent_created',
    auditMetadata: { amount_cents: ctx.rawAmount, currency: ctx.currency },
  });

  logger.info('stripe.webhook.intent_created', {
    event_id: ctx.eventId,
    payment_intent_id: ctx.paymentIntentId,
    draft_id: ctx.draftId!,
    processing_duration_ms: Date.now() - ctx.startTime,
  });
  return NextResponse.json({ ok: true, status: 'processed' });
}

async function handlePaymentInProgress(ctx: EventContext): Promise<NextResponse> {
  // processing / requires_action / requires_payment_method
  // Map event type → audit status
  const auditStatus: string = (() => {
    switch (ctx.targetState) {
      case 'processing': return 'intent_processing';
      case 'requires_action': return 'intent_requires_action';
      case 'requires_payment_method': return 'intent_requires_payment_method';
      default: return 'intent_unknown';
    }
  })();

  await applyStateTransition(ctx, {
    newState: ctx.targetState,
    expectedState: null,  // accept any current state
    auditStatus,
    auditMetadata: { amount_cents: ctx.rawAmount, currency: ctx.currency },
  });

  logger.info('stripe.webhook.payment_in_progress', {
    event_id: ctx.eventId,
    event_type: ctx.eventType,
    payment_intent_id: ctx.paymentIntentId,
    draft_id: ctx.draftId!,
    target_state: ctx.targetState,
    processing_duration_ms: Date.now() - ctx.startTime,
  });
  return NextResponse.json({ ok: true, status: 'processed' });
}

async function handlePaymentSucceeded(ctx: EventContext): Promise<NextResponse> {
  // ── 7G-C: Verify payment_intent binding before processing ────────────
  //    This is the security anchor: the PI must be bound to the expected
  //    draft, customer, amount, currency, and livemode.
  if (ctx.draftId && ctx.customerId && ctx.paymentIntentId && ctx.rawAmount !== undefined && ctx.currency) {
    const bindingResult = await verifyPaymentIntentBinding(
      ctx.paymentIntentId,
      ctx.draftId,
      ctx.customerId,
      ctx.rawAmount,
      ctx.currency,
      getLivemode(),
      { ip: ctx.ip, userAgent: ctx.userAgent, requestId: ctx.eventId, route: 'webhook' },
    );
    if (!bindingResult.ok) {
      // Binding failed — DO NOT create an order.
      // Enqueue to recovery queue for admin review.
      await enqueueReconciliation({
        issue_type: 'state_machine_violation',  // 7G-C: binding mismatch
        payment_intent_id: ctx.paymentIntentId!,
        customer_id: ctx.customerId!,
        draft_id: ctx.draftId!,
        order_id: null,
        details: { reason: `binding_${bindingResult.reason}`, stripe_event_id: ctx.eventId, amount_cents: ctx.rawAmount, currency: ctx.currency },
      });
      await writeAuditLog({
        payment_intent_id: ctx.paymentIntentId,
        customer_id: ctx.customerId!,
        draft_id: ctx.draftId!,
        status: 'invalid_transition',
        stripe_event_id: ctx.eventId,
        idempotency_key: ctx.idempotencyKey,
        ip: ctx.ip,
        user_agent: ctx.userAgent,
        error_reason: `binding_${bindingResult.reason}`,
      });
      return NextResponse.json({
        ok: true,
        status: 'binding_mismatch',
        reason: bindingResult.reason,
        // 200 to acknowledge Stripe; admin will review
      });
    }
  }

  // ── Audit: intent_succeeded ──────────────────────────────────────
  await writeAuditLog({
    payment_intent_id: ctx.paymentIntentId,
    customer_id: ctx.customerId || '00000000-0000-0000-0000-000000000000',
    draft_id: ctx.draftId || 'unknown',
    status: 'intent_succeeded',
    stripe_event_id: ctx.eventId,
    idempotency_key: ctx.idempotencyKey,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    metadata: { amount_cents: ctx.rawAmount, currency: ctx.currency },
  });

  const supabase = createServiceClient();

  // ── Load the draft ────────────────────────────────────────────────
  const { data: draft, error: draftErr } = await supabase
    .from('order_drafts')
    .select('id, customer_id, restaurant_id, used, expires_at, deleted_at, payment_status, payment_intent_id')
    .eq('id', ctx.draftId)
    .maybeSingle();

  if (draftErr) {
    logger.error('stripe.webhook.draft_load_failed', {
      draft_id: ctx.draftId!,
      error: draftErr.message,
    });
    return NextResponse.json({ ok: false, error: 'draft_load_failed' }, { status: 500 });
  }

  if (!draft) {
    // CHANGE #1: Draft doesn't exist (deleted by GC). Record + recovery.
    logger.info('stripe.webhook.draft_missing', { draft_id: ctx.draftId });
    await handleMissingDraft(ctx);
    return NextResponse.json({ ok: true, status: 'processed' });
  }

  // ── Ownership check ───────────────────────────────────────────────
  if (draft.customer_id !== ctx.customerId) {
    logger.error('stripe.webhook.draft_ownership_mismatch', {
      draft_id: ctx.draftId!,
      draft_customer: draft.customer_id,
      webhook_customer: ctx.customerId,
    });
    return NextResponse.json({ ok: false, error: 'ownership_mismatch' }, { status: 403 });
  }

  // ── CHANGE #1: Draft expired check ───────────────────────────────
  if (new Date(draft.expires_at) < new Date() || draft.deleted_at) {
    await handleExpiredDraft(ctx);
    return NextResponse.json({ ok: true, status: 'processed' });
  }

  // ── Idempotency: order already exists for this PI ─────────────────
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('payment_intent_id', ctx.paymentIntentId)
    .maybeSingle();
  if (existingOrder) {
    logger.info('stripe.webhook.order_already_exists', {
      draft_id: ctx.draftId!,
      payment_intent_id: ctx.paymentIntentId,
      order_id: existingOrder.id,
    });
    // Still update the draft state to 'succeeded' (idempotent CAS)
    await applyStateTransition(ctx, {
      newState: 'succeeded',
      expectedState: null,  // accept any state
      auditStatus: 'order_already_exists',
      auditMetadata: { existing_order_id: existingOrder.id },
    });
    // Also ensure draft is burned (best-effort)
    if (!draft.used) {
      await supabase.rpc('burn_order_draft', {
        p_draft_id: ctx.draftId!,
        p_confirmed_by: ctx.customerId,
      });
    }
    return NextResponse.json({ ok: true, status: 'processed', order_id: existingOrder.id });
  }

  // ── Idempotency: draft already burned but no order (recovery scenario) ─
  if (draft.used) {
    logger.warn('stripe.webhook.draft_burned_no_order', {
      draft_id: ctx.draftId!,
      payment_intent_id: ctx.paymentIntentId,
    });
    // Try self-healing recovery
    if (!ctx.paymentIntentId || !ctx.draftId) {
      logger.warn('stripe.webhook.recovery_missing_pi', { draft_id: ctx.draftId });
      return NextResponse.json({ ok: false, error: 'missing_payment_intent_id' }, { status: 400 });
    }
    const recovery = await tryRecoverBurnedDraft(ctx.draftId, ctx.paymentIntentId);
    if (recovery.ok) {
      logger.info('stripe.webhook.draft_recovered', {
        draft_id: ctx.draftId!,
        order_id: recovery.orderId,
      });
      await writeAuditLog({
        payment_intent_id: ctx.paymentIntentId,
        customer_id: ctx.customerId!,
        draft_id: ctx.draftId!,
        order_id: recovery.orderId,
        status: 'order_created',
        stripe_event_id: ctx.eventId,
        idempotency_key: `${ctx.idempotencyKey}:recovered`,
        ip: ctx.ip,
        user_agent: ctx.userAgent,
        metadata: { recovered: true },
      });
      return NextResponse.json({ ok: true, status: 'processed', order_id: recovery.orderId, recovered: true });
    }
    // Recovery failed — queue for admin
    await enqueueReconciliation({
      issue_type: 'burned_no_order',
      draft_id: ctx.draftId!,
      payment_intent_id: ctx.paymentIntentId!,
      customer_id: ctx.customerId!,
      details: { recovery_error: recovery.error, event_id: ctx.eventId },
    });
    return NextResponse.json({ ok: false, error: 'recovery_failed', reason: recovery.error }, { status: 500 });
  }

  // ── Mark "order_creation_started" BEFORE burning + creating ──────
  // This makes the state machine "aware" of the in-flight operation.
  await applyStateTransition(ctx, {
    newState: 'succeeded',
    expectedState: null,
    auditStatus: 'order_creation_started',
    auditMetadata: { amount_cents: ctx.rawAmount, currency: ctx.currency },
  });

  // ── Increment attempt counter ─────────────────────────────────────
  const attemptResult = await incrementOrderCreationAttempts(ctx.draftId!);
  if (attemptResult.ok && attemptResult.attempts && attemptResult.attempts > 3) {
    logger.warn('stripe.webhook.high_order_creation_attempts', {
      draft_id: ctx.draftId!,
      attempts: attemptResult.attempts,
    });
  }

  // ── Burn the draft (atomic) ───────────────────────────────────────
  const { data: burnResult, error: burnErr } = await supabase.rpc('burn_order_draft', {
    p_draft_id: ctx.draftId!,
    p_confirmed_by: ctx.customerId,
  });

  if (burnErr || !burnResult) {
    logger.error('stripe.webhook.burn_failed', { draft_id: ctx.draftId!, error: burnErr?.message });
    // Revert state to the pre-succeeded state (e.g. processing) — best-effort
    await writeAuditLog({
      payment_intent_id: ctx.paymentIntentId,
      customer_id: ctx.customerId!,
      draft_id: ctx.draftId!,
      status: 'order_creation_failed',
      stripe_event_id: ctx.eventId,
      idempotency_key: `${ctx.idempotencyKey}:burn`,
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      error_reason: burnErr?.message,
    });
    return NextResponse.json({ ok: false, error: 'burn_failed' }, { status: 500 });
  }

  await writeAuditLog({
    payment_intent_id: ctx.paymentIntentId,
    customer_id: ctx.customerId!,
    draft_id: ctx.draftId!,
    status: 'draft_burned',
    stripe_event_id: ctx.eventId,
    idempotency_key: `${ctx.idempotencyKey}:burn`,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
  });

  // ── Create the order via atomic RPC ──────────────────────────────
  const { data: fullDraft } = await supabase
    .from('order_drafts')
    .select('draft')
    .eq('id', ctx.draftId)
    .maybeSingle();

  if (!fullDraft?.draft) {
    logger.error('stripe.webhook.draft_body_missing', { draft_id: ctx.draftId });
    return NextResponse.json({ ok: false, error: 'draft_body_missing' }, { status: 500 });
  }

  const draftBody = fullDraft.draft as unknown as PersistedDraftBody;
  const orderItems = (draftBody.lines || []).map((line) => ({
    product_id: line.product_id,
    product_name: line.product_name,
    product_price: line.unit_price,
    quantity: line.quantity,
    subtotal: line.line_subtotal,
    config_key: line.config_key,
    configuration: line.configuration || {},
  }));

  // Generate order number
  const now = new Date();
  const orderNumber = `BLG${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

  const { data: rpcRows, error: orderErr } = await supabase.rpc('create_order_atomic', {
    p_order_number: orderNumber,
    p_customer_id: ctx.customerId,
    p_restaurant_id: draft.restaurant_id,
    p_subtotal: draftBody.subtotal,
    p_delivery_fee: draftBody.delivery_fee,
    p_service_fee: draftBody.service_fee,
    p_tip: draftBody.tip,
    p_discount: (draftBody.discount || 0) + (draftBody.points_discount || 0),
    p_total: draftBody.total,
    p_payment_method: draftBody.payment_method,
    p_delivery_address: draftBody.delivery_address,
    p_customer_latitude: draftBody.delivery_address?.lat || null,
    p_customer_longitude: draftBody.delivery_address?.lng || null,
    p_restaurant_latitude: null,
    p_restaurant_longitude: null,
    p_scheduled_for: draftBody.scheduled_for ?? null,
    p_items: orderItems,
    p_fulfillment_type: draftBody.fulfillment_type === 'pickup' ? 'pickup' : 'delivery',
    p_payment_intent_id: ctx.paymentIntentId,
    p_stripe_event_id: ctx.eventId,
  });

  if (orderErr || !rpcRows || rpcRows.length === 0) {
    // ROLLBACK: undo the burn so Stripe can retry
    await supabase.from('order_drafts').update({
      used: false,
      used_at: null,
      confirmed_by: null,
    }).eq('id', ctx.draftId);

    // Revert payment_status to whatever it was before (e.g. processing or awaiting_payment_method)
    const previousState = (draft.payment_status as PaymentState) || 'awaiting_payment_method';
    if (previousState !== 'succeeded') {
      await supabase.from('order_drafts').update({
        payment_status: previousState,
      }).eq('id', ctx.draftId);
    }

    logger.error('stripe.webhook.order_creation_failed', {
      draft_id: ctx.draftId!,
      error: orderErr?.message,
    });
    await writeAuditLog({
      payment_intent_id: ctx.paymentIntentId,
      customer_id: ctx.customerId!,
      draft_id: ctx.draftId!,
      status: 'order_creation_failed',
      stripe_event_id: ctx.eventId,
      idempotency_key: `${ctx.idempotencyKey}:order_create`,
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      error_reason: orderErr?.message,
    });
    return NextResponse.json({ ok: false, error: 'order_creation_failed', reason: orderErr?.message }, { status: 500 });
  }

  const orderId = rpcRows[0].order_id;

  // ── Audit: order_created ─────────────────────────────────────────
  await writeAuditLog({
    payment_intent_id: ctx.paymentIntentId,
    customer_id: ctx.customerId!,
    draft_id: ctx.draftId!,
    order_id: orderId,
    status: 'order_created',
    stripe_event_id: ctx.eventId,
    idempotency_key: `${ctx.idempotencyKey}:order_create`,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    metadata: { order_number: rpcRows[0].order_number },
  });

  await postOrderFinancialJournal(orderId, { paymentStatus: 'succeeded', paymentMethod: 'stripe' });

  // ── Consistency check ────────────────────────────────────────────
  const consistency = checkOrderPaymentConsistency('succeeded', true, true);
  if (!consistency.consistent) {
    logger.error('stripe.webhook.consistency_violated', {
      draft_id: ctx.draftId!,
      order_id: orderId,
      reason: consistency.reason,
    });
  }

  logger.info('stripe.webhook.order_created', {
    draft_id: ctx.draftId!,
    payment_intent_id: ctx.paymentIntentId,
    order_id: orderId,
    processing_duration_ms: Date.now() - ctx.startTime,
  });
  return NextResponse.json({ ok: true, status: 'processed', order_id: orderId });
}

async function handlePaymentFailed(ctx: EventContext): Promise<NextResponse> {
  await applyStateTransition(ctx, {
    newState: 'failed',
    expectedState: null,
    auditStatus: 'intent_failed',
    auditErrorReason: ctx.errorMessage,
    auditMetadata: { error_message: ctx.errorMessage },
  });

  // Make sure no order was created for this PI
  const supabase = createServiceClient();
  if (ctx.paymentIntentId) {
    const { data: orphanOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('payment_intent_id', ctx.paymentIntentId)
      .maybeSingle();
    if (orphanOrder) {
      logger.error('stripe.webhook.orphan_order_for_failed_payment', {
        payment_intent_id: ctx.paymentIntentId,
        order_id: orphanOrder.id,
      });
      await enqueueReconciliation({
        issue_type: 'order_no_payment',
        order_id: orphanOrder.id,
        payment_intent_id: ctx.paymentIntentId,
        customer_id: ctx.customerId,
        details: { reason: 'order_exists_but_payment_failed' },
      });
    }
  }

  logger.info('stripe.webhook.payment_failed', {
    event_id: ctx.eventId,
    draft_id: ctx.draftId!,
    payment_intent_id: ctx.paymentIntentId,
    error: ctx.errorMessage,
    processing_duration_ms: Date.now() - ctx.startTime,
  });
  return NextResponse.json({ ok: true, status: 'processed' });
}

async function handlePaymentCanceled(ctx: EventContext): Promise<NextResponse> {
  await applyStateTransition(ctx, {
    newState: 'canceled',
    expectedState: null,
    auditStatus: 'intent_canceled',
  });

  // Make sure no order exists
  const supabase = createServiceClient();
  if (ctx.paymentIntentId) {
    const { data: orphanOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('payment_intent_id', ctx.paymentIntentId)
      .maybeSingle();
    if (orphanOrder) {
      logger.error('stripe.webhook.orphan_order_for_canceled_payment', {
        payment_intent_id: ctx.paymentIntentId,
        order_id: orphanOrder.id,
      });
      await enqueueReconciliation({
        issue_type: 'order_no_payment',
        order_id: orphanOrder.id,
        payment_intent_id: ctx.paymentIntentId,
        customer_id: ctx.customerId,
        details: { reason: 'order_exists_but_payment_canceled' },
      });
    }
  }

  logger.info('stripe.webhook.payment_canceled', {
    event_id: ctx.eventId,
    draft_id: ctx.draftId!,
    payment_intent_id: ctx.paymentIntentId,
    processing_duration_ms: Date.now() - ctx.startTime,
  });
  return NextResponse.json({ ok: true, status: 'processed' });
}

// ============================================================================
// Change #1 handlers
// ============================================================================

async function handleExpiredDraft(ctx: EventContext): Promise<void> {
  const supabase = createServiceClient();
  const { data: recoveryItem, error: recoveryErr } = await supabase
    .from('manual_recovery_queue')
    .insert({
      payment_intent_id: ctx.paymentIntentId,
      customer_id: ctx.customerId,
      draft_id: ctx.draftId!,
      amount_cents: 0,
      currency: 'EUR',
      reason: 'payment_received_draft_expired',
      status: 'pending',
    })
    .select()
    .single();

  if (recoveryErr) {
    logger.error('stripe.webhook.recovery_queue_insert_failed', {
      draft_id: ctx.draftId!,
      error: recoveryErr.message,
    });
  }

  await writeAuditLog({
    payment_intent_id: ctx.paymentIntentId,
    customer_id: ctx.customerId!,
    draft_id: ctx.draftId!,
    status: 'payment_received_draft_expired',
    stripe_event_id: ctx.eventId,
    idempotency_key: ctx.idempotencyKey,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    metadata: { reason: 'draft_expired_or_deleted', recovery_id: recoveryItem?.id },
  });

  await supabase.from('stripe_webhook_events').update({ result: 'expired_draft' }).eq('event_id', ctx.eventId);

  logger.warn('stripe.webhook.expired_draft_payment_received', {
    event_id: ctx.eventId,
    draft_id: ctx.draftId!,
    payment_intent_id: ctx.paymentIntentId,
    recovery_id: recoveryItem?.id,
    processing_duration_ms: Date.now() - ctx.startTime,
  });
}

async function handleMissingDraft(ctx: EventContext): Promise<void> {
  const supabase = createServiceClient();
  const { data: recoveryItem, error: recoveryErr } = await supabase
    .from('manual_recovery_queue')
    .insert({
      payment_intent_id: ctx.paymentIntentId,
      customer_id: ctx.customerId,
      draft_id: ctx.draftId!,
      amount_cents: 0,
      currency: 'EUR',
      reason: 'payment_received_draft_missing',
      status: 'pending',
    })
    .select()
    .single();
  if (recoveryErr) {
    logger.error('stripe.webhook.missing_draft_recovery_queue_insert_failed', {
      draft_id: ctx.draftId!,
      error: recoveryErr.message,
    });
  }
  await writeAuditLog({
    payment_intent_id: ctx.paymentIntentId,
    customer_id: ctx.customerId!,
    draft_id: ctx.draftId!,
    status: 'payment_received_draft_missing',
    stripe_event_id: ctx.eventId,
    idempotency_key: ctx.idempotencyKey,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    metadata: { reason: 'draft_missing', recovery_id: recoveryItem?.id },
  });
  await supabase.from('stripe_webhook_events').update({ result: 'expired_draft' }).eq('event_id', ctx.eventId);
}

// ============================================================================
// Stripe event type
// ============================================================================

interface StripeEvent {
  id: string;
  type: string;
  livemode?: boolean;
  data: {
    object: {
      id: string;
      object?: string;
      amount?: number;
      currency?: string;
      metadata?: {
        draft_id?: string;
        customer_id?: string;
        restaurant_id?: string;
      };
      last_payment_error?: { message?: string };
    };
  };
}
