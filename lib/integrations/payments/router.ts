/**
 * Payment Provider Router
 * ───────────────────────
 * Routes payment operations to the configured provider.
 * Falls back to dev simulator if no provider configured.
 */

import type { PaymentProvider, PaymentIntent, PaymentProviderName, RefundRequest, RefundResult, WebhookEvent } from './types';
import { StripeProvider } from './stripe';
import { PayPalProvider } from './paypal';
import { ApplePayProvider, GooglePayProvider } from './wallets';
import { IntegrationError } from '../types';

export class PaymentRouter {
  private providers: Map<PaymentProviderName, PaymentProvider> = new Map();

  constructor() {
    this.providers.set('stripe', new StripeProvider());
    this.providers.set('paypal', new PayPalProvider());
    this.providers.set('apple_pay', new ApplePayProvider());
    this.providers.set('google_pay', new GooglePayProvider());
  }

  get(name: PaymentProviderName): PaymentProvider | null {
    const p = this.providers.get(name);
    if (!p || !p.enabled) return null;
    return p;
  }

  /**
   * Get the default provider (priority: stripe > paypal > apple_pay > google_pay).
   */
  getDefault(): PaymentProvider {
    const priority: PaymentProviderName[] = ['stripe', 'paypal', 'apple_pay', 'google_pay'];
    for (const name of priority) {
      const p = this.get(name);
      if (p) return p;
    }
    throw new IntegrationError('payment', 'NO_PROVIDER', 'No payment provider is enabled', { retryable: false });
  }

  list(): { name: PaymentProviderName; enabled: boolean }[] {
    return Array.from(this.providers.entries()).map(([name, p]) => ({
      name,
      enabled: p.enabled,
    }));
  }

  async verifyWebhook(provider: PaymentProviderName, rawBody: string, signature: string): Promise<WebhookEvent> {
    const p = this.providers.get(provider);
    if (!p) {
      throw new IntegrationError(provider, 'UNKNOWN_PROVIDER', `Unknown provider: ${provider}`, { retryable: false });
    }
    return p.verifyWebhook(rawBody, signature);
  }
}

// Singleton
let _router: PaymentRouter | null = null;
export function getPaymentRouter(): PaymentRouter {
  if (!_router) _router = new PaymentRouter();
  return _router;
}
