/**
 * Payment State Machine (Phase 7G-B)
 * ──────────────────────────────────────────────────
 * Deterministic state machine for the payment lifecycle.
 *
 * The state machine is the single source of truth for:
 *   - What state a draft/payment is in
 *   - What transitions are allowed
 *   - What state should be derived from a Stripe event
 *
 * Design principles:
 *   1. Every state transition is explicitly enumerated
 *   2. "Backwards" transitions (e.g. succeeded → processing) are rejected
 *   3. Every transition produces an audit log entry
 *   4. The state machine is pure (no I/O, no side effects)
 *   5. Terminal states (succeeded, failed, canceled, expired) can ONLY be
 *      reached from non-terminal states
 *
 * The state machine is the canonical contract between:
 *   - POST /api/stripe/checkout  (sets initial state)
 *   - POST /api/stripe/webhook   (drives state via Stripe events)
 *   - GET /api/checkout/confirm  (reads state for UI polling)
 *   - /api/cron/reconcile-payments (reconciles stuck states)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Payment lifecycle state for an Order Draft.
 *
 * State graph (see TRANSITIONS):
 *
 *   none ──create PI──▶ awaiting_payment_method
 *                              │
 *              ┌───────────────┼───────────────┐
 *              ▼               ▼               ▼
 *        processing      requires_action  succeeded ──▶ (order created)
 *              │               │
 *              ▼               ▼
 *   requires_payment_method  (customer retry)
 *              │
 *              ▼
 *     succeeded / failed / canceled
 *
 *   failed ──retry──▶ awaiting_payment_method
 *   canceled ──retry──▶ awaiting_payment_method
 *   expired (terminal): no retry, manual recovery
 */
export type PaymentState =
  | 'none'                       // No PaymentIntent yet
  | 'awaiting_payment_method'    // PI created, awaiting customer
  | 'requires_action'            // 3DS challenge required
  | 'requires_payment_method'    // Customer must provide new payment method
  | 'processing'                 // Bank is processing
  | 'succeeded'                  // Terminal: order must exist
  | 'failed'                     // Terminal: no order
  | 'canceled'                   // Terminal: no order
  | 'expired';                   // Terminal: no order (draft expired)

/**
 * Order lifecycle state (separate from payment state).
 */
export type OrderState =
  | 'not_created'                // Payment not yet succeeded
  | 'creating'                   // Burn + order create in progress
  | 'created'                    // Order exists with payment_intent_id
  | 'creation_failed';           // Order creation failed (recovery needed)

/**
 * Combined UI status — what the customer sees.
 */
export type UiStatus =
  | 'awaiting_payment'           // No PI yet
  | 'awaiting_payment_method'    // PI created, customer must enter card
  | 'requires_action'            // 3DS challenge required
  | 'processing'                 // Bank processing
  | 'paid'                       // Payment succeeded, order being created
  | 'order_created'              // Order exists
  | 'failed'                     // Payment failed
  | 'canceled'                   // Payment canceled
  | 'expired';                   // Draft expired

/**
 * Stripe webhook event types we handle.
 */
export type SupportedStripeEvent =
  | 'payment_intent.created'
  | 'payment_intent.processing'
  | 'payment_intent.requires_action'
  | 'payment_intent.requires_payment_method'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'payment_intent.canceled';

export const SUPPORTED_STRIPE_EVENTS: ReadonlyArray<SupportedStripeEvent> = [
  'payment_intent.created',
  'payment_intent.processing',
  'payment_intent.requires_action',
  'payment_intent.requires_payment_method',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
];

/**
 * Audit log status enum.
 */
export type AuditStatus =
  | 'intent_created'
  | 'intent_processing'
  | 'intent_requires_action'
  | 'intent_requires_payment_method'
  | 'intent_succeeded'
  | 'intent_failed'
  | 'intent_canceled'
  | 'draft_burned'
  | 'order_creation_started'
  | 'order_creation_failed'
  | 'order_created'
  | 'order_already_exists'
  | 'payment_received_draft_expired'
  | 'payment_received_draft_missing'
  | 'duplicate_event'
  | 'invalid_transition'
  | 'orphan_draft_detected'
  | 'orphan_order_detected'
  | 'reconciliation_completed'
  | 'error';

// ============================================================================
// State transitions
// ============================================================================

/**
 * Allowed transitions from one state to another.
 *
 * A transition is allowed if the target state is in the list.
 * Anything not listed is REJECTED.
 *
 * Invariants:
 *   - Terminal states (succeeded, failed, canceled, expired) cannot transition
 *     to any other state EXCEPT for retry flows (failed → awaiting_payment_method)
 *   - No backwards transitions (e.g. processing → awaiting_payment_method is
 *     NOT allowed; the customer must explicitly retry, which creates a new PI)
 *   - The 'none' state can only transition to 'awaiting_payment_method'
 */
const TRANSITIONS: Record<PaymentState, ReadonlyArray<PaymentState>> = {
  none: ['awaiting_payment_method'],
  awaiting_payment_method: [
    'processing',
    'requires_action',
    'requires_payment_method',
    'succeeded',
    'failed',
    'canceled',
  ],
  requires_action: [
    'processing',
    'succeeded',
    'failed',
    'canceled',
    'requires_payment_method',  // user canceled 3DS
  ],
  requires_payment_method: [
    'awaiting_payment_method',  // user provided new method
    'failed',
    'canceled',
  ],
  processing: [
    'requires_action',
    'requires_payment_method',
    'succeeded',
    'failed',
  ],
  succeeded: [],  // TERMINAL — no transitions out
  failed: ['awaiting_payment_method'],  // RETRY: customer starts over with new PI
  canceled: ['awaiting_payment_method'], // RETRY: customer starts over
  expired: [],  // TERMINAL — manual recovery only
};

export function isTerminalState(state: PaymentState): boolean {
  return state === 'succeeded' || state === 'expired';
}

export function isRetryAllowed(state: PaymentState): boolean {
  return state === 'failed' || state === 'canceled';
}

/**
 * Check if a transition from `from` to `to` is allowed.
 */
export function canTransition(from: PaymentState, to: PaymentState): boolean {
  if (from === to) return true;  // idempotent (e.g. webhook retry)
  return TRANSITIONS[from].includes(to);
}

export interface TransitionResult {
  ok: boolean;
  reason?: string;
  /** If !ok, what state should we ACTUALLY record in the audit log? */
  recordedState: PaymentState;
}

/**
 * Evaluate a transition with detailed reasoning.
 */
export function evaluateTransition(
  from: PaymentState,
  to: PaymentState,
  eventType: string,
): TransitionResult {
  if (from === to) {
    return { ok: true, recordedState: to };
  }
  if (!canTransition(from, to)) {
    return {
      ok: false,
      reason: `Invalid transition from "${from}" to "${to}" for event "${eventType}". Allowed from "${from}": [${TRANSITIONS[from].join(', ')}]`,
      recordedState: from,
    };
  }
  return { ok: true, recordedState: to };
}

/**
 * Get all allowed target states from a given state.
 */
export function allowedTransitionsFrom(from: PaymentState): ReadonlyArray<PaymentState> {
  return TRANSITIONS[from];
}

// ============================================================================
// Stripe event → PaymentState mapping
// ============================================================================

/**
 * Map a Stripe webhook event type to the target PaymentState.
 * If the event type is not one we handle, returns null.
 */
export function derivePaymentStateFromStripeEvent(
  stripeEventType: string,
  stripeEventStatus?: string,
): PaymentState | null {
  switch (stripeEventType) {
    case 'payment_intent.created':
      return 'awaiting_payment_method';
    case 'payment_intent.processing':
      return 'processing';
    case 'payment_intent.requires_action':
      return 'requires_action';
    case 'payment_intent.requires_payment_method':
      return 'requires_payment_method';
    case 'payment_intent.succeeded':
      return 'succeeded';
    case 'payment_intent.payment_failed':
      return 'failed';
    case 'payment_intent.canceled':
      return 'canceled';
    default:
      return null;
  }
}

/**
 * Map an audit log status (from the audit log table) back to a PaymentState.
 */
export function paymentStateFromAuditStatus(auditStatus: string): PaymentState {
  switch (auditStatus) {
    case 'intent_created':
      return 'awaiting_payment_method';
    case 'intent_processing':
      return 'processing';
    case 'intent_requires_action':
      return 'requires_action';
    case 'intent_requires_payment_method':
      return 'requires_payment_method';
    case 'intent_succeeded':
    case 'order_creation_started':
    case 'order_created':
    case 'order_already_exists':
      return 'succeeded';
    case 'intent_failed':
    case 'order_creation_failed':
      return 'failed';
    case 'intent_canceled':
      return 'canceled';
    case 'payment_received_draft_expired':
    case 'payment_received_draft_missing':
      return 'expired';
    case 'duplicate_event':
    case 'error':
    case 'invalid_transition':
      // These don't change state; preserve current
      return 'awaiting_payment_method';
    default:
      return 'awaiting_payment_method';
  }
}

/**
 * Map an audit log status to a customer-facing UI status.
 */
export function auditStatusToUiStatus(auditStatus: string): UiStatus {
  switch (auditStatus) {
    case 'intent_created':
      return 'awaiting_payment_method';
    case 'intent_processing':
      return 'processing';
    case 'intent_requires_action':
      return 'requires_action';
    case 'intent_requires_payment_method':
      return 'awaiting_payment_method';
    case 'intent_succeeded':
    case 'order_creation_started':
      return 'paid';
    case 'order_created':
    case 'order_already_exists':
      return 'order_created';
    case 'order_creation_failed':
    case 'intent_failed':
      return 'failed';
    case 'intent_canceled':
      return 'canceled';
    case 'payment_received_draft_expired':
    case 'payment_received_draft_missing':
      return 'expired';
    default:
      return 'processing';
  }
}

// ============================================================================
// Order-Payment consistency check
// ============================================================================

export interface ConsistencyCheck {
  consistent: boolean;
  reason?: string;
  /** If inconsistent, what action should be taken? */
  action: 'none' | 'wait_for_webhook' | 'create_order' | 'queue_recovery' | 'flag_admin';
}

/**
 * Check if the payment state is consistent with the order state.
 *
 * Invariants (from the architecture):
 *   - If payment succeeded, order MUST exist (eventually)
 *   - If payment failed, order MUST NOT exist
 *   - If payment canceled, draft remains recoverable until expiration
 *   - If payment expired, NO order (manual recovery)
 */
export function checkOrderPaymentConsistency(
  paymentState: PaymentState,
  orderExists: boolean,
  draftBurned: boolean,
): ConsistencyCheck {
  // Terminal state: succeeded
  if (paymentState === 'succeeded') {
    if (orderExists) {
      return { consistent: true, action: 'none' };
    }
    if (draftBurned) {
      // Burned but no order — webhook may have crashed between burn and order create
      return {
        consistent: false,
        reason: 'payment_succeeded_but_no_order_draft_burned',
        action: 'create_order',
      };
    }
    // Not yet burned — webhook is still in progress
    return { consistent: true, action: 'wait_for_webhook' };
  }

  // Terminal state: failed / canceled
  if (paymentState === 'failed' || paymentState === 'canceled') {
    if (orderExists) {
      return {
        consistent: false,
        reason: `${paymentState}_but_order_exists`,
        action: 'flag_admin',
      };
    }
    return { consistent: true, action: 'none' };
  }

  // Terminal state: expired (manual recovery)
  if (paymentState === 'expired') {
    if (orderExists) {
      return {
        consistent: false,
        reason: 'expired_but_order_exists',
        action: 'flag_admin',
      };
    }
    return { consistent: true, action: 'none' };
  }

  // Non-terminal: draft not yet burned
  if (orderExists) {
    return {
      consistent: false,
      reason: `${paymentState}_but_order_exists_unexpectedly`,
      action: 'flag_admin',
    };
  }
  return { consistent: true, action: 'none' };
}

// ============================================================================
// Validation: comprehensive list of supported events
// ============================================================================

/**
 * Returns true if the event type is one we explicitly handle.
 * Unknown event types are logged and acknowledged (200) but not processed.
 */
export function isSupportedStripeEvent(eventType: string): eventType is SupportedStripeEvent {
  return SUPPORTED_STRIPE_EVENTS.includes(eventType as SupportedStripeEvent);
}

/**
 * All PaymentStates for iteration (e.g. for test coverage).
 */
export const ALL_PAYMENT_STATES: ReadonlyArray<PaymentState> = [
  'none',
  'awaiting_payment_method',
  'requires_action',
  'requires_payment_method',
  'processing',
  'succeeded',
  'failed',
  'canceled',
  'expired',
];
