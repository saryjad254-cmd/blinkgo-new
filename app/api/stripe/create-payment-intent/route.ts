/**
 * Stripe Create Payment Intent
 * ─────────────────────────────
 * Creates a PaymentIntent for the order total.
 * Returns the clientSecret for Stripe Elements / PaymentSheet.
 *
 * Required env vars (provide before going live):
 *   - STRIPE_SECRET_KEY      (sk_test_... or sk_live_...)
 *   - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  (pk_test_... or pk_live_...)
 *   - STRIPE_WEBHOOK_SECRET  (whsec_...)  — only for webhook
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { isDevPaymentEnabled, simulateDevPayment } from '@/lib/stripe/dev-mode';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

function getServiceClient() {
  return createServiceClient();
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const auth = await getApiUserWithRole();
    if (!auth || auth.profile.role !== 'customer') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 });
    }

    // 2a. Dev-payment mode (no real Stripe required)
    if (!isStripeConfigured() && isDevPaymentEnabled()) {
      try {
        const result = await simulateDevPayment({
          orderId: order_id,
          customerId: auth.user.id,
        });
        return NextResponse.json({
          mode: 'dev',
          ...result,  // includes ok: true
        });
      } catch (e: any) {
        return NextResponse.json(
          { ok: false, error: `Dev payment failed: ${e.message}` },
          { status: 400 }
        );
      }
    }

    // 2b. Stripe check
    if (!isStripeConfigured()) {
      // SECURITY: don't expose env var names in customer-facing error.
      // The requiredKeys list is for the developer console only.
      return NextResponse.json(
        {
          ok: false,
          error: 'Payments are temporarily unavailable. Please contact support.',
          needsKeys: true,
          devPaymentAvailable: isDevPaymentEnabled(),
          // Only include the developer-facing details in NODE_ENV !== 'production'
          ...(process.env.NODE_ENV !== 'production' && {
            requiredKeys: [
              'STRIPE_SECRET_KEY (sk_test_... oder sk_live_...)',
              'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_... oder pk_live_...)',
              'STRIPE_WEBHOOK_SECRET (whsec_...) für Webhooks',
            ],
          }),
        },
        { status: 503 }
      );
    }

    const stripe = getStripe()!;

    // 3. Get order
    const supabase = getServiceClient();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, total, customer_id, status, currency')
      .eq('id', order_id)
      .single();

    if (error || !order) {
      return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
    }
    if (order.customer_id !== auth.user.id) {
      return NextResponse.json({ ok: false, error: 'Not your order' }, { status: 403 });
    }

    // 4. Create or retrieve PaymentIntent
    // We store the PaymentIntent ID on the order for later reference
    let paymentIntentId = (order as any).stripe_payment_intent_id;

    if (paymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (existing.status === 'succeeded' || existing.status === 'canceled') {
        return NextResponse.json({ ok: false, error: `PaymentIntent already ${existing.status}` }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        clientSecret: existing.client_secret,
        paymentIntentId: existing.id,
      });
    }

    // Create new
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(Number(order.total) * 100), // Stripe expects cents
      currency: 'eur',
      metadata: {
        order_id: order.id,
        customer_id: order.customer_id,
      },
      automatic_payment_methods: { enabled: true },
    });

    // Save to order
    await supabase
      .from('orders')
      .update({ stripe_payment_intent_id: intent.id })
      .eq('id', order.id);

    // Also record in payments table (best-effort, won't fail if table missing)
    try {
      await supabase.from('payments').insert({
        order_id: order.id,
        amount_cents: Math.round(Number(order.total) * 100),
        currency: 'EUR',
        payment_method: 'card',
        payment_provider: 'stripe',
        provider_payment_id: intent.id,
        status: 'pending',
        metadata: { source: 'create-payment-intent', customer_id: order.customer_id },
      });
    } catch (e: any) {
    }

    return NextResponse.json({
      ok: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}