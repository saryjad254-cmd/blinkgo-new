/**
 * Stripe Webhook Handler
 * ──────────────────────
 * Receives events from Stripe and updates order status.
 * Configure at: https://dashboard.stripe.com/webhooks
 * Endpoint: {YOUR_DOMAIN}/api/stripe/webhook
 *
 * Events handled:
 *   - payment_intent.succeeded   → order paid → status = 'confirmed'
 *   - payment_intent.payment_failed → order payment failed → keep pending
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

function getServiceClient() {
  return createServiceClient();
}

export async function POST(req: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ ok: false, error: 'Stripe not configured' }, { status: 503 });
    }
    const stripe = getStripe()!;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'STRIPE_WEBHOOK_SECRET not set' }, { status: 503 });
    }

    const body = await req.text();
    const sig = req.headers.get('stripe-signature');
    if (!sig) {
      return NextResponse.json({ ok: false, error: 'Missing signature' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret);
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
    }

    const supabase = getServiceClient();

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata.order_id;
        if (orderId) {
          await supabase
            .from('orders')
            .update({
              status: 'confirmed',
              payment_status: 'paid',
              paid_at: new Date().toISOString(),
            })
            .eq('id', orderId);

          // Update payments table
          try {
            await supabase.from('payments').update({
              status: 'succeeded',
              paid_at: new Date().toISOString(),
              stripe_charge_id: (intent as any).latest_charge || null,
            }).eq('stripe_payment_intent_id', intent.id);
          } catch (e) { /* table may not exist */ }

          // Add tracking event
          try {
            await supabase.from('order_tracking_events').insert({
              order_id: orderId,
              event_type: 'payment',
              metadata: { status: 'succeeded', amount: intent.amount },
            });
          } catch (e) { /* table may not exist */ }

          // Send notifications
          const { notifyOrderEvent } = await import('@/lib/notifications');
          const { data: order } = await supabase.from('orders').select('id, customer_id, driver_id, restaurant_id').eq('id', orderId).single();
          if (order) {
            await notifyOrderEvent(order, 'order_accepted', { customer: 'Payment received' }, { customer: 'Your payment has been confirmed' });
          }
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata.order_id;
        const failureReason = (intent as any).last_payment_error?.message || 'Unknown';
        if (orderId) {
          await supabase
            .from('orders')
            .update({ payment_status: 'failed' })
            .eq('id', orderId);

          // Update payments table
          try {
            await supabase.from('payments').update({
              status: 'failed',
              failed_reason: failureReason,
            }).eq('stripe_payment_intent_id', intent.id);
          } catch (e) { /* table may not exist */ }
        }
        break;
      }
    }

    return NextResponse.json({ ok: true, received: true, type: event.type });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}