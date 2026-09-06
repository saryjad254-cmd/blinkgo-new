/**
 * Payment Recovery (Phase 7G-B)
 * ──────────────────────────────────────────────────
 * Reconciliation logic for the payment system.
 *
 * This service handles:
 *   - "Burned but no order" — draft.used=true but orders.payment_intent_id
 *     does not exist. The webhook may have crashed between burn and order
 *     creation. We need to retry the order creation.
 *   - "Order without payment" — orders.payment_status is not 'succeeded'
 *     but a payment_intent_id is set. This is a data integrity issue.
 *   - "Stuck states" — drafts that have been in 'awaiting_payment_method'
 *     or 'processing' for too long.
 *
 * This service is called by:
 *   - /api/cron/reconcile-payments (scheduled via Vercel Cron / pg_cron)
 *   - Manually by an admin (POST /api/admin/reconcile-payments)
 *   - From the webhook handler (best-effort, after successful event processing)
 *
 * Invariants (from architecture):
 *   - If payment succeeded, order must eventually exist.
 *   - If payment failed, order must never exist.
 *   - Idempotency: re-running the reconciliation must be safe.
 */
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import {
  writeAuditLog,
  enqueueReconciliation,
} from '@/lib/services/stripe-service';

type ServiceClient = ReturnType<typeof createServiceClient>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ============================================================================
// Constants
// ============================================================================

/** How long a draft can be in 'awaiting_payment_method' before being considered stuck (ms) */
const STUCK_AWAITING_PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutes

/** How long a draft can be in 'processing' before being considered stuck (ms) */
const STUCK_PROCESSING_TIMEOUT_MS = 24 * 60 * 60 * 1000;  // 24 hours

// ============================================================================
// Types
// ============================================================================

export interface ReconciliationIssue {
  type: 'burned_no_order' | 'order_no_payment' | 'stuck_awaiting_payment'
    | 'stuck_processing' | 'orphan_payment_intent' | 'state_machine_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  draft_id?: string;
  payment_intent_id?: string;
  order_id?: string;
  customer_id?: string;
  details: Record<string, unknown>;
  detected_at: string;
}

export interface ReconciliationResult {
  scanned: number;
  issues_found: number;
  issues_queued: number;
  issues_by_type: Record<string, number>;
  duration_ms: number;
  errors: string[];
}

interface RecoveryDraftLine {
  product_id: string;
  product_name: string;
  unit_price: number;
  line_subtotal: number;
  quantity: number;
  config_key: string;
  configuration: Record<string, unknown>;
}

interface RecoveryDraftBody {
  lines: RecoveryDraftLine[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tip: number;
  discount: number;
  points_discount: number;
  total: number;
  payment_method: 'stripe' | 'card';
  delivery_address: Record<string, unknown> | null;
  scheduled_for: string | null;
  fulfillment_type: 'delivery' | 'pickup';
}

function parseRecoveryDraft(value: unknown): RecoveryDraftBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (!Array.isArray(draft.lines) || draft.lines.length === 0) return null;

  const lines: RecoveryDraftLine[] = [];
  for (const valueLine of draft.lines) {
    if (!valueLine || typeof valueLine !== 'object' || Array.isArray(valueLine)) return null;
    const line = valueLine as Record<string, unknown>;
    if (typeof line.product_id !== 'string' || typeof line.product_name !== 'string' || typeof line.config_key !== 'string') return null;
    if (![line.unit_price, line.line_subtotal, line.quantity].every((number) => typeof number === 'number' && Number.isFinite(number))) return null;
    if ((line.quantity as number) <= 0 || !Number.isInteger(line.quantity)) return null;
    const configuration = line.configuration && typeof line.configuration === 'object' && !Array.isArray(line.configuration)
      ? line.configuration as Record<string, unknown>
      : {};
    lines.push({
      product_id: line.product_id,
      product_name: line.product_name,
      unit_price: line.unit_price as number,
      line_subtotal: line.line_subtotal as number,
      quantity: line.quantity as number,
      config_key: line.config_key,
      configuration,
    });
  }

  const moneyKeys = ['subtotal', 'delivery_fee', 'service_fee', 'tip', 'discount', 'points_discount', 'total'] as const;
  if (!moneyKeys.every((key) => typeof draft[key] === 'number' && Number.isFinite(draft[key]) && (draft[key] as number) >= 0)) return null;
  if (draft.payment_method !== 'stripe' && draft.payment_method !== 'card') return null;
  if (draft.fulfillment_type !== 'delivery' && draft.fulfillment_type !== 'pickup') return null;
  const deliveryAddress = draft.delivery_address === null
    ? null
    : draft.delivery_address && typeof draft.delivery_address === 'object' && !Array.isArray(draft.delivery_address)
      ? draft.delivery_address as Record<string, unknown>
      : null;
  if (draft.fulfillment_type === 'delivery' && !deliveryAddress) return null;
  if (draft.scheduled_for !== null && typeof draft.scheduled_for !== 'string') return null;

  return {
    lines,
    subtotal: draft.subtotal as number,
    delivery_fee: draft.delivery_fee as number,
    service_fee: draft.service_fee as number,
    tip: draft.tip as number,
    discount: draft.discount as number,
    points_discount: draft.points_discount as number,
    total: draft.total as number,
    payment_method: draft.payment_method,
    delivery_address: deliveryAddress,
    scheduled_for: draft.scheduled_for,
    fulfillment_type: draft.fulfillment_type,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run a full reconciliation pass.
 * Returns a summary of what was found and what was queued.
 */
export async function runReconciliation(opts: {
  dryRun?: boolean;
  nowMs?: number;
} = {}): Promise<ReconciliationResult> {
  const start = Date.now();
  const supabase = createServiceClient();
  const now = opts.nowMs ?? Date.now();
  const result: ReconciliationResult = {
    scanned: 0,
    issues_found: 0,
    issues_queued: 0,
    issues_by_type: {},
    duration_ms: 0,
    errors: [],
  };

  // 1) Find "burned but no order" drafts
  await scanBurnedNoOrder(supabase, result, opts, now);

  // 2) Find "order without succeeded payment"
  await scanOrderNoPayment(supabase, result, opts);

  // 3) Find "stuck awaiting_payment_method" drafts
  await scanStuckStates(supabase, result, opts, now);

  // 4) Find "stuck processing" drafts
  await scanStuckProcessing(supabase, result, opts, now);

  // 5) Find orphan PaymentIntents (no draft)
  await scanOrphanPaymentIntents(supabase, result, opts);

  result.duration_ms = Date.now() - start;
  logger.info('payment.reconciliation.run_completed', {
    scanned: result.scanned,
    issues_found: result.issues_found,
    issues_queued: result.issues_queued,
    duration_ms: result.duration_ms,
  });
  return result;
}

// ============================================================================
// Scanners
// ============================================================================

async function scanBurnedNoOrder(
  supabase: ServiceClient,
  result: ReconciliationResult,
  opts: { dryRun?: boolean },
  now: number,
): Promise<void> {
  try {
    // Find drafts that are burned but don't have an order with their payment_intent_id
    const { data: drafts, error } = await supabase
      .from('order_drafts')
      .select('id, customer_id, payment_intent_id, payment_status, used_at, last_payment_event_at')
      .eq('used', true)
      .not('payment_intent_id', 'is', null);
    if (error) {
      result.errors.push(`scanBurnedNoOrder: ${error.message}`);
      return;
    }
    result.scanned += (drafts ?? []).length;
    for (const draft of drafts ?? []) {
      // Check if an order exists for this payment_intent_id
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('payment_intent_id', draft.payment_intent_id)
        .maybeSingle();
      if (!order) {
        result.issues_found++;
        result.issues_by_type['burned_no_order'] = (result.issues_by_type['burned_no_order'] ?? 0) + 1;
        if (!opts.dryRun) {
          await enqueueReconciliation({
            issue_type: 'burned_no_order',
            draft_id: draft.id,
            payment_intent_id: draft.payment_intent_id,
            customer_id: draft.customer_id,
            details: {
              used_at: draft.used_at,
              last_payment_event_at: draft.last_payment_event_at,
              payment_status: draft.payment_status,
              detected_at: new Date(now).toISOString(),
              recovery_action: 'create_order_from_draft',
            },
          });
          await writeAuditLog({
            payment_intent_id: draft.payment_intent_id,
            customer_id: draft.customer_id,
            draft_id: draft.id,
            status: 'orphan_draft_detected',
            idempotency_key: `reconcile:burned_no_order:${draft.id}:${now}`,
            metadata: { reconciliation: 'auto', detected_at: new Date(now).toISOString() },
          });
          result.issues_queued++;
        }
      }
    }
  } catch (error: unknown) {
    result.errors.push(`scanBurnedNoOrder: ${errorMessage(error)}`);
  }
}

async function scanOrderNoPayment(
  supabase: ServiceClient,
  result: ReconciliationResult,
  opts: { dryRun?: boolean },
): Promise<void> {
  try {
    // Find orders that have a payment_intent_id but payment_status is not 'succeeded'
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, customer_id, payment_intent_id, payment_status, created_at')
      .not('payment_intent_id', 'is', null)
      .neq('payment_status', 'succeeded')
      .limit(100);
    if (error) {
      result.errors.push(`scanOrderNoPayment: ${error.message}`);
      return;
    }
    result.scanned += (orders ?? []).length;
    for (const order of orders ?? []) {
      // Check if the latest audit log shows a succeeded payment
      const { data: audit } = await supabase
        .from('payment_audit_log')
        .select('status')
        .eq('payment_intent_id', order.payment_intent_id)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastStatus = audit?.[0]?.status;
      if (lastStatus !== 'order_created' && lastStatus !== 'intent_succeeded' && lastStatus !== 'draft_burned') {
        result.issues_found++;
        result.issues_by_type['order_no_payment'] = (result.issues_by_type['order_no_payment'] ?? 0) + 1;
        if (!opts.dryRun) {
          await enqueueReconciliation({
            issue_type: 'order_no_payment',
            order_id: order.id,
            payment_intent_id: order.payment_intent_id,
            customer_id: order.customer_id,
            details: {
              order_payment_status: order.payment_status,
              last_audit_status: lastStatus,
              recovery_action: 'flag_admin',
            },
          });
          result.issues_queued++;
        }
      }
    }
  } catch (error: unknown) {
    result.errors.push(`scanOrderNoPayment: ${errorMessage(error)}`);
  }
}

async function scanStuckStates(
  supabase: ServiceClient,
  result: ReconciliationResult,
  opts: { dryRun?: boolean },
  now: number,
): Promise<void> {
  try {
    // Find drafts in 'awaiting_payment_method' for too long
    const { data: stuck, error } = await supabase
      .from('order_drafts')
      .select('id, customer_id, payment_intent_id, payment_status, last_payment_event_at, created_at')
      .eq('payment_status', 'awaiting_payment_method')
      .eq('used', false)
      .limit(200);
    if (error) {
      result.errors.push(`scanStuckStates: ${error.message}`);
      return;
    }
    for (const draft of stuck ?? []) {
      const since = draft.last_payment_event_at
        ? new Date(draft.last_payment_event_at).getTime()
        : new Date(draft.created_at).getTime();
      const age = now - since;
      if (age > STUCK_AWAITING_PAYMENT_TIMEOUT_MS) {
        result.issues_found++;
        result.issues_by_type['stuck_awaiting_payment'] = (result.issues_by_type['stuck_awaiting_payment'] ?? 0) + 1;
        if (!opts.dryRun) {
          await enqueueReconciliation({
            issue_type: 'stuck_awaiting_payment',
            draft_id: draft.id,
            payment_intent_id: draft.payment_intent_id,
            customer_id: draft.customer_id,
            details: {
              age_ms: age,
              last_event_at: draft.last_payment_event_at,
              recovery_action: 'flag_admin',
            },
          });
          result.issues_queued++;
        }
      }
    }
  } catch (error: unknown) {
    result.errors.push(`scanStuckStates: ${errorMessage(error)}`);
  }
}

async function scanStuckProcessing(
  supabase: ServiceClient,
  result: ReconciliationResult,
  opts: { dryRun?: boolean },
  now: number,
): Promise<void> {
  try {
    const { data: stuck, error } = await supabase
      .from('order_drafts')
      .select('id, customer_id, payment_intent_id, last_payment_event_at, created_at')
      .eq('payment_status', 'processing')
      .eq('used', false)
      .limit(200);
    if (error) {
      result.errors.push(`scanStuckProcessing: ${error.message}`);
      return;
    }
    for (const draft of stuck ?? []) {
      const since = draft.last_payment_event_at
        ? new Date(draft.last_payment_event_at).getTime()
        : new Date(draft.created_at).getTime();
      const age = now - since;
      if (age > STUCK_PROCESSING_TIMEOUT_MS) {
        result.issues_found++;
        result.issues_by_type['stuck_processing'] = (result.issues_by_type['stuck_processing'] ?? 0) + 1;
        if (!opts.dryRun) {
          await enqueueReconciliation({
            issue_type: 'stuck_processing',
            draft_id: draft.id,
            payment_intent_id: draft.payment_intent_id,
            customer_id: draft.customer_id,
            details: {
              age_ms: age,
              recovery_action: 'flag_admin',
            },
          });
          result.issues_queued++;
        }
      }
    }
  } catch (error: unknown) {
    result.errors.push(`scanStuckProcessing: ${errorMessage(error)}`);
  }
}

async function scanOrphanPaymentIntents(
  supabase: ServiceClient,
  result: ReconciliationResult,
  opts: { dryRun?: boolean },
): Promise<void> {
  try {
    const { data: pis, error } = await supabase
      .from('stripe_payment_intents')
      .select('id, metadata, created_at')
      .limit(200);
    if (error) {
      result.errors.push(`scanOrphanPaymentIntents: ${error.message}`);
      return;
    }
    for (const pi of pis ?? []) {
      const draftId = pi.metadata?.draft_id;
      if (!draftId) continue;
      const { data: draft } = await supabase
        .from('order_drafts')
        .select('id')
        .eq('id', draftId)
        .maybeSingle();
      if (!draft) {
        result.issues_found++;
        result.issues_by_type['orphan_payment_intent'] = (result.issues_by_type['orphan_payment_intent'] ?? 0) + 1;
        if (!opts.dryRun) {
          await enqueueReconciliation({
            issue_type: 'orphan_payment_intent',
            payment_intent_id: pi.id,
            customer_id: pi.metadata?.customer_id,
            details: {
              draft_id_from_metadata: draftId,
              pi_created_at: pi.created_at,
              recovery_action: 'flag_admin',
            },
          });
          result.issues_queued++;
        }
      }
    }
  } catch (error: unknown) {
    result.errors.push(`scanOrphanPaymentIntents: ${errorMessage(error)}`);
  }
}

// ============================================================================
// Auto-recovery for "burned but no order" (called from webhook best-effort)
// ============================================================================

/**
 * Try to recover a draft that was burned but has no order.
 * Returns true if recovery was successful (order now exists).
 *
 * Called from the webhook handler as a self-healing mechanism.
 * If this fails, the issue is in the reconciliation queue.
 */
export async function tryRecoverBurnedDraft(
  draftId: string,
  paymentIntentId: string,
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  const supabase = createServiceClient();

  // Check if the order exists now (perhaps another retry created it)
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (existingOrder) {
    return { ok: true, orderId: existingOrder.id };
  }

  // Load the draft body
  const { data: fullDraft, error: loadErr } = await supabase
    .from('order_drafts')
    .select('draft, customer_id, restaurant_id')
    .eq('id', draftId)
    .maybeSingle();
  if (loadErr || !fullDraft?.draft) {
    return { ok: false, error: loadErr?.message ?? 'draft_body_missing' };
  }
  const draftBody = parseRecoveryDraft(fullDraft.draft);
  if (!draftBody) return { ok: false, error: 'draft_body_invalid' };
  const orderItems = draftBody.lines.map((line) => ({
    product_id: line.product_id,
    product_name: line.product_name,
    product_price: line.unit_price,
    quantity: line.quantity,
    subtotal: line.line_subtotal,
    config_key: line.config_key,
    configuration: line.configuration,
  }));

  // Generate order number
  const now = new Date();
  const orderNumber = `BLG${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

  // Atomic order creation
  const { data: rpcRows, error: orderErr } = await supabase.rpc('create_order_atomic', {
    p_order_number: orderNumber,
    p_customer_id: fullDraft.customer_id,
    p_restaurant_id: fullDraft.restaurant_id,
    p_subtotal: draftBody.subtotal,
    p_delivery_fee: draftBody.delivery_fee,
    p_service_fee: draftBody.service_fee,
    p_tip: draftBody.tip,
    p_discount: draftBody.discount + draftBody.points_discount,
    p_total: draftBody.total,
    p_payment_method: draftBody.payment_method,
    p_delivery_address: draftBody.delivery_address,
    p_customer_latitude: typeof draftBody.delivery_address?.lat === 'number' && Number.isFinite(draftBody.delivery_address.lat) ? draftBody.delivery_address.lat : null,
    p_customer_longitude: typeof draftBody.delivery_address?.lng === 'number' && Number.isFinite(draftBody.delivery_address.lng) ? draftBody.delivery_address.lng : null,
    p_restaurant_latitude: null,
    p_restaurant_longitude: null,
    p_scheduled_for: draftBody.scheduled_for,
    p_items: orderItems,
    p_fulfillment_type: draftBody.fulfillment_type === 'pickup' ? 'pickup' : 'delivery',
    p_payment_intent_id: paymentIntentId,
    p_stripe_event_id: null,  // not from a specific event
  });

  if (orderErr || !rpcRows || rpcRows.length === 0) {
    return { ok: false, error: orderErr?.message ?? 'order_creation_failed' };
  }
  return { ok: true, orderId: rpcRows[0].order_id };
}
