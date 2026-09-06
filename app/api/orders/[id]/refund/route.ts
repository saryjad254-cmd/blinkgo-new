/**
 * Customer Refund Request
 * ────────────────────────
 * POST /api/orders/[id]/refund
 * Body: { reason: string }
 *
 * Customer-only. Submits a refund request for an order.
 * After restaurant review/admin approval, the refund is processed.
 *
 * Refund rules:
 *  - Order must be 'delivered' or 'cancelled'
 *  - Within 7 days of order placement
 *  - One refund request per order
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity, type AuthedContext } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { assertCanReadOrder } from '@/lib/api/ownership';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFUND_WINDOW_DAYS = 7;
const REFUND_REASONS = [
  'food_quality',
  'wrong_order',
  'missing_items',
  'late_delivery',
  'damaged',
  'other',
] as const;

const REFUND_REASON_MAP: Record<(typeof REFUND_REASONS)[number], string> = {
  food_quality: 'quality_issue',
  wrong_order: 'incorrect_item',
  missing_items: 'missing_item',
  late_delivery: 'delivery_failure',
  damaged: 'delivery_failure',
  other: 'other',
};

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  return (await withSecurity(
    secureRoute('strict', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => requestRefund(r as NextRequest, ctx, params.id) as any,
  )(req)) as unknown as NextResponse;
}

async function requestRefund(
  req: NextRequest,
  ctx: { auth: AuthedContext },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Ownership check
    await assertCanReadOrder(ctx.auth.user, orderId);

    // 2) Parse reason
    const body = await req.json().catch(() => ({}));
    const reasonKey = String(body.reason ?? '');
    if (!(REFUND_REASONS as readonly string[]).includes(reasonKey)) {
      throw new ValidationError('Invalid refund reason');
    }
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;

    // 3) Get order
    const supabase = createServiceClient();
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, customer_id, status, total, currency, payment_method, payment_intent_id, stripe_payment_intent_id, created_at')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new NotFoundError('Order not found');

    // 4) Check eligibility
    if (!['delivered', 'cancelled'].includes(order.status)) {
      throw new ValidationError(`Refunds can only be requested for delivered or cancelled orders (current: ${order.status})`);
    }

    const orderDate = new Date(order.created_at);
    const now = new Date();
    const daysSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceOrder > REFUND_WINDOW_DAYS) {
      throw new ValidationError(`Refund window has expired (${REFUND_WINDOW_DAYS} days)`);
    }

    // 5) A customer request is recorded as a pending refund operation, never
    //    as a second payment. Card orders use payment_refunds; cash orders
    //    become support cases because there is no Stripe PaymentIntent.
    const svc = createServiceClient();
    const reasonText = `${reasonKey}${notes ? `: ${notes}` : ''}`;
    let refundRow: { refund_id: string; order_id: string; amount: number; reason: string; status: string; already_exists: boolean } | null = null;
    const amount = Number(order.total);
    const paymentIntentId = order.payment_intent_id ?? order.stripe_payment_intent_id;

    if (paymentIntentId) {
      const idempotencyKey = `customer-refund-request:${orderId}`;
      const { data: existing } = await svc
        .from('payment_refunds')
        .select('id, order_id, requested_amount_cents, status, reason')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing) {
        refundRow = {
          refund_id: existing.id,
          order_id: existing.order_id,
          amount: Number(existing.requested_amount_cents ?? 0) / 100,
          reason: existing.reason ?? reasonText,
          status: existing.status,
          already_exists: true,
        };
      } else {
        const { data: inserted, error: insertError } = await svc
          .from('payment_refunds')
          .insert({
            payment_intent_id: paymentIntentId,
            order_id: orderId,
            customer_id: ctx.auth.user.id,
            requested_by: ctx.auth.user.id,
            requested_amount_cents: Math.round(amount * 100),
            refunded_amount_cents: 0,
            currency: String(order.currency ?? 'EUR').toUpperCase(),
            reason: REFUND_REASON_MAP[reasonKey as (typeof REFUND_REASONS)[number]],
            internal_note: notes,
            status: 'requested',
            idempotency_key: idempotencyKey,
            metadata: { source: 'customer_request', customer_reason: reasonKey },
          })
          .select('id, order_id, requested_amount_cents, status, reason')
          .single();

        if (insertError || !inserted) {
          if (insertError?.code === '23505') {
            const { data: raced } = await svc
              .from('payment_refunds')
              .select('id, order_id, requested_amount_cents, status, reason')
              .eq('idempotency_key', idempotencyKey)
              .maybeSingle();
            if (raced) {
              refundRow = {
                refund_id: raced.id,
                order_id: raced.order_id,
                amount: Number(raced.requested_amount_cents ?? 0) / 100,
                reason: raced.reason ?? reasonText,
                status: raced.status,
                already_exists: true,
              };
            }
          }
          if (!refundRow) {
            logger.error('Refund request INSERT failed', { orderId, error: insertError });
            throw new Error('Failed to create refund request');
          }
        } else {
          refundRow = {
            refund_id: inserted.id,
            order_id: inserted.order_id,
            amount: Number(inserted.requested_amount_cents ?? 0) / 100,
            reason: inserted.reason ?? reasonText,
            status: inserted.status,
            already_exists: false,
          };
        }
      }
    } else {
      const { data: existingTicket } = await svc
        .from('support_tickets')
        .select('id, order_id, status')
        .eq('user_id', ctx.auth.user.id)
        .eq('order_id', orderId)
        .eq('category', 'refund_request')
        .in('status', ['open', 'in_progress', 'waiting_customer'])
        .maybeSingle();

      if (existingTicket) {
        refundRow = { refund_id: existingTicket.id, order_id: orderId, amount, reason: reasonText, status: existingTicket.status, already_exists: true };
      } else {
        const nowMs = Date.now();
        const { data: ticket, error: ticketError } = await svc
          .from('support_tickets')
          .insert({
            user_id: ctx.auth.user.id,
            user_role: 'customer',
            category: 'refund_request',
            subject: `Refund request for order ${orderId.slice(0, 8)}`,
            message: reasonText,
            order_id: orderId,
            status: 'open',
            priority: 'normal',
            reference_code: `RF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            issue_type: 'refund_request',
            next_action: 'waiting_support',
            sla_due_at: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
          })
          .select('id, order_id, status')
          .single();
        if (ticketError || !ticket) {
          logger.error('Cash refund support ticket INSERT failed', { orderId, error: ticketError });
          throw new Error('Failed to create refund request');
        }
        refundRow = { refund_id: ticket.id, order_id: orderId, amount, reason: reasonText, status: ticket.status, already_exists: false };
      }
    }

    if (!refundRow) {
      throw new Error('Failed to create refund request');
    }
    const refund = {
      id: refundRow.refund_id,
      order_id: refundRow.order_id,
      amount: refundRow.amount,
      reason: refundRow.reason,
      status: refundRow.status,
    };
    const alreadyExists = Boolean(refundRow.already_exists);

    // 7) Notify admins (in-app) — skip if this was an idempotent retry
    //    (the existing refund request was already notified the first time).
    if (!alreadyExists) {
      try {
        const { data: admins } = await svc.from('users').select('id').in('role', ['admin', 'super_admin']);
        if (admins && admins.length > 0) {
          const notifications = admins.map((admin) => ({
            user_id: admin.id,
            type: 'refund_request',
            title: 'Neue Rückerstattungsanfrage',
            body: `Bestellung #${order.id.slice(0, 8)} · €${Number(order.total).toFixed(2)}`,
            data: { refund_id: refund.id, order_id: order.id },
          }));
          await svc.from('notifications').insert(notifications);
        }
      } catch (e) {
        // Non-fatal
        logger.warn('Failed to notify admins of refund', { refundId: refund.id, error: (e as Error).message });
      }
    }

    return ok({ refund, idempotent: alreadyExists });
  });
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  return (await withSecurity(
    secureRoute('lenient', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => listRefunds(ctx, params.id) as any,
  )(_req)) as unknown as NextResponse;
}

async function listRefunds(
  ctx: { auth: { user: { id: string; role: string } } },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // Ownership check
    await assertCanReadOrder(ctx.auth.user, orderId);

    // Phase 7G-D: refunds now live in payment_refunds. Customer can see
    // their own refunds; internal_note is NEVER exposed.
    const supabase = createServiceClient();
    const { data: refundRows, error } = await supabase
      .from('payment_refunds')
      .select('id, order_id, requested_amount_cents, refunded_amount_cents, currency, status, reason, created_at, completed_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn('listRefunds: payment_refunds query failed', { orderId, error: error.message });
      return ok({ refunds: [] });
    }

    // Project to the customer-safe shape (no internal_note, no metadata)
    const refunds = (refundRows ?? []).map((refund) => ({
      id: refund.id,
      order_id: refund.order_id,
      amount: (refund.requested_amount_cents ?? 0) / 100,
      refunded_amount: (refund.refunded_amount_cents ?? 0) / 100,
      currency: refund.currency ?? 'EUR',
      status: refund.status,
      reason: refund.reason ?? null,
      created_at: refund.created_at,
      completed_at: refund.completed_at ?? null,
    }));
    return ok({ refunds });
  });
}
