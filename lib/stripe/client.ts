/**
 * Stripe Client Configuration
 * ────────────────────────────
 * Lazy-loaded Stripe client. Only initializes when keys are present.
 */
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === 'sk_test_REPLACE_ME') {
    return null;
  }
  _stripe = new Stripe(key, {
    apiVersion: '2024-12-18.acacia' as any,
    typescript: true,
  });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_REPLACE_ME';
}