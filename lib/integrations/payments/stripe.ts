/**
 * Stripe Payment Provider
 * ───────────────────────
 * Implements PaymentProvider for Stripe.
 * Server-side only; never exposes secret keys to client.
 */

import crypto from 'node:crypto';
import type {
  PaymentProvider,
  PaymentIntent,
  RefundRequest,
  RefundResult,
  WebhookEvent,
  PaymentMethod,
  PaymentStatus,
} from './types';
import { IntegrationError, readProviderConfig } from '../types';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

export class StripeProvider implements PaymentProvider {
  public readonly name = 'stripe' as const;
  public readonly enabled: boolean;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly environment: string;

  constructor() {
    const cfg = readProviderConfig('STRIPE');
    this.enabled = cfg.enabled && !!cfg.secret_key;
    this.secretKey = cfg.secret_key;
    this.webhookSecret = cfg.webhook_secret;
    this.environment = cfg.environment;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    };
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('stripe', 'NOT_CONFIGURED', 'Stripe is not configured', { retryable: false });
    }
  }

  private toStatus(stripeStatus: string): PaymentStatus {
    const map: Record<string, PaymentStatus> = {
      requires_payment_method: 'pending',
      requires_confirmation: 'pending',
      requires_action: 'requires_action',
      processing: 'processing',
      requires_capture: 'processing',
      canceled: 'cancelled',
      succeeded: 'succeeded',
    };
    return map[stripeStatus] || 'pending';
  }

  async createPaymentIntent(input: {
    amount: number;
    currency: string;
    customer_id?: string;
    payment_method?: PaymentMethod;
    metadata?: Record<string, any>;
    description?: string;
  }): Promise<PaymentIntent> {
    this.requireEnabled();
    const params = new URLSearchParams();
    params.append('amount', String(input.amount));
    params.append('currency', input.currency.toLowerCase());
    params.append('automatic_payment_methods[enabled]', 'true');
    if (input.customer_id) params.append('customer', input.customer_id);
    if (input.description) params.append('description', input.description);
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }

    const res = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
      method: 'POST',
      headers: this.headers,
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('stripe', data.error?.code || 'API_ERROR', data.error?.message || 'Stripe API error', {
        retryable: res.status >= 500,
        statusCode: res.status,
      });
    }
    return {
      id: data.id,
      client_secret: data.client_secret,
      amount: data.amount,
      currency: data.currency,
      status: this.toStatus(data.status),
      provider: 'stripe',
      metadata: data.metadata,
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  async confirmPayment(payment_id: string): Promise<PaymentIntent> {
    this.requireEnabled();
    const res = await fetch(`${STRIPE_API_BASE}/payment_intents/${payment_id}/confirm`, {
      method: 'POST',
      headers: this.headers,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('stripe', data.error?.code || 'API_ERROR', data.error?.message || 'Stripe confirm failed', {
        retryable: res.status >= 500,
        statusCode: res.status,
      });
    }
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: this.toStatus(data.status),
      provider: 'stripe',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  async getPayment(payment_id: string): Promise<PaymentIntent> {
    this.requireEnabled();
    const res = await fetch(`${STRIPE_API_BASE}/payment_intents/${payment_id}`, {
      method: 'GET',
      headers: this.headers,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('stripe', data.error?.code || 'API_ERROR', 'Stripe getPayment failed', {
        retryable: res.status >= 500,
        statusCode: res.status,
      });
    }
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: this.toStatus(data.status),
      provider: 'stripe',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  async cancelPayment(payment_id: string): Promise<PaymentIntent> {
    this.requireEnabled();
    const res = await fetch(`${STRIPE_API_BASE}/payment_intents/${payment_id}/cancel`, {
      method: 'POST',
      headers: this.headers,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('stripe', data.error?.code || 'API_ERROR', 'Stripe cancel failed', { retryable: false });
    }
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: 'cancelled',
      provider: 'stripe',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    this.requireEnabled();
    const params = new URLSearchParams();
    params.append('payment_intent', request.payment_id);
    if (request.amount) params.append('amount', String(request.amount));
    if (request.reason) params.append('reason', request.reason);
    if (request.metadata) {
      for (const [k, v] of Object.entries(request.metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }
    const res = await fetch(`${STRIPE_API_BASE}/refunds`, {
      method: 'POST',
      headers: this.headers,
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('stripe', data.error?.code || 'API_ERROR', 'Stripe refund failed', { retryable: res.status >= 500 });
    }
    return {
      id: data.id,
      payment_id: data.payment_intent,
      amount: data.amount,
      status: data.status === 'succeeded' ? 'succeeded' : data.status === 'pending' ? 'pending' : 'failed',
      reason: data.reason,
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  verifyWebhook(rawBody: string, signature: string): WebhookEvent {
    // Stripe signature: t=timestamp,v1=signature
    const parts = signature.split(',').reduce((acc, p) => {
      const [k, v] = p.split('=');
      acc[k] = v;
      return acc;
    }, {} as Record<string, string>);
    const timestamp = parts.t;
    const sig = parts.v1;
    if (!timestamp || !sig) {
      throw new IntegrationError('stripe', 'INVALID_SIGNATURE', 'Missing signature components', { retryable: false });
    }
    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSig = crypto.createHmac('sha256', this.webhookSecret).update(signedPayload).digest('hex');
    if (sig !== expectedSig) {
      throw new IntegrationError('stripe', 'INVALID_SIGNATURE', 'Signature mismatch', { retryable: false });
    }
    const event = JSON.parse(rawBody);
    return {
      id: event.id,
      type: event.type,
      provider: 'stripe',
      payload: event,
      signature,
      timestamp: parseInt(timestamp, 10),
      livemode: event.livemode ?? false,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    if (!this.enabled) return { ok: false, latency_ms: 0, error: 'Not configured' };
    const start = Date.now();
    try {
      const res = await fetch(`${STRIPE_API_BASE}/balance`, {
        method: 'GET',
        headers: this.headers,
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latency_ms: latency, error: `HTTP ${res.status}` };
      }
      return { ok: true, latency_ms: latency };
    } catch (e: any) {
      return { ok: false, latency_ms: Date.now() - start, error: e.message };
    }
  }
}
