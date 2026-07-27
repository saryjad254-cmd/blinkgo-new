/**
 * Apple Pay & Google Pay Providers
 * ───────────────────────────────
 * These are wallet methods that route through a processor (Stripe by default).
 * They create PaymentIntents that accept wallet payment methods.
 */

import type { PaymentProvider, PaymentIntent, RefundRequest, RefundResult, WebhookEvent, PaymentStatus } from './types';
import { IntegrationError, readProviderConfig } from '../types';

/**
 * Apple Pay - creates payment intents with apple_pay payment method
 * Uses Stripe as the processor (configure STRIPE_SECRET_KEY).
 */
export class ApplePayProvider implements PaymentProvider {
  public readonly name = 'apple_pay' as const;
  public readonly enabled: boolean;
  private readonly merchantId: string;
  private readonly processingPartner: string;

  constructor() {
    const cfg = readProviderConfig('APPLE_PAY');
    this.merchantId = cfg.public_key;
    this.processingPartner = process.env.STRIPE_SECRET_KEY ? 'stripe' : '';
    this.enabled = cfg.enabled && !!this.merchantId && !!this.processingPartner;
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('apple_pay', 'NOT_CONFIGURED', 'Apple Pay is not configured', { retryable: false });
    }
  }

  async createPaymentIntent(input: {
    amount: number;
    currency: string;
    customer_id?: string;
    metadata?: Record<string, any>;
    description?: string;
  }): Promise<PaymentIntent> {
    this.requireEnabled();
    // Apple Pay itself doesn't have a server-side API for creating payments.
    // The PaymentRequest happens on the client. The server then confirms via the processor.
    if (this.processingPartner === 'stripe') {
      const params = new URLSearchParams();
      params.append('amount', String(input.amount));
      params.append('currency', input.currency.toLowerCase());
      params.append('payment_method_types[]', 'card'); // Apple Pay surfaces as 'card'
      params.append('payment_method_types[]', 'apple_pay');
      if (input.metadata) {
        for (const [k, v] of Object.entries(input.metadata)) {
          params.append(`metadata[${k}]`, String(v));
        }
      }
      const res = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new IntegrationError('apple_pay', 'STRIPE_ERROR', data.error?.message || 'Apple Pay intent failed', { retryable: res.status >= 500 });
      }
      return {
        id: data.id,
        client_secret: data.client_secret,
        amount: data.amount,
        currency: data.currency,
        status: data.status === 'succeeded' ? 'succeeded' : 'pending',
        provider: 'apple_pay',
        created_at: new Date(data.created * 1000).toISOString(),
      };
    }
    throw new IntegrationError('apple_pay', 'NO_PROCESSOR', 'No processing partner configured', { retryable: false });
  }

  async confirmPayment(payment_id: string): Promise<PaymentIntent> {
    this.requireEnabled();
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('apple_pay', 'CONFIRM_FAILED', 'Apple Pay confirm failed', { retryable: false });
    }
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: data.status === 'succeeded' ? 'succeeded' : 'pending',
      provider: 'apple_pay',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  async getPayment(payment_id: string): Promise<PaymentIntent> {
    this.requireEnabled();
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: data.status === 'succeeded' ? 'succeeded' : 'pending',
      provider: 'apple_pay',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  async cancelPayment(payment_id: string): Promise<PaymentIntent> {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: 'cancelled',
      provider: 'apple_pay',
      created_at: new Date().toISOString(),
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const params = new URLSearchParams();
    params.append('payment_intent', request.payment_id);
    if (request.amount) params.append('amount', String(request.amount));
    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('apple_pay', 'REFUND_FAILED', 'Apple Pay refund failed', { retryable: res.status >= 500 });
    }
    return {
      id: data.id,
      payment_id: request.payment_id,
      amount: data.amount,
      status: 'succeeded',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  verifyWebhook(rawBody: string, signature: string): WebhookEvent {
    // Routed via Stripe webhook
    const event = JSON.parse(rawBody);
    return {
      id: event.id,
      type: event.type,
      provider: 'apple_pay',
      payload: event,
      signature,
      timestamp: event.created || Date.now() / 1000,
      livemode: event.livemode ?? false,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    if (!this.enabled) return { ok: false, latency_ms: 0, error: 'Not configured' };
    return { ok: true, latency_ms: 0 };
  }
}

/**
 * Google Pay - similar to Apple Pay, routes through Stripe
 */
export class GooglePayProvider implements PaymentProvider {
  public readonly name = 'google_pay' as const;
  public readonly enabled: boolean;
  private readonly merchantId: string;
  private readonly processingPartner: string;

  constructor() {
    const cfg = readProviderConfig('GOOGLE_PAY');
    this.merchantId = cfg.public_key;
    this.processingPartner = process.env.STRIPE_SECRET_KEY ? 'stripe' : '';
    this.enabled = cfg.enabled && !!this.merchantId && !!this.processingPartner;
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('google_pay', 'NOT_CONFIGURED', 'Google Pay is not configured', { retryable: false });
    }
  }

  async createPaymentIntent(input: {
    amount: number;
    currency: string;
    customer_id?: string;
    metadata?: Record<string, any>;
    description?: string;
  }): Promise<PaymentIntent> {
    this.requireEnabled();
    const params = new URLSearchParams();
    params.append('amount', String(input.amount));
    params.append('currency', input.currency.toLowerCase());
    params.append('payment_method_types[]', 'card');
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('google_pay', 'STRIPE_ERROR', 'Google Pay intent failed', { retryable: res.status >= 500 });
    }
    return {
      id: data.id,
      client_secret: data.client_secret,
      amount: data.amount,
      currency: data.currency,
      status: data.status === 'succeeded' ? 'succeeded' : 'pending',
      provider: 'google_pay',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  async confirmPayment(payment_id: string): Promise<PaymentIntent> {
    this.requireEnabled();
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: data.status === 'succeeded' ? 'succeeded' : 'pending',
      provider: 'google_pay',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  async getPayment(payment_id: string): Promise<PaymentIntent> {
    return this.confirmPayment(payment_id);
  }

  async cancelPayment(payment_id: string): Promise<PaymentIntent> {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: 'cancelled',
      provider: 'google_pay',
      created_at: new Date().toISOString(),
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const params = new URLSearchParams();
    params.append('payment_intent', request.payment_id);
    if (request.amount) params.append('amount', String(request.amount));
    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json();
    return {
      id: data.id,
      payment_id: request.payment_id,
      amount: data.amount,
      status: 'succeeded',
      created_at: new Date(data.created * 1000).toISOString(),
    };
  }

  verifyWebhook(rawBody: string, signature: string): WebhookEvent {
    const event = JSON.parse(rawBody);
    return {
      id: event.id,
      type: event.type,
      provider: 'google_pay',
      payload: event,
      signature,
      timestamp: event.created || Date.now() / 1000,
      livemode: event.livemode ?? false,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    return { ok: this.enabled, latency_ms: 0 };
  }
}
