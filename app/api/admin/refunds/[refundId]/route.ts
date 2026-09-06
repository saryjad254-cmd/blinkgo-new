/**
 * Admin: Get Single Refund
 * ────────────────────────
 * GET /api/admin/refunds/[refundId]
 *
 * Returns one refund with full audit history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { withErrorHandling, ok } from '@/lib/api/response';
import { err } from '@/lib/api/err';
import { withSecurity, type AuthedContext } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { checkRateLimit } from '@/lib/services/payment-rate-limit';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ refundId: string }> }): Promise<NextResponse<unknown>> {
  const params = await props.params;
  return (await withSecurity(
    secureRoute('open', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => getRefund(r as NextRequest, ctx, params.refundId) as any,
  )(req)) as unknown as NextResponse<unknown>;
}

async function getRefund(
  _req: NextRequest,
  ctx: { auth: AuthedContext },
  refundId: string,
): Promise<NextResponse<unknown>> {
  return withErrorHandling(async () => {
    const userId = ctx.auth.user.id;
    const role = ctx.auth.user.role;
    const permissions = (ctx.auth.user as { permissions?: string[] }).permissions ?? [];
    if (role !== 'super_admin' && !permissions.includes('payment_support')) {
      return err('forbidden', 'payment_support permission required', 403);
    }

    const rate = await checkRateLimit('adminRead', userId);
    if (!rate.allowed) {
      return err('rate_limited', 'Too many requests', 429);
    }

    const supabase = createServiceClient();
    const { data: refund, error } = await supabase
      .from('payment_refunds')
      .select('id, stripe_refund_id, status, requested_amount_cents, refunded_amount_cents, currency, reason, internal_note, requested_by, order_id, customer_id, payment_intent_id, charge_id, created_at, updated_at, completed_at, idempotency_key, failure_reason, stripe_event_id, metadata')
      .eq('id', refundId)
      .maybeSingle();

    if (error) {
      logger.error('admin.getRefund failed', { error: error.message, refundId });
      return err('lookup_failed', 'Failed to load refund', 500);
    }
    if (!refund) {
      return err('not_found', 'Refund not found', 404);
    }

    const { data: auditLog, error: auditErr } = await supabase
      .from('refund_audit_log')
      .select('id, action, previous_status, new_status, amount_cents, currency, reason, internal_note, actor_user_id, actor_role, request_id, stripe_event_id, idempotency_key, created_at, metadata')
      .eq('refund_id', refundId)
      .order('created_at', { ascending: true });

    if (auditErr) {
      logger.error('admin.getRefund.audit failed', { error: auditErr.message, refundId });
    }

    return ok({
      refund: {
        id: refund.id,
        stripe_refund_id: refund.stripe_refund_id ?? null,
        status: refund.status,
        requested_amount_cents: Number(refund.requested_amount_cents ?? 0),
        refunded_amount_cents: Number(refund.refunded_amount_cents ?? 0),
        currency: refund.currency,
        reason: refund.reason,
        internal_note: refund.internal_note ?? null,
        requested_by: refund.requested_by,
        order_id: refund.order_id,
        customer_id: refund.customer_id,
        payment_intent_id: refund.payment_intent_id,
        charge_id: refund.charge_id ?? null,
        created_at: refund.created_at,
        updated_at: refund.updated_at,
        completed_at: refund.completed_at ?? null,
        failure_reason: refund.failure_reason ?? null,
        stripe_event_id: refund.stripe_event_id ?? null,
      },
      audit: (auditLog ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        action: a.action,
        previous_status: a.previous_status,
        new_status: a.new_status,
        amount_cents: a.amount_cents,
        currency: a.currency,
        reason: a.reason,
        internal_note: null, // never expose internal_note in audit listing
        actor_user_id: a.actor_user_id,
        actor_role: a.actor_role,
        request_id: a.request_id,
        stripe_event_id: a.stripe_event_id,
        idempotency_key: a.idempotency_key,
        created_at: a.created_at,
      })),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  });
}
