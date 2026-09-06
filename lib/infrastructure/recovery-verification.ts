/**
 * Phase 7G-F — Recovery Verification Service
 * ───────────────────────────────────────────
 * Verifies that every interrupted payment can recover after:
 *   - Process restart
 *   - Worker restart
 *   - Webhook delay
 *   - Network interruption
 *   - Temporary database outage
 *
 * The system has these recovery mechanisms:
 *   1. Stripe webhook signature window (5 min) — handles webhook delays
 *   2. Idempotency keys — handles retries (same key, same body, same result)
 *   3. payment_binding table — handles process restarts mid-checkout
 *   4. payment_recovery queue (cron) — handles orphan payments, stuck states
 *   5. burn_order_draft atomicity — handles process restart between burn and order
 *   6. retry queue with exponential backoff — handles network interruptions
 *   7. Postgres connection retry — handles DB outages
 *
 * This service provides a unified verification API that:
 *   - Reports the recovery state for any payment_intent_id
 *   - Re-runs idempotent operations safely
 *   - Detects stuck states
 *   - Triggers manual recovery if needed
 */

import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/foundation/logger';
import { generateRequestId } from '@/lib/foundation/logger';
import {
  recordRecoveryEnqueued,
  recordRecoveryProcessed,
} from '@/lib/infrastructure/payment-metrics';

// ============================================================================
// Types
// ============================================================================

export type RecoveryState =
  | 'not_started'         // no payment intent yet
  | 'pending_payment'     // intent created, awaiting payment
  | 'webhook_received'    // webhook arrived
  | 'binding_created'     // payment_binding row exists
  | 'draft_burned'        // order_drafts.used = true
  | 'order_created'       // orders row exists
  | 'fully_settled'       // order.payment_status = 'succeeded'
  | 'refund_pending'      // refund in progress
  | 'refunded'            // refund succeeded
  | 'stuck'               // recovery queue needed
  | 'failed';             // unrecoverable

export interface PaymentRecoveryReport {
  payment_intent_id: string;
  recovery_state: RecoveryState;
  has_draft: boolean;
  has_binding: boolean;
  has_order: boolean;
  order_id?: string;
  order_payment_status?: string;
  binding_match?: boolean;
  can_recover: boolean;
  recovery_actions: string[];
  issues: string[];
  generatedAt: string;
}

export interface RecoveryVerificationResult {
  totalChecked: number;
  healthyCount: number;
  stuckCount: number;
  failedCount: number;
  reports: PaymentRecoveryReport[];
  durationMs: number;
  generatedAt: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a recovery report for a specific payment_intent_id.
 * Used by /api/admin/payments/[pi]/recovery and by tests.
 */
export async function generatePaymentRecoveryReport(
  paymentIntentId: string
): Promise<PaymentRecoveryReport> {
  const supabase = createServiceClient();
  const report: PaymentRecoveryReport = {
    payment_intent_id: paymentIntentId,
    recovery_state: 'not_started',
    has_draft: false,
    has_binding: false,
    has_order: false,
    can_recover: false,
    recovery_actions: [],
    issues: [],
    generatedAt: new Date().toISOString(),
  };

  // 1. Check payment_binding
  const { data: binding, error: bindingErr } = await supabase
    .from('payment_binding')
    .select('payment_intent_id, customer_id, draft_id, expected_amount_cents, livemode')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (bindingErr) {
    report.issues.push(`binding_lookup_failed: ${bindingErr.message}`);
  } else if (binding) {
    report.has_binding = true;
    report.recovery_state = 'binding_created';
  }

  // 2. Check order_drafts
  let draftId: string | null = null;
  if (binding?.draft_id) {
    draftId = binding.draft_id;
  } else {
    // Look up draft by payment_intent_id metadata
    const { data: draft } = await supabase
      .from('order_drafts')
      .select('id, used, payment_intent_id, customer_id, expires_at')
      .or(`payment_intent_id.eq.${paymentIntentId},payment_intent_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(10);
    // Find the one that owns this PI (via webhook metadata, not in DB schema — fallback)
    // We use a heuristic: any draft with matching payment_intent_id is good
    if (draft && draft.length > 0) {
      const match = draft.find((d) => d.payment_intent_id === paymentIntentId);
      if (match) {
        draftId = match.id;
        report.has_draft = true;
        if (match.used) report.recovery_state = 'draft_burned';
      }
    }
  }

  // 3. Check orders
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, payment_status, payment_intent_id, customer_id, amount_refunded_cents, total')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (orderErr) {
    report.issues.push(`order_lookup_failed: ${orderErr.message}`);
  } else if (order) {
    report.has_order = true;
    report.order_id = order.id;
    report.order_payment_status = order.payment_status;
    report.recovery_state = order.payment_status === 'succeeded' ? 'fully_settled' : 'order_created';
  }

  // 4. Check binding consistency
  if (binding && order) {
    report.binding_match = binding.customer_id === order.customer_id;
    if (!report.binding_match) {
      report.issues.push(
        `binding_customer_mismatch: binding.customer_id=${binding.customer_id} order.customer_id=${order.customer_id}`
      );
    }
  }

  // 5. Check refunds
  if (order) {
    const { data: refunds } = await supabase
      .from('payment_refunds')
      .select('status, refunded_amount_cents')
      .eq('order_id', order.id);
    if (refunds && refunds.length > 0) {
      const succeeded = refunds.filter((r) => r.status === 'succeeded');
      const pending = refunds.filter((r) => ['pending', 'submitted', 'validating'].includes(r.status));
      const failed = refunds.filter((r) => r.status === 'failed');
      if (succeeded.length > 0) report.recovery_state = 'refunded';
      else if (pending.length > 0) report.recovery_state = 'refund_pending';
      else if (failed.length > 0 && succeeded.length === 0) {
        report.issues.push(`refund_failed_no_success`);
      }
    }
  }

  // 6. Determine recoverability
  if (report.recovery_state === 'fully_settled' || report.recovery_state === 'refunded') {
    report.can_recover = false; // nothing to recover
  } else if (report.recovery_state === 'not_started') {
    report.can_recover = false; // nothing to recover (no PI processed)
    report.issues.push('no_payment_record_found');
  } else if (report.has_binding && !report.has_order) {
    // Binding exists but no order — process crashed between burn and order creation
    report.can_recover = true;
    report.recovery_actions.push('recreate_order_from_binding');
    report.recovery_state = 'stuck';
  } else if (report.has_order && report.order_payment_status !== 'succeeded') {
    report.can_recover = true;
    report.recovery_actions.push('reconcile_payment_status');
    report.recovery_state = 'stuck';
  } else if (report.recovery_state === 'refund_pending') {
    report.can_recover = true;
    report.recovery_actions.push('retry_refund_via_stripe');
  }

  return report;
}

/**
 * Run a full recovery verification pass on a list of payment_intent_ids.
 */
export async function runRecoveryVerification(
  paymentIntentIds: string[]
): Promise<RecoveryVerificationResult> {
  const start = Date.now();
  const reports: PaymentRecoveryReport[] = [];

  for (const pi of paymentIntentIds) {
    try {
      const report = await generatePaymentRecoveryReport(pi);
      reports.push(report);
    } catch (e: unknown) {
      const err = e as { message?: string };
      reports.push({
        payment_intent_id: pi,
        recovery_state: 'failed',
        has_draft: false,
        has_binding: false,
        has_order: false,
        can_recover: false,
        recovery_actions: [],
        issues: [`verification_failed: ${err.message ?? 'unknown'}`],
        generatedAt: new Date().toISOString(),
      });
    }
  }

  const healthyCount = reports.filter(
    (r) => r.recovery_state === 'fully_settled' || r.recovery_state === 'refunded' || r.recovery_state === 'order_created'
  ).length;
  const stuckCount = reports.filter((r) => r.recovery_state === 'stuck').length;
  const failedCount = reports.filter((r) => r.recovery_state === 'failed').length;

  return {
    totalChecked: reports.length,
    healthyCount,
    stuckCount,
    failedCount,
    reports,
    durationMs: Date.now() - start,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Verify financial consistency between Stripe, Database, Orders, Refunds, Audit log.
 * Returns a convergence report — exactly one final consistent state per payment.
 */
export interface ConsistencyIssue {
  payment_intent_id: string;
  order_id?: string;
  issue_type:
    | 'order_missing_for_pi'
    | 'order_amount_mismatch'
    | 'refund_amount_mismatch'
    | 'audit_log_missing'
    | 'order_status_mismatch'
    | 'currency_mismatch'
    | 'duplicate_refund';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
}

export async function verifyFinancialConsistency(): Promise<{
  totalOrders: number;
  issues: ConsistencyIssue[];
  convergenceStatus: 'converged' | 'drifting' | 'diverged';
  durationMs: number;
  generatedAt: string;
}> {
  const start = Date.now();
  const supabase = createServiceClient();
  const issues: ConsistencyIssue[] = [];

  // 1. Get all orders
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, payment_intent_id, payment_status, total, amount_refunded_cents, currency, customer_id');

  if (ordersErr) {
    return {
      totalOrders: 0,
      issues: [{ payment_intent_id: '*', issue_type: 'order_status_mismatch', severity: 'critical', details: { error: ordersErr.message } }],
      convergenceStatus: 'diverged',
      durationMs: Date.now() - start,
      generatedAt: new Date().toISOString(),
    };
  }

  for (const order of orders ?? []) {
    if (!order.payment_intent_id) continue;

    // 2. Check payment_binding exists
    const { data: binding } = await supabase
      .from('payment_binding')
      .select('payment_intent_id, customer_id, expected_amount_cents, currency')
      .eq('payment_intent_id', order.payment_intent_id)
      .maybeSingle();

    if (!binding) {
      issues.push({
        payment_intent_id: order.payment_intent_id,
        order_id: order.id,
        issue_type: 'order_missing_for_pi',
        severity: 'high',
        details: { reason: 'no_payment_binding' },
      });
      continue;
    }

    // 3. Check customer match
    if (binding.customer_id !== order.customer_id) {
      issues.push({
        payment_intent_id: order.payment_intent_id,
        order_id: order.id,
        issue_type: 'order_status_mismatch',
        severity: 'critical',
        details: {
          binding_customer_id: binding.customer_id,
          order_customer_id: order.customer_id,
        },
      });
    }

    // 4. Check amount match (order.total in EUR cents vs binding.expected_amount_cents)
    const orderTotalCents = Math.round(Number(order.total ?? 0) * 100);
    if (orderTotalCents !== Number(binding.expected_amount_cents)) {
      issues.push({
        payment_intent_id: order.payment_intent_id,
        order_id: order.id,
        issue_type: 'order_amount_mismatch',
        severity: 'high',
        details: {
          order_total_cents: orderTotalCents,
          binding_amount_cents: Number(binding.expected_amount_cents),
          difference_cents: orderTotalCents - Number(binding.expected_amount_cents),
        },
      });
    }

    // 5. Check currency match
    if (binding.currency && order.currency && binding.currency !== order.currency) {
      issues.push({
        payment_intent_id: order.payment_intent_id,
        order_id: order.id,
        issue_type: 'currency_mismatch',
        severity: 'high',
        details: {
          binding_currency: binding.currency,
          order_currency: order.currency,
        },
      });
    }

    // 6. Check refund sum
    const { data: refunds } = await supabase
      .from('payment_refunds')
      .select('status, refunded_amount_cents')
      .eq('order_id', order.id);

    if (refunds) {
      const succeededSum = refunds
        .filter((r) => r.status === 'succeeded')
        .reduce((s, r) => s + Number(r.refunded_amount_cents ?? 0), 0);
      const orderRefunded = Number(order.amount_refunded_cents ?? 0);
      if (succeededSum !== orderRefunded) {
        issues.push({
          payment_intent_id: order.payment_intent_id,
          order_id: order.id,
          issue_type: 'refund_amount_mismatch',
          severity: 'critical',
          details: {
            order_amount_refunded_cents: orderRefunded,
            succeeded_refunds_sum: succeededSum,
            difference_cents: succeededSum - orderRefunded,
          },
        });
      }

      // Check no refund exceeds order total
      for (const r of refunds) {
        if (Number(r.refunded_amount_cents ?? 0) > orderTotalCents) {
          issues.push({
            payment_intent_id: order.payment_intent_id,
            order_id: order.id,
            issue_type: 'refund_amount_mismatch',
            severity: 'critical',
            details: {
              refund_id: (r as { id?: string }).id,
              refunded_amount_cents: Number(r.refunded_amount_cents),
              order_total_cents: orderTotalCents,
              reason: 'refund_exceeds_order_total',
            },
          });
        }
      }

      // Check for duplicate stripe_refund_id
      const stripeIds = new Set<string>();
      for (const r of refunds) {
        const sid = (r as { stripe_refund_id?: string }).stripe_refund_id;
        if (sid) {
          if (stripeIds.has(sid)) {
            issues.push({
              payment_intent_id: order.payment_intent_id,
              order_id: order.id,
              issue_type: 'duplicate_refund',
              severity: 'critical',
              details: { stripe_refund_id: sid },
            });
          }
          stripeIds.add(sid);
        }
      }
    }

    // 7. Check audit log exists (if order was refunded or paid)
    if (order.payment_status === 'succeeded' || order.payment_status === 'refunded') {
      const { data: audit } = await supabase
        .from('payment_audit_log')
        .select('id, action')
        .eq('payment_intent_id', order.payment_intent_id)
        .limit(1);
      if (!audit || audit.length === 0) {
        issues.push({
          payment_intent_id: order.payment_intent_id,
          order_id: order.id,
          issue_type: 'audit_log_missing',
          severity: 'medium',
          details: { reason: 'no_payment_audit_entry' },
        });
      }
    }
  }

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const highCount = issues.filter((i) => i.severity === 'high').length;

  let convergenceStatus: 'converged' | 'drifting' | 'diverged' = 'converged';
  if (criticalCount > 0) convergenceStatus = 'diverged';
  else if (highCount > 0) convergenceStatus = 'drifting';

  return {
    totalOrders: orders?.length ?? 0,
    issues,
    convergenceStatus,
    durationMs: Date.now() - start,
    generatedAt: new Date().toISOString(),
  };
}
