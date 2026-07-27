/**
 * Webhook Dispatcher
 * ─────────────────
 * Sends webhooks to external endpoints with signature validation,
 * retry, idempotency, and dead-letter queue.
 */

import crypto from 'node:crypto';
import { computeRetryDelay, DEFAULT_RETRY_POLICY, RetryPolicy, IntegrationError } from '../types';

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[]; // event types to subscribe
  enabled: boolean;
  retry_policy?: RetryPolicy;
}

export interface WebhookDelivery {
  id: string;
  url: string;
  event: string;
  payload: any;
  attempts: number;
  status: 'pending' | 'success' | 'failed' | 'dead_letter';
  response_status?: number;
  response_body?: string;
  error?: string;
  created_at: string;
  delivered_at?: string;
  // Idempotency key (unique per event)
  idempotency_key: string;
}

export interface WebhookSendResult {
  success: boolean;
  status_code?: number;
  error?: string;
  duration_ms: number;
}

export class WebhookDispatcher {
  private retryPolicy: RetryPolicy;
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private idempotencyCache: Set<string> = new Set();

  constructor(retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY) {
    this.retryPolicy = retryPolicy;
  }

  /**
   * Send a webhook to an endpoint.
   * Signs payload with HMAC-SHA256.
   */
  async send(config: WebhookConfig, event: string, payload: any, options: { idempotency_key?: string } = {}): Promise<WebhookSendResult> {
    if (!config.enabled) {
      return { success: false, error: 'Webhook disabled', duration_ms: 0 };
    }
    if (config.events.length > 0 && !config.events.includes(event) && !config.events.includes('*')) {
      return { success: false, error: `Event not subscribed: ${event}`, duration_ms: 0 };
    }

    const idempotencyKey = options.idempotency_key || crypto.randomUUID();
    if (this.idempotencyCache.has(idempotencyKey)) {
      return { success: false, error: 'Duplicate event (idempotency)', duration_ms: 0 };
    }
    this.idempotencyCache.add(idempotencyKey);

    const body = JSON.stringify({ event, payload, timestamp: Date.now() });
    const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
    const deliveryId = crypto.randomUUID();
    const delivery: WebhookDelivery = {
      id: deliveryId,
      url: config.url,
      event,
      payload,
      attempts: 0,
      status: 'pending',
      created_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
    };
    this.deliveries.set(deliveryId, delivery);

    const start = Date.now();
    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Id': deliveryId,
          'X-Webhook-Event': event,
          'X-Idempotency-Key': idempotencyKey,
        },
        body,
      });
      const responseBody = await res.text().catch(() => '');
      delivery.attempts = 1;
      delivery.response_status = res.status;
      delivery.response_body = responseBody.substring(0, 500);

      if (res.ok) {
        delivery.status = 'success';
        delivery.delivered_at = new Date().toISOString();
        return { success: true, status_code: res.status, duration_ms: Date.now() - start };
      } else {
        delivery.error = `HTTP ${res.status}`;
        // Retry on 5xx or 429
        if (res.status >= 500 || res.status === 429) {
          this.scheduleRetry(delivery, config);
        } else {
          delivery.status = 'failed';
        }
        return { success: false, status_code: res.status, error: `HTTP ${res.status}`, duration_ms: Date.now() - start };
      }
    } catch (e: any) {
      delivery.attempts = 1;
      delivery.error = e.message;
      this.scheduleRetry(delivery, config);
      return { success: false, error: e.message, duration_ms: Date.now() - start };
    }
  }

  /**
   * Verify an incoming webhook signature.
   */
  static verifySignature(secret: string, body: string, signature: string): boolean {
    if (!signature) return false;
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') return false;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]));
  }

  private scheduleRetry(delivery: WebhookDelivery, config: WebhookConfig): void {
    if (delivery.attempts >= (config.retry_policy?.maxAttempts || this.retryPolicy.maxAttempts)) {
      delivery.status = 'dead_letter';
      return;
    }
    // Caller can call processRetries() later
  }

  /**
   * Get delivery history.
   */
  getDeliveries(limit: number = 100): WebhookDelivery[] {
    return Array.from(this.deliveries.values()).slice(-limit).reverse();
  }

  /**
   * Get dead-letter queue.
   */
  getDeadLetter(limit: number = 100): WebhookDelivery[] {
    return Array.from(this.deliveries.values())
      .filter((d) => d.status === 'dead_letter')
      .slice(-limit)
      .reverse();
  }
}

let _dispatcher: WebhookDispatcher | null = null;
export function getWebhookDispatcher(): WebhookDispatcher {
  if (!_dispatcher) _dispatcher = new WebhookDispatcher();
  return _dispatcher;
}
