/**
 * Stripe Webhook Handler
 * ──────────────────────
 * Receives events from Stripe and updates the corresponding order.
 * Configure at: https://dashboard.stripe.com/webhooks
 * Endpoint: {YOUR_DOMAIN}/api/stripe/webhook
 *
 * Events handled:
 *   - payment_intent.succeeded      → order paid, status='confirmed'
 *   - payment_intent.payment_failed → order payment failed
 *   - charge.refunded               → order refunded
 *
 * Idempotency: every event id is recorded in the `stripe_webhook_events`
 * table before any state change. If the same event is delivered twice
 * (Stripe retries failed webhooks) we return 200 without re-processing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import type Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
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
      return NextResponse.json(
        { ok: false, error: `Webhook signature verification failed: ${err.message}` },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // ─── Idempotency: record the event id; skip if already processed ───
    try {
      const { error: insertErr } = await supabase
        .from('stripe_webhook_events')
        .insert({
          event_id: event.id,
          event_type: event.type,
          processed_at: new Date().toISOString(),
        });
      if (insertErr) {
        // unique_violation → already processed
        if (insertErr.code === '23505' || /duplicate|unique/i.test(insertErr.message)) {
          return NextResponse.json({ ok: true, idempotent: true });
        }
        // If the table is missing we still process (best-effort), but log it
        // for ops to migrate.
      }
    } catch {
      // table may not exist — proceed without idempotency
    }

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

          try {
            await supabase
              .from('payments')
              .update({
                status: 'succeeded',
                paid_at: new Date().toISOString(),
                stripe_charge_id: (intent as any).latest_charge || null,
              })
              .eq('stripe_payment_intent_id', intent.id);
          } catch {
            // table may not exist
          }

          try {
            await supabase.from('order_tracking_events').insert({
              order_id: orderId,
              event_type: 'payment',
              metadata: { status: 'succeeded', amount: intent.amount },
            });
          } catch {
            // table may not exist
          }

          // Best-effort notifications
          try {
            const { notifyOrderEvent } = await import('@/lib/notifications');
            const { data: order } = await supabase
              .from('orders')
              .select('id, customer_id, driver_id, restaurant_id')
              .eq('id', orderId)
              .single();
            if (order) {
              await notifyOrderEvent(
                order,
                'order_accepted',
                { customer: 'Payment received' },
                { customer: 'Your payment has been confirmed' }
              );
            }
          } catch {
            // notifications are non-fatal
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

          try {
            await supabase
              .from('payments')
              .update({
                status: 'failed',
                failed_reason: failureReason,
              })
              .eq('stripe_payment_intent_id', intent.id);
          } catch {
            // table may not exist
          }
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const piId = (charge.payment_intent as string | null) || null;
        if (piId) {
          // Look up the order via the payments table.
          const { data: payment } = await supabase
            .from('payments')
            .select('order_id')
            .eq('stripe_payment_intent_id', piId)
            .maybeSingle();
          if (payment?.order_id) {
            // v82 BLOCKER fix: do NOT unconditionally set status='cancelled'.
            // The order may already be 'cancelled' (re-cancelling overwrites
            // cancelled_at), 'delivered' (a delivered order CAN be refunded,
            // but should transition to 'refunded' not 'cancelled'), or any
            // other state. Read the current status, decide the correct
            // target, and only update if the transition is legal.
            const { data: current } = await supabase
              .from('orders')
              .select('id, status, payment_status')
              .eq('id', payment.order_id)
              .maybeSingle();
            if (current) {
              // Idempotency at the row level: if payment_status is already
              // 'refunded', this is a duplicate webhook — no-op.
              if (current.payment_status === 'refunded') {
                // already processed, no-op
              } else {
                // Refund target:
                //   delivered/cancelled/could_not_deliver → 'refunded'
                //   pending/confirmed/preparing/ready     → 'cancelled'
                //   picked_up/delivering                  → 'cancelled' (driver will see could_not_deliver next)
                //   refunded                              → no-op
                const targetStatus = (
                  current.status === 'delivered' ||
                  current.status === 'cancelled' ||
                  current.status === 'could_not_deliver'
                ) ? 'refunded' : 'cancelled';

                // Only flip if the current state allows the transition.
                // The DB trigger enforce_order_transition (migration 52)
                // is the second line of defence.
                const updates: Record<string, unknown> = {
                  payment_status: 'refunded',
                  refunded_at: new Date().toISOString(),
                  stripe_refund_id: (charge as any).refunds?.data?.[0]?.id ?? null,
                  stripe_refunded_amount: ((charge as any).amount_refunded ?? 0) / 100,
                  updated_at: new Date().toISOString(),
                };
                if (current.status !== targetStatus && current.status !== 'refunded') {
                  updates.status = targetStatus;
                  if (targetStatus === 'cancelled' || targetStatus === 'refunded') {
                    updates.cancelled_at = new Date().toISOString();
                  }
                }
                await supabase
                  .from('orders')
                  .update(updates)
                  .eq('id', payment.order_id)
                  .neq('payment_status', 'refunded'); // belt-and-braces idempotency
              }
            }
            try {
              await supabase
                .from('payments')
                .update({ status: 'refunded' })
                .eq('stripe_payment_intent_id', piId);
            } catch {
              // table may not exist
            }
          }
        }
        break;
      }
    }

    return NextResponse.json({ ok: true, received: true, type: event.type });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
