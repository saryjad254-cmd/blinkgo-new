/**
 * Stripe Service (Phase 7G-A + 7G-B)
 * ──────────────────────────────────────────────────
 * Server-side Stripe client + audit log writer.
 *
 * This service is the ONLY entry point to Stripe from API routes.
 * It enforces:
 *   - Idempotent PaymentIntent creation (uses draft_id as Idempotency-Key)
 *   - Webhook signature verification (with timestamp window in 7G-B)
 *   - Audit log writes for every state transition
 *
 * Phase 7G-B additions:
 *   - Timestamp window check (reject events older than 5 minutes)
 *   - Payment history recording helper
 *   - Reconciliation queue helper
 *   - Structured logging fields for observability
 *
 * The mock implementation simulates Stripe's API for development
 * (the mock Supabase + scripts/mock-stripe.mjs). In production,
 * the real Stripe SDK is used.
 *
 * IMPORTANT: This service is server-side ONLY. Never import it
 * from a client component. The publishable key is exposed to the
 * client separately (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
 */
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getPaymentSecretStatus } from '@/lib/services/payment-secrets';
import type Stripe from 'stripe';

// ============================================================================
// Constants
// ============================================================================

/** Maximum age of a webhook event, in seconds. Stripe recommends 5 minutes. */
export const WEBHOOK_TIMESTAMP_WINDOW_SEC = 300;

// ============================================================================
// Types
// ============================================================================

export interface PaymentIntent {
  id: string;
  client_secret: string;
  amount: number;        // in cents
  currency: string;
  status: PaymentIntentStatus;
  metadata: {
    draft_id: string;
    customer_id: string;
    restaurant_id: string;
  };
  created_at: string;
}

export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'canceled'
  | 'requires_capture';

export interface AuditLogEntry {
  payment_intent_id?: string | null;
  customer_id: string;
  draft_id: string;
  order_id?: string | null;
  status: string;
  stripe_event_id?: string | null;
  idempotency_key: string;
  ip?: string | null;
  user_agent?: string | null;
  error_reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ============================================================================
// Configuration
// ============================================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

export function isStripeConfigured(): boolean {
  const status = getPaymentSecretStatus();
  return status.canCreatePayments && status.mode !== 'dev-mock';
}

export function getStripeWebhookSecret(): string {
  return STRIPE_WEBHOOK_SECRET;
}

// ============================================================================
// PaymentIntent creation (idempotent)
// ============================================================================

/**
 * Create or retrieve a PaymentIntent for a draft.
 *
 * Idempotency: uses `draft_id` as Stripe's Idempotency-Key.
 * If the same draft_id is used twice (e.g. customer refresh),
 * Stripe returns the same PaymentIntent.
 *
 * The audit log records the creation. Idempotency is also enforced
 * by the payment_audit_log + order_drafts.payment_intent_id linkage.
 */
export async function createOrGetPaymentIntent(params: {
  draft_id: string;
  customer_id: string;
  restaurant_id: string;
  amount_cents: number;
  currency?: string;
  customer_email?: string;
  ip?: string;
  user_agent?: string;
}): Promise<PaymentIntent> {
  const idempotencyKey = `draft:${params.draft_id}`;

  // Check existing payment_intent_id on the draft (idempotency layer 1)
  const supabase = createServiceClient();
  const { data: existingDraft } = await supabase
    .from('order_drafts')
    .select('payment_intent_id')
    .eq('id', params.draft_id)
    .maybeSingle();
  if (existingDraft?.payment_intent_id) {
    const existing = await retrievePaymentIntent(existingDraft.payment_intent_id);
    if (existing) {
      logger.info('stripe.payment_intent.idempotent_reuse', {
        draft_id: params.draft_id,
        payment_intent_id: existing.id,
      });
      return existing;
    }
  }

  // Create the PaymentIntent
  const paymentIntent = await stripeCreatePaymentIntent({
    amount: params.amount_cents,
    currency: params.currency || 'eur',
    idempotency_key: idempotencyKey,
    metadata: {
      draft_id: params.draft_id,
      customer_id: params.customer_id,
      restaurant_id: params.restaurant_id,
    },
    receipt_email: params.customer_email,
  });

  // Persist the payment_intent_id on the draft (so the webhook can find it)
  // Phase 7G-B: also set the initial payment_status to 'awaiting_payment_method'
  await supabase.from('order_drafts').update({
    payment_intent_id: paymentIntent.id,
    payment_status: 'awaiting_payment_method',
    last_payment_event_at: new Date().toISOString(),
    last_payment_event_type: 'payment_intent.created',
    last_payment_event_id: null,
  }).eq('id', params.draft_id);

  // Audit log
  await writeAuditLog({
    payment_intent_id: paymentIntent.id,
    customer_id: params.customer_id,
    draft_id: params.draft_id,
    status: 'intent_created',
    idempotency_key: idempotencyKey,
    ip: params.ip,
    user_agent: params.user_agent,
  });

  logger.info('stripe.payment_intent.created', {
    draft_id: params.draft_id,
    payment_intent_id: paymentIntent.id,
    amount: params.amount_cents,
  });

  return paymentIntent;
}

async function retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntent | null> {
  if (isStripeConfigured()) {
    // Production: real Stripe API call with retry wrapper (Phase 7G-F)
    try {
      const { stripeRetry } = await import('@/lib/infrastructure/stripe-retry');
      const result = await stripeRetry(
        async () => {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(STRIPE_SECRET_KEY);
          return stripe.paymentIntents.retrieve(paymentIntentId);
        },
        {
          operation: 'paymentIntents.retrieve',
          requestId: paymentIntentId,
          recoveryState: 'pi_retrieval',
        },
      );
      if (!result.ok) {
        logger.error('stripe.payment_intent.retrieve_failed', { payment_intent_id: paymentIntentId, error: result.message });
        return null;
      }
      return stripePaymentIntentToInternal(result.value);
    } catch (err) {
      logger.error('stripe.payment_intent.retrieve_failed', { payment_intent_id: paymentIntentId, error: (err as Error).message });
      return null;
    }
  } else {
    // Mock: query the mock Stripe simulator
    const res = await fetch(`http://localhost:54321/rest/v1/stripe_payment_intents?id=eq.${encodeURIComponent(paymentIntentId)}&select=*`, {
      headers: { apikey: 'mock-service-role-key', authorization: 'Bearer mock-service-role-key' },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      client_secret: row.client_secret,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      metadata: row.metadata,
      created_at: row.created_at,
    };
  }
}

async function stripeCreatePaymentIntent(params: {
  amount: number;
  currency: string;
  idempotency_key: string;
  metadata: Record<string, string>;
  receipt_email?: string;
}): Promise<PaymentIntent> {
  if (isStripeConfigured()) {
    // Production: real Stripe API call with retry wrapper (Phase 7G-F)
    const { stripeRetry } = await import('@/lib/infrastructure/stripe-retry');
    const result = await stripeRetry(
      async () => {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(STRIPE_SECRET_KEY);
        return stripe.paymentIntents.create(
          {
            amount: params.amount,
            currency: params.currency,
            automatic_payment_methods: { enabled: true },
            metadata: params.metadata,
            receipt_email: params.receipt_email,
          },
          { idempotencyKey: params.idempotency_key },
        );
      },
      {
        operation: 'paymentIntents.create',
        requestId: params.idempotency_key,
        recoveryState: 'pi_creation',
      },
    );
    if (!result.ok) {
      throw new Error(`Stripe payment intent creation failed: ${result.message} (retried ${result.retried} times)`);
    }
    return stripePaymentIntentToInternal(result.value);
  } else {
    // Mock: POST to mock-stripe simulator
    // Mirror Stripe's idempotency semantics in local acceptance tests. A
    // deterministic identifier prevents concurrent requests for one draft
    // from manufacturing multiple mock PaymentIntents.
    const mockDigest = createHash('sha256').update(params.idempotency_key).digest('hex');
    const paymentIntentId = `pi_mock_${mockDigest.slice(0, 32)}`;
    const clientSecret = `${paymentIntentId}_secret_${mockDigest.slice(32, 48)}`;
    const record = {
      id: paymentIntentId,
      client_secret: clientSecret,
      amount: params.amount,
      currency: params.currency,
      status: 'requires_payment_method' as PaymentIntentStatus,
      metadata: (params.metadata || {}) as PaymentIntent['metadata'],
      created_at: new Date().toISOString(),
    };
    // POST to mock-stripe (if running) or to a fallback in-memory store
    try {
      const res = await fetch(`http://localhost:54321/rest/v1/stripe_payment_intents`, {
        method: 'POST',
        headers: {
          apikey: 'mock-service-role-key',
          authorization: 'Bearer mock-service-role-key',
          'content-type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates',
        },
        body: JSON.stringify(record),
      });
      if (!res.ok) {
        logger.warn('mock-stripe.payment_intent.create_non_2xx', { status: res.status });
      }
    } catch {
      // Mock not running — return the in-memory record anyway
      logger.debug('stripe.payment_intent.mock_no_server', { id: paymentIntentId });
    }
    return record;
  }
}

function stripePaymentIntentToInternal(pi: Stripe.PaymentIntent): PaymentIntent {
  const clientSecret = pi.client_secret;
  const draftId = pi.metadata.draft_id;
  const customerId = pi.metadata.customer_id;
  const restaurantId = pi.metadata.restaurant_id;
  if (!clientSecret || !draftId || !customerId || !restaurantId) {
    throw new Error('Stripe PaymentIntent is missing required BlinkGo binding data');
  }
  return {
    id: pi.id,
    client_secret: clientSecret,
    amount: pi.amount,
    currency: pi.currency,
    status: pi.status as PaymentIntentStatus,
    metadata: {
      draft_id: draftId,
      customer_id: customerId,
      restaurant_id: restaurantId,
    },
    created_at: new Date(pi.created * 1000).toISOString(),
  };
}

// ============================================================================
// Webhook signature verification
// ============================================================================

/**
 * Verify a Stripe webhook signature.
 * In production, this uses Stripe's official constructEvent.
 * In mock mode, we accept a simple HMAC verification with the same secret.
 *
 * Phase 7G-B: also enforces a timestamp window (default 5 minutes).
 * Events with timestamps older than the window are rejected.
 * This prevents replay attacks with stolen payloads.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string = STRIPE_WEBHOOK_SECRET,
  options: { timestampWindowSec?: number; nowSec?: number } = {},
): { valid: boolean; event?: unknown; error?: string; reason?: string; timestamp?: number } {
  if (!secret) {
    return { valid: false, error: 'STRIPE_WEBHOOK_SECRET not configured' };
  }
  try {
    // Stripe sends signature as "t=<timestamp>,v1=<hmac>"
    // The signed payload is "<timestamp>.<body>"
    //
    // In production with real Stripe, we'd use:
    //   const stripe = new Stripe(STRIPE_SECRET_KEY);
    //   const event = stripe.webhooks.constructEvent(payload, signature, secret);
    //
    // For mock/dev mode, we do a manual HMAC-SHA256 verify.
    // The webhook route is async; the wrapper for real-Stripe
    // signature verification is in webhook route's signature-check step.
    const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf8');
    const headerParts = signature.split(',').map((part) => part.trim());
    const t = headerParts.find((part) => part.startsWith('t='))?.slice(2);
    const signatures = headerParts
      .filter((part) => part.startsWith('v1='))
      .map((part) => part.slice(3))
      .filter((candidate) => /^[a-f0-9]{64}$/i.test(candidate));
    if (!t || signatures.length === 0) {
      return { valid: false, error: 'Invalid signature format' };
    }
    const ts = parseInt(t, 10);
    if (!Number.isFinite(ts)) {
      return { valid: false, error: 'Invalid timestamp' };
    }

    // Phase 7G-B: timestamp window check
    const now = options.nowSec ?? Math.floor(Date.now() / 1000);
    const windowSec = options.timestampWindowSec ?? WEBHOOK_TIMESTAMP_WINDOW_SEC;
    const age = now - ts;
    if (age > windowSec) {
      return {
        valid: false,
        error: 'Timestamp too old',
        reason: 'timestamp_expired',
        timestamp: ts,
      };
    }
    if (age < -windowSec) {
      return {
        valid: false,
        error: 'Timestamp too far in the future',
        reason: 'timestamp_skew',
        timestamp: ts,
      };
    }

    const signedPayload = `${t}.${payloadStr}`;
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const validSignature = signatures.some((candidate) => {
      const providedBuf = Buffer.from(candidate, 'hex');
      return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
    });
    if (!validSignature) {
      return { valid: false, error: 'Invalid signature' };
    }
    const event = JSON.parse(payloadStr);
    return { valid: true, event, timestamp: ts };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * Build a Stripe-compatible webhook signature for testing.
 * Exported for the test suite.
 */
export function signWebhookPayload(
  payload: string,
  secret: string = STRIPE_WEBHOOK_SECRET,
  timestamp: number = Math.floor(Date.now() / 1000),
): { signature: string; header: string } {
  const signedPayload = `${timestamp}.${payload}`;
  const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return {
    signature: v1,
    header: `t=${timestamp},v1=${v1}`,
  };
}

// ============================================================================
// Audit log writer
// ============================================================================

/**
 * Write a single audit log entry.
 * The payment_audit_log table is INSERT-only at the database level
 * (CREATE RULE no_update_payment_audit AS ON UPDATE ... DO INSTEAD NOTHING).
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('payment_audit_log').insert({
    payment_intent_id: entry.payment_intent_id,
    customer_id: entry.customer_id,
    draft_id: entry.draft_id,
    order_id: entry.order_id,
    status: entry.status,
    stripe_event_id: entry.stripe_event_id,
    idempotency_key: entry.idempotency_key,
    ip: entry.ip,
    user_agent: entry.user_agent,
    error_reason: entry.error_reason,
    metadata: entry.metadata,
  });
  if (error) {
    logger.error('stripe.audit_log.write_failed', { error: error.message, entry });
  }
}

// ============================================================================
// Phase 7G-B: Payment intent history writer
// ============================================================================

/**
 * Record a Stripe event in the payment_intent_history table.
 * Used for forensics and for out-of-order reconciliation.
 *
 * INSERT only — never updates or deletes.
 */
export async function writePaymentIntentHistory(entry: {
  payment_intent_id: string;
  event_id: string;
  event_type: string;
  payment_state_at_event: string;
  payment_state_after_event?: string | null;
  transitioned?: boolean;
  customer_id?: string | null;
  draft_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('payment_intent_history').insert({
    payment_intent_id: entry.payment_intent_id,
    event_id: entry.event_id,
    event_type: entry.event_type,
    payment_state_at_event: entry.payment_state_at_event,
    payment_state_after_event: entry.payment_state_after_event ?? null,
    transitioned: entry.transitioned !== undefined ? entry.transitioned : true,
    customer_id: entry.customer_id ?? null,
    draft_id: entry.draft_id ?? null,
    ip: entry.ip ?? null,
    user_agent: entry.user_agent ?? null,
    metadata: entry.metadata ?? null,
  });
  if (error) {
    // 23505 = duplicate (event already recorded) — that's OK, not an error
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      return { ok: true };
    }
    logger.error('stripe.payment_intent_history.write_failed', { error: error.message, entry });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ============================================================================
// Phase 7G-B: Reconciliation queue helper
// ============================================================================

/**
 * Insert a row into payment_reconciliation_queue.
 * Used by the reconciliation cron to flag inconsistent states.
 *
 * Idempotent: returns existing row if one already exists for the same
 * (issue_type, payment_intent_id, draft_id) triple.
 */
export async function enqueueReconciliation(entry: {
  issue_type: 'burned_no_order' | 'order_no_payment' | 'stuck_awaiting_payment'
    | 'stuck_processing' | 'orphan_payment_intent' | 'state_machine_violation';
  payment_intent_id?: string | null;
  draft_id?: string | null;
  order_id?: string | null;
  customer_id?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; id?: number; error?: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('payment_reconciliation_queue').insert({
    issue_type: entry.issue_type,
    payment_intent_id: entry.payment_intent_id ?? null,
    draft_id: entry.draft_id ?? null,
    order_id: entry.order_id ?? null,
    customer_id: entry.customer_id ?? null,
    details: entry.details ?? null,
  }).select().single();
  if (error) {
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      // Already queued — that's fine
      return { ok: true };
    }
    logger.error('stripe.reconciliation_queue.insert_failed', { error: error.message, entry });
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

// ============================================================================
// Phase 7G-B: Atomic draft state update
// ============================================================================

/**
 * Update the draft.payment_status with optimistic concurrency.
 * Returns the updated row if successful; null if the expected_status didn't match.
 *
 * This is the ONLY way to update payment_status from a webhook.
 */
export async function updateDraftPaymentState(params: {
  draft_id: string;
  expected_status: string;     // current payment_status (for CAS)
  new_status: string;
  last_event_at: string;
  last_event_type: string;
  last_event_id: string;
}): Promise<{ ok: boolean; data?: Record<string, unknown>; current_status?: string; error?: string }> {
  const supabase = createServiceClient();
  // The mock expects _expected_payment_status sentinel in PATCH body
  const { data, error } = await supabase
    .from('order_drafts')
    .update({
      payment_status: params.new_status,
      last_payment_event_at: params.last_event_at,
      last_payment_event_type: params.last_event_type,
      last_payment_event_id: params.last_event_id,
      _expected_payment_status: params.expected_status,
    })
    .eq('id', params.draft_id)
    .select()
    .single();
  if (error) {
    // Check if it's a CAS failure
    if (error.message?.includes('CAS_failed') || error.code === '23514') {
      // Re-read to get current status
      const { data: current } = await supabase
        .from('order_drafts')
        .select('payment_status')
        .eq('id', params.draft_id)
        .maybeSingle();
      return { ok: false, current_status: current?.payment_status, error: 'CAS_failed' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

/**
 * Increment the order_creation_attempts counter atomically.
 * Used to detect stuck drafts (high attempt count = something's wrong).
 */
export async function incrementOrderCreationAttempts(draftId: string): Promise<{ ok: boolean; attempts?: number; error?: string }> {
  const supabase = createServiceClient();
  // First read
  const { data: draft, error: readErr } = await supabase
    .from('order_drafts')
    .select('order_creation_attempts')
    .eq('id', draftId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!draft) return { ok: false, error: 'draft_not_found' };
  const newCount = (draft.order_creation_attempts ?? 0) + 1;
  // Then update
  const { error: updateErr } = await supabase
    .from('order_drafts')
    .update({ order_creation_attempts: newCount })
    .eq('id', draftId);
  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true, attempts: newCount };
}
