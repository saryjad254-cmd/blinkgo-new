import crypto from 'node:crypto';
import { computeRetryDelay, DEFAULT_RETRY_POLICY, type RetryPolicy } from '../types';
import { validateWebhookUrl } from '@/lib/security/outbound-url';
import { createServiceClient } from '@/lib/supabase/service';

export interface WebhookConfig {
  id?: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  retry_policy?: RetryPolicy;
}

export interface WebhookDelivery {
  id: string;
  webhook_id?: string | null;
  source: 'managed' | 'automation';
  url: string;
  event: string;
  payload: unknown;
  attempts: number;
  status: 'pending' | 'success' | 'failed' | 'dead_letter';
  response_status?: number | null;
  response_body?: string | null;
  error?: string | null;
  next_attempt_at?: string | null;
  created_at: string;
  updated_at?: string;
  delivered_at?: string | null;
  idempotency_key: string;
}

export interface WebhookSendResult {
  success: boolean;
  status_code?: number;
  error?: string;
  duration_ms: number;
}

export class WebhookDispatcher {
  private readonly retryPolicy: RetryPolicy;
  private readonly deliveries = new Map<string, WebhookDelivery>();
  private readonly idempotencyCache = new Set<string>();

  constructor(retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY) {
    this.retryPolicy = retryPolicy;
  }

  async send(config: WebhookConfig, event: string, payload: unknown, options: { idempotency_key?: string } = {}): Promise<WebhookSendResult> {
    if (!config.enabled) return { success: false, error: 'Webhook disabled', duration_ms: 0 };
    if (config.secret.length < 16) return { success: false, error: 'Webhook signing secret is invalid', duration_ms: 0 };
    if (config.events.length > 0 && !config.events.includes(event) && !config.events.includes('*')) {
      return { success: false, error: `Event not subscribed: ${event}`, duration_ms: 0 };
    }

    let safeUrl: string;
    try {
      safeUrl = await validateWebhookUrl(config.url);
    } catch {
      return { success: false, error: 'Webhook destination is not allowed', duration_ms: 0 };
    }

    const idempotencyKey = options.idempotency_key || crypto.randomUUID();
    if (this.idempotencyCache.has(idempotencyKey) || await this.hasPersistentDelivery(idempotencyKey)) {
      return { success: false, error: 'Duplicate event (idempotency)', duration_ms: 0 };
    }
    this.rememberIdempotencyKey(idempotencyKey);

    const now = new Date().toISOString();
    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      webhook_id: config.id || null,
      source: config.id ? 'managed' : 'automation',
      url: safeUrl,
      event,
      payload,
      attempts: 0,
      status: 'pending',
      created_at: now,
      updated_at: now,
      idempotency_key: idempotencyKey,
    };
    this.cacheDelivery(delivery);
    await this.insertPersistentDelivery(delivery);
    return this.attempt(delivery, config);
  }

  async processRetries(limit = 50): Promise<{ processed: number; succeeded: number; failed: number; dead_letter: number }> {
    const due = await this.loadDueDeliveries(limit);
    let succeeded = 0;
    let failed = 0;
    let deadLetter = 0;

    for (const delivery of due) {
      const config = await this.loadRetryConfig(delivery);
      if (!config) {
        delivery.status = 'dead_letter';
        delivery.error = 'Webhook configuration is unavailable';
        delivery.next_attempt_at = null;
        await this.updatePersistentDelivery(delivery);
        this.cacheDelivery(delivery);
        deadLetter += 1;
        continue;
      }
      const result = await this.attempt(delivery, config);
      if (result.success) succeeded += 1;
      else if (delivery.status === 'dead_letter') deadLetter += 1;
      else failed += 1;
    }
    return { processed: due.length, succeeded, failed, dead_letter: deadLetter };
  }

  async listDeliveries(limit = 100, status?: WebhookDelivery['status']): Promise<WebhookDelivery[]> {
    try {
      const db = createServiceClient();
      let query = db.from('webhook_deliveries').select('*').order('created_at', { ascending: false }).limit(limit);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (!error && data) return data as WebhookDelivery[];
    } catch {
      // Migration may not have been applied yet; use process-local history.
    }
    return Array.from(this.deliveries.values())
      .filter((delivery) => !status || delivery.status === status)
      .slice(-limit)
      .reverse();
  }

  getDeliveries(limit = 100): WebhookDelivery[] {
    return Array.from(this.deliveries.values()).slice(-limit).reverse();
  }

  getDeadLetter(limit = 100): WebhookDelivery[] {
    return Array.from(this.deliveries.values()).filter((delivery) => delivery.status === 'dead_letter').slice(-limit).reverse();
  }

  static verifySignature(secret: string, body: string, signature: string): boolean {
    if (!signature) return false;
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256' || !/^[a-f0-9]{64}$/i.test(parts[1])) return false;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts[1], 'hex'));
  }

  private async attempt(delivery: WebhookDelivery, config: WebhookConfig): Promise<WebhookSendResult> {
    const start = Date.now();
    delivery.attempts += 1;
    delivery.updated_at = new Date().toISOString();
    delivery.next_attempt_at = null;

    let body: string;
    try {
      body = JSON.stringify({ event: delivery.event, payload: delivery.payload, timestamp: Date.now() });
    } catch {
      delivery.status = 'failed';
      delivery.error = 'Webhook payload is not serializable';
      await this.finishAttempt(delivery);
      return { success: false, error: delivery.error, duration_ms: Date.now() - start };
    }

    const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
    try {
      const safeUrl = await validateWebhookUrl(delivery.url);
      const response = await fetch(safeUrl, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Id': delivery.id,
          'X-Webhook-Event': delivery.event,
          'X-Idempotency-Key': delivery.idempotency_key,
        },
        body,
      });
      delivery.response_status = response.status;
      delivery.response_body = await this.readLimitedResponse(response);

      if (response.ok) {
        delivery.status = 'success';
        delivery.error = null;
        delivery.delivered_at = new Date().toISOString();
        await this.finishAttempt(delivery);
        return { success: true, status_code: response.status, duration_ms: Date.now() - start };
      }

      delivery.error = `HTTP ${response.status}`;
      this.classifyFailure(delivery, response.status >= 500 || response.status === 429, config.retry_policy);
      await this.finishAttempt(delivery);
      return { success: false, status_code: response.status, error: delivery.error, duration_ms: Date.now() - start };
    } catch (error: unknown) {
      delivery.error = error instanceof Error ? error.message.slice(0, 1_000) : 'Webhook request failed';
      this.classifyFailure(delivery, true, config.retry_policy);
      await this.finishAttempt(delivery);
      return { success: false, error: delivery.error, duration_ms: Date.now() - start };
    }
  }

  private classifyFailure(delivery: WebhookDelivery, retryable: boolean, policy = this.retryPolicy): void {
    if (!retryable) {
      delivery.status = 'failed';
      delivery.next_attempt_at = null;
      return;
    }
    if (delivery.attempts >= policy.maxAttempts) {
      delivery.status = 'dead_letter';
      delivery.next_attempt_at = null;
      return;
    }
    delivery.status = 'pending';
    delivery.next_attempt_at = new Date(Date.now() + computeRetryDelay(delivery.attempts, policy)).toISOString();
  }

  private async readLimitedResponse(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let text = '';
    while (text.length < 500) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => undefined);
    return text.slice(0, 500);
  }

  private async loadRetryConfig(delivery: WebhookDelivery): Promise<WebhookConfig | null> {
    if (delivery.webhook_id) {
      try {
        const db = createServiceClient();
        const { data, error } = await db.from('webhooks').select('id,url,secret,events,enabled').eq('id', delivery.webhook_id).single();
        if (!error && data?.enabled) return data as WebhookConfig;
      } catch {
        return null;
      }
      return null;
    }
    const secret = process.env.WEBHOOK_SHARED_SECRET;
    if (!secret || secret.length < 16) return null;
    return { url: delivery.url, secret, events: [delivery.event], enabled: true };
  }

  private async loadDueDeliveries(limit: number): Promise<WebhookDelivery[]> {
    try {
      const db = createServiceClient();
      const { data, error } = await db.from('webhook_deliveries')
        .select('*')
        .eq('status', 'pending')
        .lte('next_attempt_at', new Date().toISOString())
        .order('next_attempt_at', { ascending: true })
        .limit(Math.max(1, Math.min(limit, 200)));
      if (!error && data) return data as WebhookDelivery[];
    } catch {
      // Fall back to process-local records below.
    }
    const now = Date.now();
    return Array.from(this.deliveries.values())
      .filter((delivery) => delivery.status === 'pending' && delivery.next_attempt_at && Date.parse(delivery.next_attempt_at) <= now)
      .slice(0, limit);
  }

  private async hasPersistentDelivery(idempotencyKey: string): Promise<boolean> {
    try {
      const db = createServiceClient();
      const { data, error } = await db.from('webhook_deliveries').select('id').eq('idempotency_key', idempotencyKey).limit(1);
      return !error && Boolean(data?.length);
    } catch {
      return false;
    }
  }

  private async insertPersistentDelivery(delivery: WebhookDelivery): Promise<void> {
    try {
      const db = createServiceClient();
      await db.from('webhook_deliveries').insert(delivery);
    } catch {
      // Delivery still proceeds; readiness reports will expose missing migration.
    }
  }

  private async updatePersistentDelivery(delivery: WebhookDelivery): Promise<void> {
    try {
      const db = createServiceClient();
      await db.from('webhook_deliveries').update(delivery).eq('id', delivery.id);
    } catch {
      // Keep the in-memory copy as a degraded fallback.
    }
  }

  private async finishAttempt(delivery: WebhookDelivery): Promise<void> {
    delivery.updated_at = new Date().toISOString();
    this.cacheDelivery(delivery);
    await this.updatePersistentDelivery(delivery);
  }

  private cacheDelivery(delivery: WebhookDelivery): void {
    this.deliveries.set(delivery.id, { ...delivery });
    if (this.deliveries.size > 1_000) this.deliveries.delete(this.deliveries.keys().next().value as string);
  }

  private rememberIdempotencyKey(key: string): void {
    this.idempotencyCache.add(key);
    if (this.idempotencyCache.size > 10_000) this.idempotencyCache.delete(this.idempotencyCache.values().next().value as string);
  }
}

let dispatcher: WebhookDispatcher | null = null;
export function getWebhookDispatcher(): WebhookDispatcher {
  if (!dispatcher) dispatcher = new WebhookDispatcher();
  return dispatcher;
}
