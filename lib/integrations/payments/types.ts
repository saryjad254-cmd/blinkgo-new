/**
 * Payment Provider Types
 * ─────────────────────
 * Unified payment abstraction.
 */

export type PaymentProviderName = 'stripe' | 'paypal' | 'apple_pay' | 'google_pay';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export interface PaymentMethod {
  type: 'card' | 'paypal' | 'apple_pay' | 'google_pay' | 'cash' | 'sepa';
  token?: string; // provider-specific token
  brand?: string; // visa, mc, etc.
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  country?: string;
}

export interface PaymentIntent {
  id: string; // provider-specific
  client_secret?: string; // for client-side confirmation
  amount: number; // in cents
  currency: string; // ISO 4217
  status: PaymentStatus;
  provider: PaymentProviderName;
  metadata?: Record<string, any>;
  created_at: string;
  customer_id?: string;
  payment_method?: PaymentMethod;
  error?: { code: string; message: string };
}

export interface RefundRequest {
  payment_id: string;
  amount?: number; // partial refund; undefined = full
  reason?: string;
  metadata?: Record<string, any>;
}

export interface RefundResult {
  id: string;
  payment_id: string;
  amount: number;
  status: 'succeeded' | 'pending' | 'failed';
  reason?: string;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  provider: PaymentProviderName;
  payload: any;
  signature: string;
  timestamp: number;
  livemode: boolean;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  readonly enabled: boolean;

  /**
   * Create a payment intent (server-side).
   */
  createPaymentIntent(input: {
    amount: number;
    currency: string;
    customer_id?: string;
    payment_method?: PaymentMethod;
    metadata?: Record<string, any>;
    description?: string;
  }): Promise<PaymentIntent>;

  /**
   * Confirm/capture a payment (server-side).
   */
  confirmPayment(payment_id: string, opts?: { payment_method?: PaymentMethod }): Promise<PaymentIntent>;

  /**
   * Get payment status.
   */
  getPayment(payment_id: string): Promise<PaymentIntent>;

  /**
   * Cancel a payment (if still pending).
   */
  cancelPayment(payment_id: string): Promise<PaymentIntent>;

  /**
   * Issue a refund.
   */
  refund(request: RefundRequest): Promise<RefundResult>;

  /**
   * Verify webhook signature and parse event.
   */
  verifyWebhook(rawBody: string, signature: string): WebhookEvent;

  /**
   * Health check.
   */
  healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }>;
}
