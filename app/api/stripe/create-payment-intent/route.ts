/**
 * Stripe Create Payment Intent
 * ─────────────────────────────
 * Creates a PaymentIntent for the order total. Returns the clientSecret
 * for Stripe Elements / PaymentSheet.
 *
 * Required env vars (provide before going live):
 *   - STRIPE_SECRET_KEY                (sk_test_... or sk_live_...)
 *   - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  (pk_test_... or pk_live_...)
 *   - STRIPE_WEBHOOK_SECRET            (whsec_...) — only for webhook
 *
 * Delivery zone: address validation is enforced by the order creation
 * endpoint (`/api/orders`) using the canonical `checkDeliveryZone` from
 * `@/lib/delivery-zone`. By the time a payment intent is created the
 * order already exists, so we only re-check that the address stored on
 * the order is still in the zone (handles race conditions where the
 * zone rule changes between order creation and payment).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { checkDeliveryZone } from '@/lib/delivery-zone';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getServiceClient() {
  return createServiceClient();
}

export async function POST(req: NextRequest) {
  try {
    // F11 (qa-1): rate-limit payment-intent creation (financial route)
    const limited = rateLimit({ limit: 20, windowSec: 15 * 60, name: 'stripe-pi' }, req);
    if (limited) return limited;

    // 1. Auth check
    const auth = await getApiUserWithRole();
    if (!auth || auth.profile.role !== 'customer') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Stripe must be configured
    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Payments are temporarily unavailable. Please contact support.',
          needsKeys: true,
        },
        { status: 503 }
      );
    }

    const stripe = getStripe()!;

    const { order_id } = await req.json();
    if (!order_id) {
      return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 });
    }

    // 3. Load the order (must belong to the authenticated user)
    const supabase = getServiceClient();
    // Look up the order WITHOUT the customer_id filter first so the
    // error response can distinguish "order does not exist" (404)
    // from "order belongs to a different customer" (403). The single()
    // call still returns at most one row.
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, total, customer_id, status, payment_status, currency, delivery_address, delivery_lat, delivery_lng, delivery_postal_code, stripe_payment_intent_id')
      .eq('id', order_id)
      .single();

    if (error || !order) {
      // eslint-disable-next-line no-console
      console.warn('[create-payment-intent] order not found', {
        order_id: order_id,
        customer_id: auth.user.id,
        supabase_error: error?.message,
      });
      return NextResponse.json(
        { ok: false, error: 'Order not found', order_id: order_id },
        { status: 404 }
      );
    }
    if (order.customer_id !== auth.user.id) {
      // eslint-disable-next-line no-console
      console.warn('[create-payment-intent] order ownership mismatch', {
        order_id: order_id,
        order_customer_id: order.customer_id,
        auth_user_id: auth.user.id,
      });
      return NextResponse.json({ ok: false, error: 'Not your order' }, { status: 403 });
    }
    if (order.payment_status === 'paid') {
      return NextResponse.json({ ok: false, error: 'Order already paid' }, { status: 409 });
    }

    // 4. Re-check delivery zone (defence in depth: order creation already
    //    validated this, but the canonical zone may have changed between
    //    order creation and payment).
    if (order.delivery_lat != null && order.delivery_lng != null) {
      const zone = checkDeliveryZone(
        Number(order.delivery_lat),
        Number(order.delivery_lng),
        (order as any).delivery_postal_code ?? null
      );
      if (!zone.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `deliveryTooFar:${zone.distanceKm.toFixed(1)}:15`,
            zone,
          },
          { status: 422 }
        );
      }
    }

    // 5. Idempotent create: re-use the existing PaymentIntent if it is
    //    still open. Stripe's `idempotency-key` is also passed so that a
    //    retried request cannot create two intents for the same order.
    const idempotencyKey = `pi:${order.id}`;
    let paymentIntentId = (order as any).stripe_payment_intent_id as string | null;

    if (paymentIntentId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (existing.status === 'succeeded' || existing.status === 'canceled') {
          return NextResponse.json(
            { ok: false, error: `PaymentIntent already ${existing.status}` },
            { status: 409 }
          );
        }
        return NextResponse.json({
          ok: true,
          clientSecret: existing.client_secret,
          paymentIntentId: existing.id,
        });
      } catch {
        // PaymentIntent was deleted or belongs to another account — fall
        // through and create a new one.
        paymentIntentId = null;
      }
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: Math.round(Number(order.total) * 100), // Stripe expects cents
        currency: 'eur',
        metadata: {
          order_id: order.id,
          customer_id: order.customer_id,
        },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey }
    );

    // Save the intent id on the order (best-effort).
    await supabase
      .from('orders')
      .update({ stripe_payment_intent_id: intent.id })
      .eq('id', order.id);

    // Record the intent in the `payments` table (best-effort, will not
    // fail the request if the table is missing).
    try {
      await supabase.from('payments').insert({
        order_id: order.id,
        amount_cents: Math.round(Number(order.total) * 100),
        currency: 'EUR',
        payment_method: 'card',
        payment_provider: 'stripe',
        provider_payment_id: intent.id,
        // v84 fix: also write the legacy column name so the webhook
        // (which still reads by `stripe_payment_intent_id`) can find
        // the row. The migration 56-schema-reconcile ensures the
        // column exists on production.
        stripe_payment_intent_id: intent.id,
        customer_id: order.customer_id,
        status: 'pending',
        metadata: { source: 'create-payment-intent', customer_id: order.customer_id },
      });
    } catch {
      // table may not exist
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

/**
 * GET — return 405 (Method Not Allowed) so this route is discoverable
 * as existing. Without an explicit handler, a GET to a POST-only App
 * Router route would be a 404, which is misleading: the route does
 * exist, it just does not accept GET.
 */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] },
    {
      status: 405,
      headers: { Allow: 'POST' },
    }
  );
}
