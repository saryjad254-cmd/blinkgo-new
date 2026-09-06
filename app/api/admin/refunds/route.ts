/**
 * Admin: List + Filter All Refunds
 * ────────────────────────────────
 * Phase 7G-D: read-only listing of all refunds across orders.
 *
 * GET /api/admin/refunds?status=...&order_id=...&customer_id=...
 *
 * Authorization: admin + payment_support
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

export async function GET(req: NextRequest): Promise<NextResponse<unknown>> {
  return (await withSecurity(
    secureRoute('open', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => listRefunds(r as NextRequest, ctx) as any,
  )(req)) as unknown as NextResponse<unknown>;
}

async function listRefunds(
  req: NextRequest,
  ctx: { auth: AuthedContext },
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
      return err('rate_limited', 'Too many requests; slow down.', 429, {
        'Retry-After': String(Math.max(1, rate.retryAfterSeconds)),
      });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status');
    const orderIdFilter = url.searchParams.get('order_id');
    const customerIdFilter = url.searchParams.get('customer_id');
    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.max(1, Math.min(200, isNaN(limitParam) ? 50 : limitParam));

    const supabase = createServiceClient();
    let q = supabase
      .from('payment_refunds')
      .select('id, stripe_refund_id, status, requested_amount_cents, refunded_amount_cents, currency, reason, requested_by, order_id, customer_id, created_at, updated_at, completed_at, idempotency_key, failure_reason')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statusFilter) q = q.eq('status', statusFilter);
    if (orderIdFilter) q = q.eq('order_id', orderIdFilter);
    if (customerIdFilter) q = q.eq('customer_id', customerIdFilter);

    const { data, error } = await q;
    if (error) {
      logger.error('admin.listRefunds failed', { error: error.message });
      return err('list_failed', 'Failed to list refunds', 500);
    }

    return ok({
      refunds: (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        stripe_refund_id: r.stripe_refund_id ?? null,
        status: r.status,
        requested_amount_cents: Number(r.requested_amount_cents ?? 0),
        refunded_amount_cents: Number(r.refunded_amount_cents ?? 0),
        currency: r.currency,
        reason: r.reason,
        requested_by: r.requested_by,
        order_id: r.order_id,
        customer_id: r.customer_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        completed_at: r.completed_at ?? null,
        failure_reason: r.failure_reason ?? null,
      })),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  });
}
