/**
 * Refund Calculation Service
 * ──────────────────────────
 * Phase 7G-D: server-authoritative refund math.
 *
 * Rules:
 *   1. Integer cents ONLY. No floats.
 *   2. The browser NEVER controls the amount. The server computes everything.
 *   3. Reject: negative, zero, NaN, Infinity, unsafe integer, decimals with
 *      invalid precision, wrong currency, over-refund, refund on unpaid order.
 *   4. Use verified payment amount received and persisted refund history.
 *
 * Inputs come from:
 *   - the persisted orders.total (multiplied by 100 to cents)
 *   - the SUM(succeeded) of payment_refunds.refunded_amount_cents
 *   - the SUM(pending) of payment_refunds.refunded_amount_cents
 *   - the SUM(failed/requires_review) of payment_refunds.refunded_amount_cents
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// MAX_SAFE_INTEGER = 2^53 - 1. Our max is much smaller to match payment cap.
const MAX_REFUND_CENTS = 1_000_000_000; // €10,000,000 cap per single refund

export class RefundAmountError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'RefundAmountError';
  }
}

export interface RefundAmountValidation {
  ok: boolean;
  cents?: number;
  code?: string;
  message?: string;
}

/**
 * Validate a single refund amount input from the admin/operator.
 * Returns { ok, cents } or { ok: false, code, message }.
 */
export function validateRefundAmount(input: unknown): RefundAmountValidation {
  if (input === null || input === undefined) {
    return { ok: false, code: 'missing_amount', message: 'amount is required' };
  }
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n)) {
    return { ok: false, code: 'not_finite', message: 'amount must be a finite number' };
  }
  if (Number.isNaN(n)) {
    return { ok: false, code: 'nan', message: 'amount cannot be NaN' };
  }
  if (n === Infinity || n === -Infinity) {
    return { ok: false, code: 'infinity', message: 'amount cannot be infinity' };
  }
  if (n <= 0) {
    if (n === 0) return { ok: false, code: 'zero', message: 'amount must be greater than zero' };
    return { ok: false, code: 'negative', message: 'amount must be positive' };
  }
  if (!Number.isInteger(n)) {
    // Allow two decimal places at most
    const rounded = Math.round(n * 100);
    if (Math.abs(rounded / 100 - n) > 1e-9) {
      return { ok: false, code: 'precision', message: 'amount must have at most 2 decimal places' };
    }
    if (rounded > MAX_REFUND_CENTS) {
      return { ok: false, code: 'too_large', message: 'amount exceeds maximum' };
    }
    return { ok: true, cents: rounded };
  }
  if (n > Number.MAX_SAFE_INTEGER) {
    return { ok: false, code: 'unsafe_integer', message: 'amount exceeds safe integer range' };
  }
  if (n > MAX_REFUND_CENTS) {
    return { ok: false, code: 'too_large', message: 'amount exceeds maximum' };
  }
  return { ok: true, cents: n };
}

/**
 * Validate currency code (3-letter ISO 4217).
 */
export function validateCurrencyCode(input: unknown): { ok: boolean; code?: string; message?: string } {
  if (typeof input !== 'string') {
    return { ok: false, code: 'missing_currency', message: 'currency is required' };
  }
  if (!/^[A-Z]{3}$/.test(input)) {
    return { ok: false, code: 'invalid_currency', message: 'currency must be 3 uppercase letters' };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Server-side refund max computation
// ─────────────────────────────────────────────────────────────

export interface RefundMax {
  receivedCents: number;
  alreadyRefundedCents: number;
  pendingCents: number;
  failedCents: number;
  maxRefundableCents: number;
  canFullRefund: boolean;
  currency: string;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface RefundBalanceRow {
  status: string;
  requested_amount_cents: number | null;
  refunded_amount_cents: number | null;
}

/**
 * Compute the maximum refundable amount for an order.
 * Returns ok=false if the order is not in a refund-eligible state.
 */
export async function computeRefundMax(
  supabase: SupabaseClient,
  orderId: string,
): Promise<RefundMax> {
  // 1) Order must exist and be in a paid state
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, total, payment_status, payment_intent_id, customer_id, currency, status')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr) {
    return { ok: false, errorCode: 'order_lookup_failed', errorMessage: orderErr.message, receivedCents: 0, alreadyRefundedCents: 0, pendingCents: 0, failedCents: 0, maxRefundableCents: 0, canFullRefund: false, currency: 'EUR' };
  }
  if (!order) {
    return { ok: false, errorCode: 'order_not_found', errorMessage: 'Order not found', receivedCents: 0, alreadyRefundedCents: 0, pendingCents: 0, failedCents: 0, maxRefundableCents: 0, canFullRefund: false, currency: 'EUR' };
  }

  // 2) Order must have a payment_intent_id (refund requires a paid PaymentIntent)
  if (!order.payment_intent_id) {
    return { ok: false, errorCode: 'no_payment_intent', errorMessage: 'Order has no PaymentIntent (not paid)', receivedCents: 0, alreadyRefundedCents: 0, pendingCents: 0, failedCents: 0, maxRefundableCents: 0, canFullRefund: false, currency: 'EUR' };
  }

  // 3) Order must be in a "paid" or "partially_refunded" state (not pending/failed/cancelled)
  if (!['succeeded', 'paid', 'partially_refunded', 'refund_pending', 'refund_failed'].includes(order.payment_status ?? '')) {
    return { ok: false, errorCode: 'order_not_refundable', errorMessage: `Order payment_status '${order.payment_status}' is not refund-eligible`, receivedCents: 0, alreadyRefundedCents: 0, pendingCents: 0, failedCents: 0, maxRefundableCents: 0, canFullRefund: false, currency: 'EUR' };
  }

  // 4) Sum up existing refunds
  const { data: refundRows, error: refundErr } = await supabase
    .from('payment_refunds')
    .select('status, requested_amount_cents, refunded_amount_cents')
    .eq('order_id', orderId);

  if (refundErr) {
    return { ok: false, errorCode: 'refund_lookup_failed', errorMessage: refundErr.message, receivedCents: 0, alreadyRefundedCents: 0, pendingCents: 0, failedCents: 0, maxRefundableCents: 0, canFullRefund: false, currency: 'EUR' };
  }

  const receivedCents = Math.round(Number(order.total ?? 0) * 100);
  let alreadyRefundedCents = 0;
  let pendingCents = 0;
  let failedCents = 0;
  for (const r of (refundRows ?? []) as RefundBalanceRow[]) {
    const refunded = Number(r.refunded_amount_cents ?? 0);
    const requested = Number(r.requested_amount_cents ?? 0);
    if (r.status === 'succeeded') alreadyRefundedCents += refunded;
    else if (r.status === 'pending' || r.status === 'submitted' || r.status === 'validating' || r.status === 'requested') pendingCents += requested;
    else if (r.status === 'failed' || r.status === 'requires_review') failedCents += requested;
  }

  const maxRefundableCents = Math.max(0, receivedCents - alreadyRefundedCents - pendingCents);
  const currency = (typeof order.currency === 'string' && order.currency.length === 3) ? order.currency.toUpperCase() : 'EUR';
  const canFullRefund = receivedCents > 0 && alreadyRefundedCents + pendingCents === 0;

  return {
    ok: true,
    receivedCents,
    alreadyRefundedCents,
    pendingCents,
    failedCents,
    maxRefundableCents,
    canFullRefund,
    currency,
  };
}

/**
 * Compute the proposed refund amount for a partial or full refund.
 * `mode='full'` returns the full maxRefundable; `mode='partial'` validates
 * the requested amount.
 */
export function computeProposedRefund(
  mode: 'full' | 'partial',
  requestedAmountCents: number | undefined,
  max: RefundMax,
): { ok: boolean; cents?: number; code?: string; message?: string } {
  if (mode === 'full') {
    if (max.maxRefundableCents <= 0) {
      return { ok: false, code: 'nothing_to_refund', message: 'Order is already fully refunded or has no payment' };
    }
    if (!max.canFullRefund) {
      // Reject full refund if there are pending partial refunds
      return { ok: false, code: 'partial_refunds_in_flight', message: 'Cannot issue full refund while partial refunds are in flight' };
    }
    return { ok: true, cents: max.maxRefundableCents };
  }
  // partial
  if (requestedAmountCents === undefined || requestedAmountCents === null) {
    return { ok: false, code: 'amount_required_for_partial', message: 'amount_cents is required for partial refunds' };
  }
  const v = validateRefundAmount(requestedAmountCents);
  if (!v.ok) return v;
  if (v.cents! > max.maxRefundableCents) {
    return { ok: false, code: 'exceeds_remaining', message: `Refund amount exceeds remaining refundable amount (${max.maxRefundableCents})` };
  }
  if (max.maxRefundableCents <= 0) {
    return { ok: false, code: 'nothing_to_refund', message: 'Order is already fully refunded' };
  }
  return { ok: true, cents: v.cents! };
}
