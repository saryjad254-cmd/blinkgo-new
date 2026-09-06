/**
 * Refund State Machine
 * ─────────────────────
 * Phase 7G-D: deterministic, auditable state machine for refund operations.
 *
 * Internal states:
 *   requested         — refund request created by admin/recovery
 *   validating        — server is verifying amount, ownership, and balance
 *   submitted         — Stripe API call issued
 *   pending           — Stripe acknowledged, awaiting async confirmation
 *   succeeded         — verified by Stripe webhook
 *   failed            — Stripe rejected or refund failed
 *   canceled          — pre-submit cancellation
 *   requires_review   — manual admin review required
 *
 * Rules:
 *   - succeeded is a TERMINAL state. No transition out.
 *   - failed/canceled are TERMINAL.
 *   - requires_review is a TEMPORARY hold; admin must move to submitted, failed, or canceled.
 *   - Every transition is audited in refund_audit_log.
 *   - Server-only. No client code may bypass this.
 */

export type RefundStatus =
  | 'requested'
  | 'validating'
  | 'submitted'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'requires_review';

export const REFUND_STATUSES: ReadonlyArray<RefundStatus> = [
  'requested',
  'validating',
  'submitted',
  'pending',
  'succeeded',
  'failed',
  'canceled',
  'requires_review',
];

export const TERMINAL_REFUND_STATUSES: ReadonlyArray<RefundStatus> = [
  'succeeded',
  'failed',
  'canceled',
];

/**
 * Allowed transitions.
 * Key: from-state. Value: array of allowed to-states.
 * `succeeded`, `failed`, `canceled` are terminal: no entries.
 */
const ALLOWED_TRANSITIONS: Record<RefundStatus, ReadonlyArray<RefundStatus>> = {
  requested:         ['validating', 'submitted', 'failed', 'canceled', 'requires_review'],
  validating:        ['submitted', 'failed', 'canceled', 'requires_review'],
  submitted:         ['pending', 'succeeded', 'failed', 'requires_review'],
  pending:           ['succeeded', 'failed', 'requires_review'],
  requires_review:   ['submitted', 'succeeded', 'failed', 'canceled'],
  // terminal
  succeeded:         [],
  failed:            [],
  canceled:          [],
};

export function isAllowedTransition(from: RefundStatus, to: RefundStatus): boolean {
  if (from === to) return false; // no-op transitions are not allowed via this validator
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function isTerminalRefundStatus(s: RefundStatus): boolean {
  return TERMINAL_REFUND_STATUSES.includes(s);
}

export function assertAllowedTransition(from: RefundStatus, to: RefundStatus): void {
  if (!isAllowedTransition(from, to)) {
    throw new RefundTransitionError(from, to);
  }
}

export class RefundTransitionError extends Error {
  readonly code = 'refund_invalid_transition';
  readonly from: RefundStatus;
  readonly to: RefundStatus;
  constructor(from: RefundStatus, to: RefundStatus) {
    super(`Refund state transition not allowed: ${from} → ${to}`);
    this.from = from;
    this.to = to;
    this.name = 'RefundTransitionError';
  }
}

// ─────────────────────────────────────────────────────────────
// Stripe → internal mapping
// ─────────────────────────────────────────────────────────────

/**
 * Map a Stripe refund.status to our internal status.
 * Reference: https://stripe.com/docs/api/refunds/object#refund_object-status
 */
export function mapStripeRefundStatus(stripeStatus: string | null | undefined): RefundStatus {
  switch ((stripeStatus ?? '').toLowerCase()) {
    case 'pending':
      return 'pending';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'requires_action':
    case 'requires_payment_method':
      return 'requires_review';
    default:
      // Unknown Stripe status: treat as requires_review so an admin can act
      return 'requires_review';
  }
}

/**
 * Map a charge.refunded.amount_refunded total → order payment status.
 * Caller computes the aggregated amount and passes it.
 */
export function computeOrderPaymentStatus(
  receivedCents: number,
  refundedSucceededCents: number,
  refundedPendingCents: number,
  refundedFailedCents: number,
):
  | 'pending'
  | 'succeeded'
  | 'partially_refunded'
  | 'refund_pending'
  | 'refunded'
  | 'refund_failed'
  | 'failed' {
  if (receivedCents <= 0) return 'pending';
  if (refundedSucceededCents >= receivedCents && refundedPendingCents === 0 && refundedFailedCents === 0) {
    return 'refunded';
  }
  if (refundedSucceededCents > 0 && refundedSucceededCents < receivedCents) {
    return 'partially_refunded';
  }
  if (refundedPendingCents > 0 && refundedSucceededCents < receivedCents) {
    return 'refund_pending';
  }
  if (refundedFailedCents > 0 && refundedSucceededCents === 0) {
    return 'refund_failed';
  }
  return 'succeeded';
}

// ─────────────────────────────────────────────────────────────
// Stripe webhook event → refund action
// ─────────────────────────────────────────────────────────────

export type StripeRefundEvent =
  | 'refund.created'
  | 'refund.updated'
  | 'refund.failed'
  | 'charge.refunded'
  | 'charge.refund.updated';

/**
 * The set of Stripe events we accept. Anything else is acknowledged but ignored.
 */
export const SUPPORTED_STRIPE_REFUND_EVENTS: ReadonlyArray<StripeRefundEvent> = [
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.refunded',
  'charge.refund.updated',
];

export function isSupportedStripeRefundEvent(type: string): type is StripeRefundEvent {
  return (SUPPORTED_STRIPE_REFUND_EVENTS as ReadonlyArray<string>).includes(type);
}
