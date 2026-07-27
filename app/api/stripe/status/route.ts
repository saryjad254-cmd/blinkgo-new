import { NextResponse } from 'next/server';
import { isStripeConfigured } from '@/lib/stripe/client';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

/**
 * Stripe status endpoint — reports whether the server has Stripe keys
 * configured. Used by `StripeCheckout` to decide whether to render the
 * real payment button or the "Stripe not configured" warning.
 */
export async function GET() {
  const configured = isStripeConfigured();

  return NextResponse.json({
    configured,
    publishableKeySet: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
    mode: configured ? 'stripe' : 'unconfigured',
  });
}
