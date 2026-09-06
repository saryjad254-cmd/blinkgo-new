/**
 * Stripe Client Configuration
 * ────────────────────────────
 * Lazy-loaded Stripe client. Only initializes when keys are present.
 */
import Stripe from 'stripe';
import { getPaymentSecretStatus } from '@/lib/services/payment-secrets';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const status = getPaymentSecretStatus();
  if (!status.canCreatePayments || status.mode === 'dev-mock') return null;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key, {
    apiVersion: '2026-06-24.dahlia',
    typescript: true,
  });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  const status = getPaymentSecretStatus();
  return status.canCreatePayments && status.mode !== 'dev-mock';
}
