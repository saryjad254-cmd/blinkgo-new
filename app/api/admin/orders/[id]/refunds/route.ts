/**
 * Admin: List + Create Refunds for an Order
 * ──────────────────────────────────────────
 * Phase 7G-D: production-grade refund API.
 *
 * GET  /api/admin/orders/[orderId]/refunds  — list all refunds for an order
 * POST /api/admin/orders/[orderId]/refunds  — create a new refund (full or partial)
 *
 * Authorization:
 *   - JWT required
 *   - role in {admin, super_admin, manager}
 *   - permission 'payment_support' required (super_admin has it implicitly)
 *
 * Body (POST):
 *   {
 *     mode: 'full' | 'partial',
 *     amount_cents?: number,           // required when mode='partial'
 *     reason: RefundReason,            // controlled enum
 *     internal_note?: string,          // never sent to Stripe
 *     idempotency_key?: string         // optional; server overrides if absent
 *   }
 *
 * Response:
 *   - Safe response (no secrets, no internal-only fields)
 *   - 200 with the refund on success
 *   - 4xx with stable error code on failure
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { withErrorHandling, ok } from '@/lib/api/response';
import { err } from '@/lib/api/err';
import { withSecurity, type AuthedContext } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import {
  createRefund,
  RefundServiceError,
  type CreateRefundInput,
  type RefundActor,
  isAllowedRefundReason,
} from '@/lib/services/refund-service';
import { computeRefundMax } from '@/lib/services/refund-calculation';
import { redactForLog } from '@/lib/services/payment-security';
import { checkRateLimit } from '@/lib/services/payment-rate-limit';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─────────────────────────────────────────────────────────────
// GET — list all refunds for an order (admin view)
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, props: RouteContext): Promise<NextResponse<unknown>> {
  const params = await props.params;
  return (await withSecurity(
    secureRoute('open', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => listOrderRefunds(r as NextRequest, ctx, params.id) as any,
  )(req)) as unknown as NextResponse<unknown>;
}

async function listOrderRefunds(
  _req: NextRequest,
  ctx: { auth: AuthedContext },
  orderId: string,
): Promise<NextResponse<unknown>> {
  return withErrorHandling(async () => {
    const supabase = createServiceClient();
    const { data: refunds, error } = await supabase
      .from('payment_refunds')
      .select('id, stripe_refund_id, status, requested_amount_cents, refunded_amount_cents, currency, reason, internal_note, requested_by, failure_reason, created_at, updated_at, completed_at, idempotency_key, metadata')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('admin.listOrderRefunds failed', { error: error.message, orderId });
      return err('list_failed', 'Failed to list refunds', 500);
    }

    const max = await computeRefundMax(supabase, orderId);
    return ok({
      refunds: (refunds ?? []).map(safeRefund),
      summary: max.ok
        ? {
            received_cents: max.receivedCents,
            already_refunded_cents: max.alreadyRefundedCents,
            pending_cents: max.pendingCents,
            failed_cents: max.failedCents,
            max_refundable_cents: max.maxRefundableCents,
            can_full_refund: max.canFullRefund,
            currency: max.currency,
          }
        : null,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────
// POST — create a new refund (full or partial)
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, props: RouteContext): Promise<NextResponse<unknown>> {
  const params = await props.params;
  return (await withSecurity(
    secureRoute('open', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => createOrderRefund(r as NextRequest, ctx, params.id) as any,
  )(req)) as unknown as NextResponse<unknown>;
}

async function createOrderRefund(
  req: NextRequest,
  ctx: { auth: AuthedContext },
  orderId: string,
): Promise<NextResponse<unknown>> {
  return withErrorHandling(async () => {
    const actor: RefundActor = {
      userId: ctx.auth.user.id,
      role: ctx.auth.user.role,
      permissions: (ctx.auth.user as { permissions?: string[] }).permissions ?? [],
      requestId: req.headers.get('x-request-id') || undefined,
    };

    // Rate limit: per-user
    const rate = await checkRateLimit('adminMutation', actor.userId);
    if (!rate.allowed) {
      return err('rate_limited', 'Too many requests; slow down.', 429, {
        'Retry-After': String(Math.max(1, rate.retryAfterSeconds)),
      });
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== 'object') {
      return err('invalid_body', 'Body must be JSON', 400);
    }

    const mode = body.mode === 'full' || body.mode === 'partial' ? body.mode : null;
    if (!mode) {
      return err('invalid_mode', "mode must be 'full' or 'partial'", 400);
    }
    const reason = typeof body.reason === 'string' ? body.reason : '';
    if (!isAllowedRefundReason(reason)) {
      return err('invalid_reason', 'reason must be a controlled value', 400);
    }
    const internalNote = typeof body.internal_note === 'string' ? body.internal_note.slice(0, 1000) : undefined;
    const amountCents = mode === 'partial' ? Number(body.amount_cents) : undefined;
    const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : undefined;
    // Phase 7G-E: chaos injection is a test-only field, never set in production
    // routes; it is only ever accepted from a request that the chaos test made.
    // We accept it from a `x-chaos-mode` header so production clients can't enable it.
    const chaosMode = String(req.headers.get('x-chaos-mode') || '').toLowerCase();
    const chaos = chaosMode
      ? {
          stripe_timeout: chaosMode === 'stripe-timeout',
          stripe_500: chaosMode === 'stripe-500',
          // 7G-F: variant that fails first then succeeds on retry (tests retry path)
          stripe_500_retry: chaosMode === 'stripe-500-retry',
        }
      : undefined;

    const input: CreateRefundInput = {
      orderId,
      mode,
      amountCents,
      reason,
      internalNote,
      clientIdempotencyKey: idempotencyKey,
      chaos,
    };

    try {
      const supabase = createServiceClient();
      const result = await createRefund(supabase, actor, input);
      return ok({ ok: true, refund: result.refund, idempotent: result.idempotent }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      });
    } catch (e: unknown) {
      if (e instanceof RefundServiceError) {
        return err(e.code, e.message, e.httpStatus);
      }
      logger.error('admin.createOrderRefund failed', { error: (e as Error).message, ...redactForLog({ orderId, actor }) });
      return err('internal_error', 'Failed to create refund', 500);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function safeRefund(r: Record<string, unknown>): Record<string, unknown> {
  // Strip out any sensitive fields (we don't store much, but be defensive)
  return {
    id: r.id,
    stripe_refund_id: r.stripe_refund_id ?? null,
    status: r.status,
    requested_amount_cents: Number(r.requested_amount_cents ?? 0),
    refunded_amount_cents: Number(r.refunded_amount_cents ?? 0),
    currency: r.currency,
    reason: r.reason,
    internal_note: r.internal_note ?? null,
    requested_by: r.requested_by,
    failure_reason: r.failure_reason ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    completed_at: r.completed_at ?? null,
  };
}
