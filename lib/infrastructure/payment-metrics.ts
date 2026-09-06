/**
 * Phase 7G-F — Production Observability Metrics
 * ─────────────────────────────────────────────
 * Centralized metric definitions for payment operations:
 *   - Payment outcomes (created, succeeded, failed)
 *   - Refund outcomes (created, succeeded, failed, partial)
 *   - Webhook processing (received, processed, rejected, dedup)
 *   - Retry attempts (by reason)
 *   - Recovery queue (enqueued, processed, stuck)
 *   - Latency: DB, Stripe, API
 *   - Error rate (by code and operation)
 *
 * All metrics are exposed via /api/metrics in Prometheus text format.
 */

import { registry } from '@/lib/observability/metrics';

// ============================================================================
// Payment metrics
// ============================================================================

export const paymentsCreated = registry.counter(
  'payments_created_total',
  'Total payment intents created'
);
export const paymentsSucceeded = registry.counter(
  'payments_succeeded_total',
  'Total payment intents that succeeded'
);
export const paymentsFailed = registry.counter(
  'payments_failed_total',
  'Total payment intents that failed'
);
export const paymentsAmountCents = registry.histogram(
  'payments_amount_cents',
  'Payment amount distribution in cents'
);
export const paymentLatencyMs = registry.histogram(
  'payment_latency_ms',
  'End-to-end payment latency (intent creation to confirmation)'
);

// ============================================================================
// Refund metrics
// ============================================================================

export const refundsCreated = registry.counter(
  'refunds_created_total',
  'Total refund operations initiated'
);
export const refundsSucceeded = registry.counter(
  'refunds_succeeded_total',
  'Total refunds that succeeded'
);
export const refundsFailed = registry.counter(
  'refunds_failed_total',
  'Total refunds that failed (Stripe or otherwise)'
);
export const refundsRejected = registry.counter(
  'refunds_rejected_total',
  'Total refunds rejected by validation (e.g. exceeds remaining)'
);
export const refundsAmountCents = registry.histogram(
  'refunds_amount_cents',
  'Refund amount distribution in cents'
);
export const refundLatencyMs = registry.histogram(
  'refund_latency_ms',
  'End-to-end refund latency (creation to succeeded state)'
);

// ============================================================================
// Webhook metrics
// ============================================================================

export const webhooksReceived = registry.counter(
  'webhooks_received_total',
  'Total webhook events received from Stripe'
);
export const webhooksProcessed = registry.counter(
  'webhooks_processed_total',
  'Total webhook events successfully processed'
);
export const webhooksRejected = registry.counter(
  'webhooks_rejected_total',
  'Total webhook events rejected (signature, dedup, or other)'
);
export const webhooksByType = registry.counter(
  'webhooks_by_type_total',
  'Webhook events by type (payment_intent.succeeded, charge.refunded, etc.)'
);
export const webhookLatencyMs = registry.histogram(
  'webhook_latency_ms',
  'Webhook processing latency in milliseconds'
);

// ============================================================================
// Recovery queue metrics
// ============================================================================

export const recoveryEnqueued = registry.counter(
  'recovery_enqueued_total',
  'Issues added to the recovery queue'
);
export const recoveryProcessed = registry.counter(
  'recovery_processed_total',
  'Issues successfully resolved by the recovery queue'
);
export const recoveryStuck = registry.counter(
  'recovery_stuck_total',
  'Issues that are stuck in the recovery queue'
);
export const recoveryByType = registry.counter(
  'recovery_by_type_total',
  'Recovery issues by type (burned_no_order, order_no_payment, etc.)'
);
export const recoveryDurationMs = registry.histogram(
  'recovery_duration_ms',
  'Recovery pass duration in milliseconds'
);

// ============================================================================
// Error rate metrics
// ============================================================================

export const errorRate = registry.counter(
  'errors_total',
  'Total errors (by component and code)'
);

export function recordError(component: string, code: string): void {
  errorRate.inc({ component, code });
}

// ============================================================================
// Convenience helpers
// ============================================================================

export interface PaymentOutcome {
  amountCents?: number;
  durationMs?: number;
  errorCode?: string;
  paymentMethod?: string;
}

export function recordPaymentSuccess(outcome: PaymentOutcome): void {
  paymentsSucceeded.inc({ paymentMethod: outcome.paymentMethod ?? 'unknown' });
  if (outcome.amountCents !== undefined) {
    paymentsAmountCents.observe(outcome.amountCents, { paymentMethod: outcome.paymentMethod ?? 'unknown' });
  }
  if (outcome.durationMs !== undefined) {
    paymentLatencyMs.observe(outcome.durationMs, { paymentMethod: outcome.paymentMethod ?? 'unknown' });
  }
}

export function recordPaymentFailure(outcome: PaymentOutcome): void {
  paymentsFailed.inc({
    paymentMethod: outcome.paymentMethod ?? 'unknown',
    code: outcome.errorCode ?? 'unknown',
  });
  recordError('payment', outcome.errorCode ?? 'unknown');
}

export interface RefundOutcome {
  amountCents?: number;
  durationMs?: number;
  errorCode?: string;
  mode: 'full' | 'partial';
}

export function recordRefundSuccess(outcome: RefundOutcome): void {
  refundsSucceeded.inc({ mode: outcome.mode });
  if (outcome.amountCents !== undefined) {
    refundsAmountCents.observe(outcome.amountCents, { mode: outcome.mode });
  }
  if (outcome.durationMs !== undefined) {
    refundLatencyMs.observe(outcome.durationMs, { mode: outcome.mode });
  }
}

export function recordRefundFailure(outcome: RefundOutcome): void {
  refundsFailed.inc({ mode: outcome.mode, code: outcome.errorCode ?? 'unknown' });
  recordError('refund', outcome.errorCode ?? 'unknown');
}

export function recordWebhookReceived(eventType: string): void {
  webhooksReceived.inc({ type: eventType });
}

export function recordWebhookProcessed(eventType: string, latencyMs: number): void {
  webhooksProcessed.inc({ type: eventType });
  webhooksByType.inc({ type: eventType });
  webhookLatencyMs.observe(latencyMs, { type: eventType });
}

export function recordWebhookRejected(eventType: string, reason: string): void {
  webhooksRejected.inc({ type: eventType, reason });
  recordError('webhook', reason);
}

export function recordRecoveryEnqueued(issueType: string): void {
  recoveryEnqueued.inc({ type: issueType });
  recoveryByType.inc({ type: issueType });
}

export function recordRecoveryProcessed(issueType: string, durationMs: number): void {
  recoveryProcessed.inc({ type: issueType });
  recoveryDurationMs.observe(durationMs, { type: issueType });
}
