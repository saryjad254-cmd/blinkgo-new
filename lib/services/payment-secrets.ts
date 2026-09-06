/**
 * Payment Secrets & Environment Validation (Phase 7G-C)
 * ──────────────────────────────────────────────────────
 * Validates that all required payment-related secrets are present
 * and consistent. Fails CLOSED in production — missing keys mean
 * payments are unavailable, not silently mocked.
 *
 * Modes:
 *   - production: requires real STRIPE_SECRET_KEY (sk_live_*) and matching
 *                 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_live_*)
 *   - test:       requires real STRIPE_SECRET_KEY (sk_test_*) and matching
 *                 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_*)
 *   - dev/mock:   uses mock Supabase + mock Stripe. Must have
 *                 ALLOW_MOCK_PAYMENTS=true AND NODE_ENV != 'production'
 */
import { logger } from '@/lib/logging';

export type PaymentMode = 'production' | 'test' | 'dev-mock';

export interface PaymentSecretStatus {
  mode: PaymentMode;
  stripeSecretKeyPresent: boolean;
  stripeSecretKeyMode: 'live' | 'test' | 'invalid' | 'missing';
  stripeWebhookSecretPresent: boolean;
  publishableKeyPresent: boolean;
  publishableKeyMode: 'live' | 'test' | 'invalid' | 'missing';
  publishableKeyMatchesSecret: boolean;
  cronSecretPresent: boolean;
  draftSigningSecretPresent: boolean;
  supabaseServiceRolePresent: boolean;
  canCreatePayments: boolean;
  unavailabilityReason: string | null;
}

let cachedStatus: PaymentSecretStatus | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export function getPaymentSecretStatus(): PaymentSecretStatus {
  // Cache to avoid repeated env reads on every request
  if (cachedStatus && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }
  cachedStatus = computeSecretStatus();
  cachedAt = Date.now();
  return cachedStatus;
}

export function invalidateSecretCache(): void {
  cachedStatus = null;
}

function computeSecretStatus(): PaymentSecretStatus {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowMock = process.env.ALLOW_MOCK_PAYMENTS === 'true';

  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const draftSigningSecret = process.env.DRAFT_SIGNING_SECRET || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // Determine secret key mode
  let secretMode: 'live' | 'test' | 'invalid' | 'missing' = 'missing';
  if (secretKey) {
    if (secretKey.startsWith('sk_live_')) secretMode = 'live';
    else if (secretKey.startsWith('sk_test_')) secretMode = 'test';
    else secretMode = 'invalid';
  }

  // Determine publishable key mode
  let pubMode: 'live' | 'test' | 'invalid' | 'missing' = 'missing';
  if (publishableKey) {
    if (publishableKey.startsWith('pk_live_')) pubMode = 'live';
    else if (publishableKey.startsWith('pk_test_')) pubMode = 'test';
    else pubMode = 'invalid';
  }

  // Keys must match in mode
  const keysMatch = secretMode === pubMode && secretMode !== 'missing' && secretMode !== 'invalid';

  // Determine mode
  let mode: PaymentMode;
  let unavailabilityReason: string | null = null;
  let canCreatePayments = false;

  if (nodeEnv === 'production') {
    // Production: MUST have real live keys. NEVER mock.
    if (secretMode === 'live' && pubMode === 'live' && keysMatch && webhookSecret) {
      mode = 'production';
      canCreatePayments = true;
    } else if (secretMode === 'live' && !keysMatch) {
      mode = 'production';
      unavailabilityReason = 'stripe_key_mode_mismatch';
      logger.error('payment.secrets.key_mode_mismatch', {
        secretMode,
        pubMode,
        env: nodeEnv,
      });
    } else if (secretMode === 'live' && !webhookSecret) {
      mode = 'production';
      unavailabilityReason = 'webhook_secret_missing';
    } else {
      mode = 'production';
      unavailabilityReason = secretMode === 'missing' || secretMode === 'invalid'
        ? 'stripe_secret_key_missing_or_invalid_in_production'
        : 'payments_unavailable';
      logger.error('payment.secrets.production_unavailable', {
        secretMode,
        pubMode,
        webhookSecretPresent: !!webhookSecret,
        env: nodeEnv,
      });
    }
  } else if (nodeEnv === 'test' || nodeEnv === 'development') {
    // Dev/test: accept real test keys or explicit mock
    if (secretMode === 'test' && pubMode === 'test' && keysMatch && webhookSecret) {
      mode = 'test';
      canCreatePayments = true;
    } else if (allowMock) {
      mode = 'dev-mock';
      canCreatePayments = true; // Mock creates mock PIs
    } else if (secretMode === 'missing' || secretMode === 'invalid') {
      mode = 'dev-mock';
      unavailabilityReason = 'no_keys_no_mock_flag';
      canCreatePayments = false;
    } else {
      // Test key but no publishable — inconsistent
      mode = 'test';
      unavailabilityReason = 'inconsistent_keys';
      canCreatePayments = false;
    }
  } else {
    mode = 'dev-mock';
    unavailabilityReason = 'unknown_environment';
    canCreatePayments = false;
  }

  return {
    mode,
    stripeSecretKeyPresent: !!secretKey,
    stripeSecretKeyMode: secretMode,
    stripeWebhookSecretPresent: !!webhookSecret,
    publishableKeyPresent: !!publishableKey,
    publishableKeyMode: pubMode,
    publishableKeyMatchesSecret: keysMatch,
    cronSecretPresent: !!cronSecret,
    draftSigningSecretPresent: !!draftSigningSecret,
    supabaseServiceRolePresent: !!serviceRoleKey,
    canCreatePayments,
    unavailabilityReason,
  };
}

/**
 * Returns true if Stripe is in live (production) mode.
 * In test mode (sk_test_*) or dev-mock, returns false.
 * In production mode (sk_live_*), returns true.
 *
 * This matches Stripe's own `livemode` field convention:
 * - livemode=true ⟺ real money, sk_live_*
 * - livemode=false ⟺ test mode, sk_test_* or mock
 */
export function isStripeLive(): boolean {
  return getPaymentSecretStatus().mode === 'production';
}

/**
 * Returns true if mock Stripe is allowed in the current environment.
 * This is FALSE in production. In dev, requires ALLOW_MOCK_PAYMENTS=true.
 */
export function isMockAllowed(): boolean {
  const status = getPaymentSecretStatus();
  return status.mode === 'dev-mock';
}

/**
 * Throws an error if payments cannot be created. Used by routes that
 * MUST NOT fall through to mock mode in production.
 */
export function requirePaymentsAvailable(): void {
  const status = getPaymentSecretStatus();
  if (!status.canCreatePayments) {
    throw new Error(
      `Payments unavailable: ${status.unavailabilityReason || 'unknown'}. ` +
      `Mode: ${status.mode}. ` +
      `In production, real Stripe keys (sk_live_/pk_live_) and a webhook secret are required. ` +
      `In dev, set ALLOW_MOCK_PAYMENTS=true.`,
    );
  }
}

/**
 * Get the livemode flag for the current environment. Used to compare
 * against webhook event.livemode.
 */
export function getLivemode(): boolean {
  return isStripeLive();
}

/**
 * Get the expected environment name for cross-checking with Stripe.
 * 'production' if sk_live_*, 'test' if sk_test_*.
 */
export function getEnvironmentName(): 'production' | 'test' {
  return getPaymentSecretStatus().mode === 'production' ? 'production' : 'test';
}

/**
 * Log a security event (failure or suspicious activity).
 * Writes to payment_security_events via service client.
 */
export async function logSecurityEvent(event: {
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user_id?: string | null;
  draft_id?: string | null;
  payment_intent_id?: string | null;
  stripe_event_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  route?: string | null;
  reason: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();
    await supabase.from('payment_security_events').insert({
      event_type: event.event_type,
      severity: event.severity,
      user_id: event.user_id || null,
      draft_id: event.draft_id || null,
      payment_intent_id: event.payment_intent_id || null,
      stripe_event_id: event.stripe_event_id || null,
      ip: event.ip || null,
      user_agent: event.user_agent || null,
      request_id: event.request_id || null,
      route: event.route || null,
      reason: event.reason,
      metadata: event.metadata || null,
    });
  } catch (err) {
    // Never let a logging failure break the request
    logger.error('payment.security_event.write_failed', {
      event_type: event.event_type,
      reason: event.reason,
      error: (err as Error).message,
    });
  }
}
