import { NextResponse } from 'next/server';
import { isStripeConfigured } from '@/lib/stripe/client';
import { isDevPaymentEnabled } from '@/lib/stripe/dev-mode';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isStripeConfigured();
  const devPaymentEnabled = isDevPaymentEnabled();

  // Effective mode — what the client should actually use
  let mode: 'stripe' | 'dev' | 'unconfigured';
  if (configured) mode = 'stripe';
  else if (devPaymentEnabled) mode = 'dev';
  else mode = 'unconfigured';

  return NextResponse.json({
    configured,
    publishableKeySet: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
    devPaymentEnabled,
    mode,
  });
}
