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
import { logger } from '@/lib/logging';

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
          // IDEMPOTENCY (v92): Stripe retries deliver the same event more than
          // once. The order/payment UPDATEs below are naturally idempotent, but
          // the tracking-event INSERT and the customer notification are not —
          // a retry previously produced duplicate history rows and a second
          // "payment received" message. Detect prior processing first and run
          // the one-shot side-effects only when this is genuinely new.
          const { data: prior } = await supabase
            .from('orders')
            .select('payment_status')
            .eq('id', orderId)
            .maybeSingle();
          const alreadyPaid = prior?.payment_status === 'paid';

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

          // One-shot side-effects — skipped on a duplicate delivery.
          if (!alreadyPaid) {
            try {
              await supabase.from('order_tracking_events').insert({
                order_id: orderId,
                event_type: 'payment',
                metadata: { status: 'succeeded', amount: intent.amount },
              });
            } catch (e) { /* table may not exist */ }

            const { notifyOrderEvent } = await import('@/lib/notifications');
            const { data: order } = await supabase.from('orders').select('id, customer_id, driver_id, restaurant_id').eq('id', orderId).single();
            if (order) {
              await notifyOrderEvent(order, 'order_accepted', { customer: 'Payment received' }, { customer: 'Your payment has been confirmed' });
            }
          } else {
            logger.info('Stripe webhook: duplicate payment_intent.succeeded ignored', {
              order_id: orderId, event_id: event.id,
            });
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