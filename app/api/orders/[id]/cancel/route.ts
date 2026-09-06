/**
 * Customer Order Cancellation
 * ───────────────────────────
 * POST /api/orders/[id]/cancel
 * Body: { reason?: string }
 *
 * Customer-only. Cancels an order that is in 'pending' or 'confirmed' state.
 * After 'preparing' has started, customers must contact the restaurant.
 *
 * v81: Hardened with withSecurity wrapper + ownership check + rate limit +
 * canonical error shape.
 *
 * v83: Cancel + refund atomicity (SENIOR-QA-V83-2). Stripe-paid orders
 * transition to the intermediate state 'cancel_refund_pending' first
 * (per migration 55), then the Stripe refund is attempted. If the
 * refund succeeds, the order is moved to 'cancelled' +
 * payment_status='refunded'. If the refund fails, the order is left in
 * 'cancel_refund_pending' for admin reconciliation (visible via the
 * v_stuck_cancel_refunds view).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity, type AuthedContext } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { assertCanReadOrder } from '@/lib/api/ownership';
import { ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FROM_STATES = ['pending', 'confirmed'];

async function cancelOrder(
  req: NextRequest,
  ctx: { auth: AuthedContext },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // Ownership check (also throws 404 if not found)
    await assertCanReadOrder(ctx.auth.user, orderId);

    // Parse optional reason
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

    // State check — re-read the order to check current status
    const supabaseRead = createServiceClient();
    const { data: orderRow } = await supabaseRead
      .from('orders')
      .select('id, status, customer_id')
      .eq('id', orderId)
      .single();
    if (!ALLOWED_FROM_STATES.includes(String(orderRow?.status))) {
      throw new ConflictError(
        `Order can no longer be cancelled (current status: ${orderRow?.status})`,
        { current_status: orderRow?.status, allowed_from: ALLOWED_FROM_STATES, code: 'CANCEL_TOO_LATE' },
      );
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    // v83 fix: cancel + refund atomicity (SENIOR-QA-V83-2).
    // The previous flow marked the order as 'cancelled' first, then
    // attempted the Stripe refund. If the refund failed, the order
    // was cancelled but the customer was never refunded — a worse
    // outcome than not cancelling. The new flow:
    //
    //   1. If the order is paid by Stripe, transition to the
    //      intermediate state 'cancel_refund_pending'. The DB trigger
    //      from migration 55 allows this transition.
    //   2. Attempt the Stripe refund. If it succeeds, transition to
    //      'cancelled' + payment_status='refunded'. If it fails, the
    //      order stays in 'cancel_refund_pending' so an admin can
    //      reconcile (visible via the v_stuck_cancel_refunds view).
    //   3. For cash orders or Stripe orders without a payment intent,
    //      transition directly to 'cancelled'.
    //
    // The state machine in lib/services/order-service.ts and the DB
    // trigger enforce_order_transition() both allow this intermediate
    // state, so the rest of the system can render the order correctly
    // (e.g. the kitchen still sees it as a normal cancel, the driver
    // sees the order as released).
    const { data: orderRowForRefund } = await supabase
      .from('orders')
      .select('id, status, payment_method, payment_status, stripe_payment_intent_id, total, last_refund_status')
      .eq('id', orderId)
      .single();

    const needsStripeRefund =
      (orderRowForRefund?.payment_method === 'stripe' ||
        orderRowForRefund?.payment_method === 'card') &&
      !!orderRowForRefund?.stripe_payment_intent_id &&
      (orderRowForRefund?.payment_status === 'paid' ||
        orderRowForRefund?.payment_status === 'succeeded');

    const initialStatus = needsStripeRefund ? 'cancel_refund_pending' : 'cancelled';

    // Cancel atomically (only if still in allowed state)
    // v87-7H-A fix: do NOT write to non-existent columns (cancellation_reason,
    // stripe_refund_id, stripe_refunded_amount, points_redeemed). Real DB has
    // amount_refunded_cents, last_refund_at, last_refund_status. Cancellation
    // reason is preserved in the notification body and the audit log.
    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({
        status: initialStatus,
        cancelled_at: now,
        updated_at: now,
      })
      .eq('id', orderId)
      .in('status', ALLOWED_FROM_STATES)
      .select()
      .single();
    if (updErr || !updated) {
      throw new ConflictError('Order state changed — please refresh');
    }

    // Free the driver
    if (updated.driver_id) {
      try {
        await supabase
          .from('driver_status')
          .update({ is_on_delivery: false, current_order_id: null, updated_at: now })
          .eq('driver_id', updated.driver_id)
          .eq('current_order_id', orderId);
      } catch (e) {
        logger.warn('driver_status free-up failed (non-fatal)', { orderId }, e);
      }
    }

    // Notify the restaurant
    try {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('owner_id, name')
        .eq('id', updated.restaurant_id)
        .single();
      if (restaurant?.owner_id) {
        await supabase.from('notifications').insert({
          user_id: restaurant.owner_id,
          type: 'order_cancelled',
          title: 'Bestellung storniert',
          body: `Bestellung #${updated.order_number} wurde vom Kunden storniert${reason ? ` (Grund: ${reason})` : ''}`,
          data: { order_id: orderId, order_number: updated.order_number, reason },
          is_read: false,
        });
      }
    } catch (e) {
      logger.warn('Restaurant notification failed (non-fatal)', { orderId }, e);
    }

    // Notify the driver (if assigned)
    if (updated.driver_id) {
      try {
        await supabase.from('notifications').insert({
          user_id: updated.driver_id,
          type: 'order_cancelled',
          title: 'Bestellung storniert',
          body: `Bestellung #${updated.order_number} wurde storniert`,
          data: { order_id: orderId, order_number: updated.order_number },
          is_read: false,
        });
      } catch (e) {
        logger.warn('Driver notification failed (non-fatal)', { orderId }, e);
      }
    }

    // Refund loyalty points if redeemed
    // v87-7H-A fix: points_redeemed column does not exist in real DB. Loyalty
    // points are awarded on completion; on cancel we no-op (no reverse-lookup
    // available). This is a known limitation; the customer loses the points
    // for this order. Future migration should add a `points_awarded` column
    // or a separate order_points table.
    // Skipping loyalty refund — column missing in real schema.

    // Refund Stripe for card payments
    // v83 fix (SENIOR-QA-V83-2): with the new 'cancel_refund_pending'
    // intermediate state, we now attempt the Stripe refund AFTER the
    // order is in that state. On success we transition to 'cancelled'
    // + payment_status='refunded'. On failure we leave the order in
    // 'cancel_refund_pending' so the ops view
    // v_stuck_cancel_refunds surfaces it for manual reconciliation.
    // The customer's experience: they see the order as cancelled
    // (the kitchen and driver have released it), but the refund is
    // still being processed — better than a silent lost refund.
    let stripe_refund: { id: string; amount: number; status: string } | null = null;
    let stripe_refund_error: string | null = null;
    let finalStatus = initialStatus; // 'cancelled' or 'cancel_refund_pending'
    let finalPaymentStatus: string | undefined;
    if (needsStripeRefund) {
      try {
        const { getStripe } = await import('@/lib/stripe/client');
        const stripe = getStripe();
        if (stripe) {
          const refundAmount = Math.round(Number(updated.total ?? 0) * 100);
          const refund = await stripe.refunds.create({
            payment_intent: updated.stripe_payment_intent_id!,
            amount: refundAmount,
            reason: 'requested_by_customer',
            metadata: {
              order_id: orderId,
              order_number: String(updated.order_number ?? ''),
              cancelled_by: ctx.auth.user.id,
              cancellation_reason: reason ?? '',
            },
          });
          stripe_refund = { id: refund.id, amount: refund.amount, status: refund.status ?? 'unknown' };
          // Refund succeeded — transition to 'cancelled' (terminal for the
          // cancel flow). The webhook will also fire and try to update the
          // status; that's idempotent because of the payment_status check
          // in the webhook handler.
          // v87-7H-A fix: use real DB columns (amount_refunded_cents,
          // last_refund_at, last_refund_status). Removed: stripe_refund_id,
          // stripe_refunded_amount.
          const { data: finalOrder, error: finalErr } = await supabase
            .from('orders')
            .update({
              status: 'cancelled',
              payment_status: 'refunded',
              amount_refunded_cents: refund.amount,
              last_refund_at: new Date().toISOString(),
              last_refund_status: 'succeeded',
              refunded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderId)
            .eq('status', 'cancel_refund_pending') // belt-and-braces guard
            .select()
            .maybeSingle();
          if (finalErr) {
            stripe_refund_error = `Refund succeeded but DB transition failed: ${finalErr.message}`;
            logger.error('Stripe refund succeeded but DB transition failed', { orderId, err: finalErr });
          } else if (finalOrder) {
            finalStatus = 'cancelled';
            finalPaymentStatus = 'refunded';
          } else {
            // Already transitioned by the webhook; that's fine.
            finalPaymentStatus = 'refunded';
          }
        } else {
          stripe_refund_error = 'stripe_not_configured';
          logger.error('Stripe refund skipped — client not configured', { orderId, paymentIntent: updated.stripe_payment_intent_id });
          // Leave the order in cancel_refund_pending for ops to reconcile.
        }
      } catch (error: unknown) {
        stripe_refund_error = error instanceof Error ? error.message : String(error);
        logger.error('Stripe refund failed — order left in cancel_refund_pending for ops reconciliation', { orderId, paymentIntent: updated.stripe_payment_intent_id, err: error });
        // The order is in cancel_refund_pending. We DO NOT roll back to
        // pending because the customer has been told the cancel succeeded
        // and the kitchen / driver have already been notified. An admin
        // can retry the refund via /api/admin/refunds.
      }
    }

    return ok({
      order: { ...updated, status: finalStatus, payment_status: finalPaymentStatus ?? updated.payment_status },
      refunded_points: 0, // v87-7H-A: points_redeemed column missing in real DB
      stripe_refund,
      stripe_refund_error,
      final_status: finalStatus,
    });
  });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  // v81: withSecurity wrapper enforces auth + role + rate limit.
  // The handler closure receives the route id from params.
  return (await withSecurity(
    secureRoute('orderCancel', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => cancelOrder(r, ctx, params.id) as any,
  )(req)) as NextResponse;
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
