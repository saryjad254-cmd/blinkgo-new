/**
 * Integration Provider Types
 * ─────────────────────────
 * Shared interfaces for all integration providers.
 * Each provider (Stripe, FCM, etc.) implements a domain-specific interface.
 */

export interface ProviderConfig {
  enabled: boolean;
  // Provider-specific config is dynamic
  [key: string]: any;
}

export interface ProviderHealth {
  name: string;
  type: string;
  enabled: boolean;
  configured: boolean;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  last_check: string;
  last_error?: string;
  uptime_pct: number; // 0-100
  requests_24h: number;
  errors_24h: number;
}

export interface IntegrationEvent {
  id: string;
  type: string; // e.g., 'payment.completed', 'notification.sent'
  source: string; // e.g., 'stripe', 'fcm'
  payload: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  processed_at?: string;
  status: 'pending' | 'processed' | 'failed' | 'dead_letter';
  attempts: number;
  error?: string;
}

/**
 * Common error class for all integrations.
 */
export class IntegrationError extends Error {
  public readonly code: string;
  public readonly provider: string;
  public readonly retryable: boolean;
  public readonly statusCode?: number;

  constructor(provider: string, code: string, message: string, opts: { retryable?: boolean; statusCode?: number; cause?: Error } = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.provider = provider;
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.statusCode = opts.statusCode;
    if (opts.cause) (this as any).cause = opts.cause;
  }
}

/**
 * Retry policy with exponential backoff.
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Compute next retry delay.
 */
export function computeRetryDelay(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const base = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt);
  const capped = Math.min(base, policy.maxDelayMs);
  if (policy.jitter) {
    return Math.floor(capped * (0.5 + Math.random() * 0.5));
  }
  return capped;
}

/**
 * Read provider config from environment with safe defaults.
 * Never throws; returns empty config if env var is missing.
 */
export function readProviderConfig(envPrefix: string): ProviderConfig {
  // envPrefix e.g. "STRIPE" looks for STRIPE_ENABLED, STRIPE_SECRET_KEY, etc.
  const enabled = (process.env[`${envPrefix}_ENABLED`] || '').toLowerCase() === 'true';
  return {
    enabled,
    secret_key: process.env[`${envPrefix}_SECRET_KEY`] || '',
    public_key: process.env[`${envPrefix}_PUBLIC_KEY`] || '',
    webhook_secret: process.env[`${envPrefix}_WEBHOOK_SECRET`] || '',
    environment: process.env[`${envPrefix}_ENVIRONMENT`] || 'production',
  };
}
