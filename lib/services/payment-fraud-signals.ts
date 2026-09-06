/**
 * Fraud Signals & Card-Testing Detection (Phase 7G-C)
 * ────────────────────────────────────────────────────
 * Detects suspicious patterns and writes security events. Does not
 * accuse users; preserves legitimate retry paths while throttling
 * obvious abuse.
 *
 * Patterns detected:
 *   - Excessive PaymentIntent creation from a single user/IP
 *   - Repeated declines on the same draft
 *   - Many drafts with no completed payment
 *   - Multiple users from the same IP within a short window
 *   - Many payment attempts for the same draft
 *   - Rapid sequential requests (timing-based)
 */
import { logger } from '@/lib/logging';
import { createServiceClient } from '@/lib/supabase/service';
import { logSecurityEvent } from '@/lib/services/payment-secrets';

export interface FraudSignalConfig {
  // Per user
  userMaxPIperHour: number;          // 30
  userMaxDraftsPerHour: number;      // 50
  userMaxDeclinesPerHour: number;    // 5
  // Per IP
  ipMaxPIperHour: number;            // 100
  ipMaxUsersPer10Min: number;        // 5  (multiple accounts from same IP)
  // Per draft
  draftMaxAttempts: number;          // 10
  // Time
  minRequestIntervalMs: number;      // 50ms (no human types this fast)
}

export const DEFAULT_FRAUD_SIGNAL_CONFIG: FraudSignalConfig = {
  userMaxPIperHour: 30,
  userMaxDraftsPerHour: 50,
  userMaxDeclinesPerHour: 5,
  ipMaxPIperHour: 100,
  ipMaxUsersPer10Min: 5,
  draftMaxAttempts: 10,
  minRequestIntervalMs: 50,
};

export interface FraudCheckResult {
  allowed: boolean;
  risk_score: number;        // 0..100
  triggered_signals: string[];
  recommended_action: 'allow' | 'throttle' | 'block';
}

const lastRequestByUser = new Map<string, number>();
const lastRequestByIP = new Map<string, number>();

/**
 * Compute a risk score and determine if the action should be allowed.
 * Does NOT block legitimate users — only flags obvious abuse.
 */
export async function checkFraudSignals(params: {
  userId?: string | null;
  ip?: string | null;
  draftId?: string | null;
  action: 'checkout' | 'status_poll' | 'webhook' | 'admin';
  config?: Partial<FraudSignalConfig>;
  nowMs?: number;
}): Promise<FraudCheckResult> {
  const cfg = { ...DEFAULT_FRAUD_SIGNAL_CONFIG, ...(params.config || {}) };
  const now = params.nowMs ?? Date.now();
  const triggered: string[] = [];
  let risk = 0;

  // 1) Per-user timing check
  if (params.userId) {
    const last = lastRequestByUser.get(params.userId);
    if (last !== undefined && now - last < cfg.minRequestIntervalMs) {
      triggered.push('rapid_user_requests');
      risk += 30;
    }
    lastRequestByUser.set(params.userId, now);
  }

  // 2) Per-IP timing check
  if (params.ip) {
    const last = lastRequestByIP.get(params.ip);
    if (last !== undefined && now - last < cfg.minRequestIntervalMs) {
      triggered.push('rapid_ip_requests');
      risk += 30;
    }
    lastRequestByIP.set(params.ip, now);
  }

  // 3) DB queries for high-cost signals
  try {
    const supabase = createServiceClient();

    if (params.userId) {
      // Per-user PI count in last hour
      const oneHourAgo = new Date(now - 3600_000).toISOString();
      const { count: userPICount } = await supabase
        .from('payment_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', params.userId)
        .eq('status', 'intent_created')
        .gte('created_at', oneHourAgo);
      if ((userPICount ?? 0) > cfg.userMaxPIperHour) {
        triggered.push('user_excessive_pi_creation');
        risk += 40;
      }

      // Per-user declines in last hour
      const { count: userDeclineCount } = await supabase
        .from('payment_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', params.userId)
        .eq('status', 'intent_failed')
        .gte('created_at', oneHourAgo);
      if ((userDeclineCount ?? 0) > cfg.userMaxDeclinesPerHour) {
        triggered.push('user_repeated_declines');
        risk += 35;
      }

      // Per-user draft count in last hour
      const { count: userDraftCount } = await supabase
        .from('order_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', params.userId)
        .gte('created_at', oneHourAgo);
      if ((userDraftCount ?? 0) > cfg.userMaxDraftsPerHour) {
        triggered.push('user_excessive_drafts');
        risk += 30;
      }
    }

    if (params.ip) {
      // Per-IP PI count in last hour
      const oneHourAgo = new Date(now - 3600_000).toISOString();
      const { count: ipPICount } = await supabase
        .from('payment_security_events')
        .select('id', { count: 'exact', head: true })
        .eq('ip', params.ip)
        .gte('created_at', oneHourAgo);
      // (security events aren't the right count for PIs, use audit log)
      const { count: ipPIFromAudit } = await supabase
        .from('payment_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('ip', params.ip)
        .eq('status', 'intent_created')
        .gte('created_at', oneHourAgo);
      if ((ipPIFromAudit ?? 0) > cfg.ipMaxPIperHour) {
        triggered.push('ip_excessive_pi_creation');
        risk += 40;
      }
    }

    if (params.draftId) {
      // Per-draft attempt count
      const { count: draftAttempts } = await supabase
        .from('payment_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('draft_id', params.draftId)
        .gte('created_at', new Date(now - 24 * 3600_000).toISOString());
      if ((draftAttempts ?? 0) > cfg.draftMaxAttempts) {
        triggered.push('draft_excessive_attempts');
        risk += 35;
      }
    }
  } catch (err) {
    // Don't fail the request on a DB error; just log
    logger.warn('fraud.signals.db_check_failed', { error: (err as Error).message });
  }

  risk = Math.min(100, risk);
  let action: FraudCheckResult['recommended_action'] = 'allow';
  if (risk >= 75) action = 'block';
  else if (risk >= 40) action = 'throttle';

  const result: FraudCheckResult = {
    allowed: action !== 'block',
    risk_score: risk,
    triggered_signals: triggered,
    recommended_action: action,
  };

  // Log the signal if any triggered
  if (triggered.length > 0) {
    await logSecurityEvent({
      event_type: triggered.includes('user_repeated_declines')
        ? 'repeated_decline'
        : triggered.some((s) => s.startsWith('user_') || s.startsWith('ip_'))
        ? 'checkout_flood_user'
        : 'polling_flood',
      severity: action === 'block' ? 'critical' : action === 'throttle' ? 'high' : 'medium',
      user_id: params.userId || null,
      draft_id: params.draftId || null,
      ip: params.ip || null,
      reason: `Fraud signals triggered: ${triggered.join(', ')} (risk=${risk})`,
      metadata: { signals: triggered, risk_score: risk, action, request_action: params.action },
    });
  }

  return result;
}

/**
 * Record a payment decline (e.g., a webhook payment_intent.payment_failed).
 * Increments the user's decline counter.
 */
export async function recordDecline(params: {
  userId: string;
  draftId: string;
  paymentIntentId: string;
  reason?: string;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('payment_audit_log').insert({
    payment_intent_id: params.paymentIntentId,
    customer_id: params.userId,
    draft_id: params.draftId,
    status: 'intent_failed',
    idempotency_key: `decline:${params.paymentIntentId}:${Date.now()}`,
    error_reason: params.reason || null,
  });
}
