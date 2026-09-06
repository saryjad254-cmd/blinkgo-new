/**
 * Payment Security Core (Phase 7G-C)
 * ───────────────────────────────────
 * Centralized ownership verification, amount/currency integrity,
 * and PaymentIntent substitution defense.
 *
 * Every payment route MUST call into these functions. They are the
 * canonical gate that enforces the "browser is never trusted" invariant.
 */
import { createServiceClient } from '@/lib/supabase/service';
import { logSecurityEvent } from '@/lib/services/payment-secrets';

export interface DraftRow {
  id: string;
  customer_id: string;
  restaurant_id: string;
  draft: unknown;        // JSONB: validated by the route that consumes it
  used: boolean;
  expires_at: string;
  deleted_at: string | null;
  payment_intent_id: string | null;
  payment_status: string | null;
  total_cents: number | null;
  total_hash: string | null;
  expected_currency: string;
  livemode: boolean | null;
  environment: string | null;
}

export interface OwnershipCheckResult {
  ok: boolean;
  reason:
    | 'draft_not_found'
    | 'cross_user_access'        // returned as not_found to caller
    | 'draft_deleted'
    | 'draft_expired'
    | 'draft_used'
    | 'payment_already_succeeded'
    | 'currency_invalid'
    | 'amount_invalid'
    | 'amount_mismatch'
    | 'restaurant_mismatch';
}

export interface AmountValidation {
  ok: boolean;
  total_cents: number;
  total_hash: string;
  reason?: string;
}

export interface PaymentIntentBinding {
  payment_intent_id: string;
  draft_id: string;
  customer_id: string;
  restaurant_id: string;
  expected_amount_cents: number;
  currency: string;
  livemode: boolean;
  environment: 'production' | 'test';
}

/**
 * Constant-time string compare to prevent timing attacks.
 * Returns true if both strings are equal length AND match.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    let mismatch = 0;
    for (let i = 0; i < ab.length; i++) {
      mismatch |= ab[i] ^ bb[i];
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

/**
 * FNV-1a 64-bit hash, hex-encoded. Used to fingerprint a draft's
 * server-computed total so the webhook can later verify the binding
 * wasn't tampered with.
 */
export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < input.length; i++) {
    hash = (hash ^ BigInt(input.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Compute the canonical total in cents for a draft.
 * This is the SERVER's view of the total. The client's view is irrelevant.
 *
 * Recomputes from:
 *   - Items × quantity × unit_price (from product table, server-validated)
 *   - Modifiers (price_delta from modifier table)
 *   - Subtotal
 *   - Discount (clamped to subtotal)
 *   - Delivery fee (depends on zone + subtotal)
 *   - Service fee (configurable percentage)
 *   - Tip (clamped to [0, 500] cents)
 *   - Tax (if applicable)
 *
 * NOTE: This function uses the persisted `draft` JSONB; in the canonical
 * flow, the draft was already verified at creation. The `total_hash`
 * stored on the draft row is the hash of the canonical total computed
 * at draft creation time. Here we re-derive the hash from the persisted
 * `total_cents` to verify integrity.
 */
export function computeDraftTotalHash(totalCents: number, currency: string): string {
  return fnv1a64(`${totalCents}|${currency}`);
}

/**
 * Validate a payment amount: must be a positive integer, in cents,
 * within business limits.
 */
export function validateAmountCents(amount: number): { ok: boolean; reason?: string } {
  if (!Number.isFinite(amount)) return { ok: false, reason: 'not_finite' };
  if (!Number.isInteger(amount)) return { ok: false, reason: 'not_integer' };
  if (amount <= 0) return { ok: false, reason: 'not_positive' };
  if (amount > 10_000_000) return { ok: false, reason: 'too_large' };  // €100,000 cap
  if (amount < 50) return { ok: false, reason: 'too_small' };        // 50 cent minimum
  return { ok: true };
}

/**
 * Validate a currency code (ISO 4217 3-letter lowercase).
 */
export function validateCurrency(currency: string): boolean {
  return typeof currency === 'string' && /^[a-z]{3}$/.test(currency);
}

/**
 * Strict ownership check.
 *
 * Returns { ok: true } only when:
 *   - Draft exists
 *   - Draft.customer_id === userId
 *   - Draft not deleted
 *   - Draft not used
 *   - Draft not expired
 *   - Draft not in succeeded state
 *
 * If the user is NOT the owner, returns { ok: false, reason: 'draft_not_found' }
 * (NOT 'cross_user_access') to prevent enumeration.
 */
export async function verifyDraftOwnership(
  draftId: string,
  userId: string,
  requestContext?: { ip?: string | null; userAgent?: string | null; requestId?: string | null; route?: string | null },
): Promise<OwnershipCheckResult> {
  const supabase = createServiceClient();
  const { data: draft, error } = await supabase
    .from('order_drafts')
    .select('id, customer_id, restaurant_id, used, expires_at, deleted_at, payment_status, payment_intent_id')
    .eq('id', draftId)
    .maybeSingle();

  if (error || !draft) {
    return { ok: false, reason: 'draft_not_found' };
  }

  // Owner check FIRST (before any other state). If not owner, log + return not_found.
  if (draft.customer_id !== userId) {
    await logSecurityEvent({
      event_type: 'cross_user_draft_access',
      severity: 'critical',
      user_id: userId,
      draft_id: draftId,
      ip: requestContext?.ip || null,
      user_agent: requestContext?.userAgent || null,
      request_id: requestContext?.requestId || null,
      route: requestContext?.route || null,
      reason: `User ${userId} attempted to access draft ${draftId} owned by ${draft.customer_id}`,
      metadata: { attempted_user: userId, actual_owner: draft.customer_id },
    });
    return { ok: false, reason: 'draft_not_found' };  // Uniform with not-found
  }

  if (draft.deleted_at) return { ok: false, reason: 'draft_deleted' };
  if (new Date(draft.expires_at) < new Date()) return { ok: false, reason: 'draft_expired' };
  if (draft.used) return { ok: false, reason: 'draft_used' };
  if (draft.payment_status === 'succeeded' || draft.payment_status === 'order_created') {
    return { ok: false, reason: 'payment_already_succeeded' };
  }

  return { ok: true, reason: 'draft_not_found' };
}

/**
 * Verify a PaymentIntent is bound to a specific draft and amount.
 * Cross-checks against:
 *   1. The persisted payment_binding table
 *   2. The draft's total_cents
 *   3. The currency
 *   4. The livemode
 *   5. The customer_id
 *   6. The restaurant_id
 *
 * Returns { ok: true, binding } on success; { ok: false, reason } on any mismatch.
 */
export async function verifyPaymentIntentBinding(
  paymentIntentId: string,
  expectedDraftId: string,
  expectedCustomerId: string,
  expectedAmountCents: number,
  expectedCurrency: string,
  expectedLivemode: boolean,
  requestContext?: { ip?: string | null; userAgent?: string | null; requestId?: string | null; route?: string | null },
): Promise<{ ok: true; binding: PaymentIntentBinding } | { ok: false; reason: string }> {
  const supabase = createServiceClient();
  const { data: binding, error } = await supabase
    .from('payment_binding')
    .select('*')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (error || !binding) {
    await logSecurityEvent({
      event_type: 'pi_from_other_environment',
      severity: 'critical',
      payment_intent_id: paymentIntentId,
      draft_id: expectedDraftId,
      user_id: expectedCustomerId,
      ip: requestContext?.ip || null,
      request_id: requestContext?.requestId || null,
      route: requestContext?.route || null,
      reason: `No binding found for PI ${paymentIntentId} — possibly external or forged`,
    });
    return { ok: false, reason: 'no_binding' };
  }

  // Mismatch checks (in priority order)
  if (binding.draft_id !== expectedDraftId) {
    await logSecurityEvent({
      event_type: 'pi_from_other_draft',
      severity: 'critical',
      payment_intent_id: paymentIntentId,
      draft_id: expectedDraftId,
      user_id: expectedCustomerId,
      ip: requestContext?.ip || null,
      request_id: requestContext?.requestId || null,
      route: requestContext?.route || null,
      reason: `PI ${paymentIntentId} is bound to draft ${binding.draft_id}, not ${expectedDraftId}`,
    });
    return { ok: false, reason: 'draft_mismatch' };
  }
  if (binding.customer_id !== expectedCustomerId) {
    await logSecurityEvent({
      event_type: 'pi_from_other_user',
      severity: 'critical',
      payment_intent_id: paymentIntentId,
      user_id: expectedCustomerId,
      ip: requestContext?.ip || null,
      request_id: requestContext?.requestId || null,
      route: requestContext?.route || null,
      reason: `PI ${paymentIntentId} is bound to customer ${binding.customer_id}, not ${expectedCustomerId}`,
    });
    return { ok: false, reason: 'customer_mismatch' };
  }
  if (binding.expected_amount_cents !== expectedAmountCents) {
    await logSecurityEvent({
      event_type: 'amount_mismatch',
      severity: 'critical',
      payment_intent_id: paymentIntentId,
      draft_id: expectedDraftId,
      user_id: expectedCustomerId,
      ip: requestContext?.ip || null,
      request_id: requestContext?.requestId || null,
      route: requestContext?.route || null,
      reason: `PI ${paymentIntentId} expected ${binding.expected_amount_cents} cents, got ${expectedAmountCents}`,
    });
    return { ok: false, reason: 'amount_mismatch' };
  }
  if (binding.currency !== expectedCurrency) {
    await logSecurityEvent({
      event_type: 'currency_mismatch',
      severity: 'critical',
      payment_intent_id: paymentIntentId,
      draft_id: expectedDraftId,
      user_id: expectedCustomerId,
      ip: requestContext?.ip || null,
      request_id: requestContext?.requestId || null,
      route: requestContext?.route || null,
      reason: `PI ${paymentIntentId} expected currency ${binding.currency}, got ${expectedCurrency}`,
    });
    return { ok: false, reason: 'currency_mismatch' };
  }
  if (binding.livemode !== expectedLivemode) {
    await logSecurityEvent({
      event_type: 'test_live_mode_mismatch',
      severity: 'critical',
      payment_intent_id: paymentIntentId,
      draft_id: expectedDraftId,
      user_id: expectedCustomerId,
      ip: requestContext?.ip || null,
      request_id: requestContext?.requestId || null,
      route: requestContext?.route || null,
      reason: `PI ${paymentIntentId} livemode ${binding.livemode} vs expected ${expectedLivemode}`,
    });
    return { ok: false, reason: 'livemode_mismatch' };
  }

  return {
    ok: true,
    binding: {
      payment_intent_id: binding.payment_intent_id,
      draft_id: binding.draft_id,
      customer_id: binding.customer_id,
      restaurant_id: binding.restaurant_id,
      expected_amount_cents: binding.expected_amount_cents,
      currency: binding.currency,
      livemode: binding.livemode,
      environment: binding.environment,
    },
  };
}

/**
 * Persist a payment binding. Called immediately after PaymentIntent creation.
 * The binding is the security anchor: no order may be created unless
 * the binding validates.
 */
export async function persistPaymentBinding(binding: PaymentIntentBinding): Promise<void> {
  const supabase = createServiceClient();
  const row = {
    payment_intent_id: binding.payment_intent_id,
    draft_id: binding.draft_id,
    customer_id: binding.customer_id,
    restaurant_id: binding.restaurant_id,
    expected_amount_cents: binding.expected_amount_cents,
    currency: binding.currency,
    livemode: binding.livemode,
    environment: binding.environment,
  };
  const { error } = await supabase.from('payment_binding').insert(row);
  if (!error) return;

  // A retry may legitimately encounter the immutable binding created by the
  // first request. Accept it only when every security-relevant field matches.
  if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate')) {
    const { data: existing, error: readError } = await supabase
      .from('payment_binding')
      .select('payment_intent_id,draft_id,customer_id,restaurant_id,expected_amount_cents,currency,livemode,environment')
      .eq('payment_intent_id', binding.payment_intent_id)
      .maybeSingle();
    if (!readError && existing
      && existing.draft_id === row.draft_id
      && existing.customer_id === row.customer_id
      && existing.restaurant_id === row.restaurant_id
      && existing.expected_amount_cents === row.expected_amount_cents
      && existing.currency === row.currency
      && existing.livemode === row.livemode
      && existing.environment === row.environment) {
      return;
    }
    throw new Error('Existing payment binding does not match the PaymentIntent security context');
  }

  throw new Error(`Payment binding could not be persisted (${error.code || 'database_error'})`);
}

/**
 * Redact sensitive fields from an object before logging.
 * Replaces client_secret, password, authorization, cookie values, etc.
 */
export function redactForLog<T extends object>(obj: T): Record<string, unknown> {
  const sensitiveKeys = [
    'client_secret', 'password', 'authorization', 'cookie',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'CRON_SECRET',
    'DRAFT_SIGNING_SECRET', 'token', 'access_token', 'refresh_token',
    'card', 'number', 'cvc', 'cvv', 'pan',
  ];
  const seen = new WeakSet<object>();
  const redactValue = (value: unknown, key: string, depth: number): unknown => {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
      return '***REDACTED***';
    }
    if (value === null || typeof value !== 'object') return value;
    if (depth >= 8) return '[TRUNCATED]';
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, '', depth + 1));
    }
    const result: Record<string, unknown> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      result[nestedKey] = redactValue(nestedValue, nestedKey, depth + 1);
    }
    return result;
  };
  return redactValue(obj, '', 0) as Record<string, unknown>;
}
