import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/admin-guard';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => listRefunds() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function listRefunds(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const svc = createServiceClient();
    // v84: refund REQUEST workflow now lives in the `payments` table
    // (status IN refund_requested/refund_processing/refund_succeeded/refund_failed).
    // The legacy `refunds` table from migration-22 was never deployed to production.
    const { data: refundRows } = await svc
      .from('payments')
      .select('id, order_id, amount_cents, currency, status, metadata, created_at, updated_at, orders(order_number, total, customer_id)')
      .in('status', ['refund_requested', 'refund_processing', 'refund_succeeded', 'refund_failed'])
      .order('created_at', { ascending: false });
    const refunds = (refundRows ?? []).map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      amount: (r.amount_cents ?? 0) / 100,
      currency: r.currency ?? 'EUR',
      status: r.status,
      reason: r.metadata?.refund_reason ?? null,
      stripe_refund_id: null,
      processed_at: r.updated_at,
      processed_by: r.metadata?.processed_by ?? null,
      created_at: r.created_at,
      orders: r.orders,
    }));
    return ok({ refunds });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => processRefund(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function processRefund(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const action = url.searchParams.get('action');
    if (!id) return ok({ processed: false });
    const svc = createServiceClient();

    if (action !== 'process') {
      return ok({ processed: false, reason: 'unknown action' });
    }

    // v84: atomic CAS on the payments table (the v84 home for refund
    // requests). Two admins cannot both process the same refund.
    const now = new Date().toISOString();
    const adminId = guard.auth?.user?.id ?? 'unknown';
    const { data: claimed, error: claimErr } = await svc
      .from('payments')
      .update({
        status: 'refund_processing',
        updated_at: now,
      })
      .eq('id', id)
      .eq('status', 'refund_requested')
      .select('id, order_id, amount_cents, currency, metadata')
      .maybeSingle();

    if (claimErr) {
      logger.error('Refund claim failed', { id }, claimErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to claim refund' },
        { status: 500 },
      );
    }
    if (!claimed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Refund already processed or not eligible',
          code: 'REFUND_NOT_CLAIMABLE',
        },
        { status: 409 },
      );
    }

    // Look up the order to get the Stripe payment intent.
    const { data: order } = await svc
      .from('orders')
      .select('id, status, payment_status, stripe_payment_intent_id, total, currency, customer_id, order_number')
      .eq('id', claimed.order_id)
      .maybeSingle();

    let stripeRefundId: string | null = null;
    let stripeError: string | null = null;
    const claimAmount = (claimed.amount_cents ?? 0) / 100;

    if (order?.stripe_payment_intent_id) {
      try {
        const { getStripe, isStripeConfigured } = await import('@/lib/stripe/client');
        if (isStripeConfigured()) {
          const stripe = getStripe()!;
          // Idempotency key dedupes Stripe-side: a retry with the same
          // key returns the original refund instead of issuing a new one.
          const refund = await stripe.refunds.create(
            {
              payment_intent: order.stripe_payment_intent_id,
              amount: claimed.amount_cents,
              reason: 'requested_by_customer',
              metadata: {
                order_id: order.id,
                order_number: order.order_number ?? '',
                refund_id: claimed.id,
                processed_by: adminId,
              },
            },
            { idempotencyKey: `refund:${claimed.id}` },
          );
          stripeRefundId = refund.id;
        } else {
          stripeError = 'stripe_not_configured';
          logger.error('Stripe refund skipped — client not configured', { refundId: claimed.id });
        }
      } catch (e: any) {
        stripeError = e?.message ?? String(e);
        logger.error('Stripe refund failed', { refundId: claimed.id, error: stripeError });
      }
    } else {
      stripeError = 'no_payment_intent';
    }

    // Mark refund succeeded (or failed) and update the order.
    const finalStatus = stripeError && !stripeRefundId ? 'refund_failed' : 'refund_succeeded';
    const refundUpdate: Record<string, unknown> = {
      status: finalStatus,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(claimed.metadata ?? {}),
        processed_by: adminId,
        stripe_refund_id: stripeRefundId,
        stripe_error: stripeError,
        processed_at: finalStatus === 'refund_succeeded' ? new Date().toISOString() : null,
      },
    };
    await svc.from('payments').update(refundUpdate).eq('id', id);

    if (finalStatus === 'refund_succeeded' && order) {
      await svc.from('orders').update({
        status: 'refunded',
        payment_status: 'refunded',
        refunded_at: new Date().toISOString(),
        refund_amount: claimAmount,
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);
    }

    await audit('ADMIN_CONFIG_CHANGED', {
      severity: 'warn',
      userId: adminId,
      userRole: 'admin',
      resource: 'refund',
      resourceId: id,
      metadata: {
        action: 'process',
        amount: claimAmount,
        stripe_refund_id: stripeRefundId,
        stripe_error: stripeError,
      },
    });

    return ok({
      processed: true,
      status: finalStatus,
      stripe_refund_id: stripeRefundId,
      stripe_error: stripeError,
    });
  });
}
