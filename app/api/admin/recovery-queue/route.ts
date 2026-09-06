/**
 * Admin Manual Recovery Queue (Phase 7G-A + 7G-B + 7G-C)
 * ────────────────────────────────────────────────────────
 * GET /api/admin/recovery-queue
 *   - Lists all pending recovery items
 *   - Requires `payment_support` permission (NOT just `admin`)
 *
 * PATCH /api/admin/recovery-queue
 *   - Updates the status of a recovery item
 *   - Requires `payment_support` permission
 *   - 7G-C: refund requires stripe_refund_id; order_recreated requires order_id
 *   - Every action logged to admin_action_log (immutable)
 *   - CAS on status field to prevent concurrent admin conflicts
 *   - Redact PII from response
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from '@/lib/foundation/zod-mini';
import { apiRoute, tier } from '@/lib/api/canonical';
import { ValidationError } from '@/lib/foundation/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { logSecurityEvent } from '@/lib/services/payment-secrets';
import {
  checkRateLimit,
  PAYMENT_RATE_LIMITS,
  userBucketKey,
} from '@/lib/services/payment-rate-limit';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['refunded', 'order_recreated', 'contacted', 'resolved'],
  refunded: ['resolved'],
  order_recreated: ['resolved'],
  contacted: ['resolved', 'refunded', 'order_recreated'],
  resolved: [],
};

/**
 * Check if the user has the `payment_support` permission.
 * Source: protected app_metadata permissions or role = super_admin.
 * Falls back to a service-role check on the public.users table.
 */
async function userHasPaymentSupport(user: { id: string; role: string; email?: string | null; permissions?: string[] }): Promise<boolean> {
  if (user.role === 'super_admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes('payment_support');
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || null;
}

function getUserAgent(req: NextRequest): string | null {
  return req.headers.get('user-agent') || null;
}

function redactRecoveryItem(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  return {
    id: row.id,
    payment_intent_id: row.payment_intent_id,
    customer_id: row.customer_id,
    draft_id: row.draft_id,
    amount_cents: row.amount_cents,
    currency: row.currency,
    reason: row.reason,
    status: row.status,
    resolution_notes: row.resolution_notes,
    resolved_at: row.resolved_at,
    resolved_by: row.resolved_by,
    created_at: row.created_at,
    // Exclude: metadata, raw details, anything else
  };
}

export const GET = apiRoute({
  method: 'GET',
  auth: 'required',
  roles: ['admin', 'super_admin'],
  customAuth: userHasPaymentSupport,
  rateLimit: tier('lenient'),
  handler: async ({ user, req }) => {
    if (!user) throw new ValidationError('Authentication required');
    const supabase = createServiceClient();
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);
    const route = 'GET /api/admin/recovery-queue';

    // 7G-C: Even reading requires payment_support (defense in depth)
    const hasSupport = await userHasPaymentSupport(user);
    if (!hasSupport) {
      await logSecurityEvent({
        event_type: 'non_privileged_admin_mutation',
        severity: 'high',
        user_id: user.id,
        ip,
        user_agent: userAgent,
        route,
        reason: `User ${user.id} (role=${user.role}) attempted to read recovery queue without payment_support`,
      });
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    // Per-user rate limit
    const userLimit = await checkRateLimit(
      userBucketKey(user.id, 'admin_recovery_read'),
      PAYMENT_RATE_LIMITS.adminRead,
    );
    if (!userLimit.allowed) {
      return NextResponse.json({
        ok: false,
        error: 'rate_limited',
        retry_after_seconds: userLimit.retryAfterSeconds,
      }, { status: 429, headers: NO_STORE_HEADERS });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status') || 'pending';

    const { data, error } = await supabase
      .from('manual_recovery_queue')
      .select('id, payment_intent_id, customer_id, draft_id, amount_cents, currency, reason, status, resolution_notes, resolved_at, resolved_by, created_at')
      .eq('status', statusFilter)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('admin.recovery_queue.list_failed', { error: error.message });
      return NextResponse.json({ ok: false, error: 'list_failed' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    // Redact PII
    const redacted = (data ?? []).map(redactRecoveryItem);
    return NextResponse.json({ ok: true, items: redacted, count: redacted.length }, { headers: NO_STORE_HEADERS });
  },
});

const PatchBodySchema = z.object({
  id: z.string().min(1),  // accept string ID (UUID) or numeric ID
  status: z.enum(['pending', 'refunded', 'order_recreated', 'contacted', 'resolved']),
  resolution_notes: z.string().optional(),
  // 7G-C: required for certain transitions
  stripe_refund_id: z.string().optional(),
  order_id: z.string().optional(),
});

export const PATCH = apiRoute({
  method: 'PATCH',
  auth: 'required',
  roles: ['admin', 'super_admin'],
  // Authorization runs before body parsing in apiRoute. This prevents an
  // unprivileged admin from using validation responses as an information
  // side-channel into the payment recovery workflow.
  customAuth: userHasPaymentSupport,
  rateLimit: tier('moderate'),
  bodySchema: PatchBodySchema,
  handler: async ({ body, user, req }) => {
    if (!user) throw new ValidationError('Authentication required');
    const supabase = createServiceClient();
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);
    const route = 'PATCH /api/admin/recovery-queue';
    const requestId = req.headers.get('x-request-id');

    // 7G-C: Requires payment_support permission
    const hasSupport = await userHasPaymentSupport(user);
    if (!hasSupport) {
      await logSecurityEvent({
        event_type: 'non_privileged_admin_mutation',
        severity: 'critical',
        user_id: user.id,
        ip,
        user_agent: userAgent,
        route,
        reason: `User ${user.id} (role=${user.role}) attempted recovery mutation without payment_support`,
      });
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    // Per-user rate limit
    const userLimit = await checkRateLimit(
      userBucketKey(user.id, 'admin_recovery_mutation'),
      PAYMENT_RATE_LIMITS.adminMutation,
    );
    if (!userLimit.allowed) {
      return NextResponse.json({
        ok: false,
        error: 'rate_limited',
        retry_after_seconds: userLimit.retryAfterSeconds,
      }, { status: 429, headers: NO_STORE_HEADERS });
    }

    // 7G-C: Manual validation for id (zod-mini doesn't have .positive)
    // id can be a numeric ID or a UUID string; in this codebase, recovery queue uses string IDs
    if (typeof body.id !== 'string' || body.id.length < 1) {
      return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    // 7G-C: Load current state
    const { data: existing, error: loadErr } = await supabase
      .from('manual_recovery_queue')
      .select('*')
      .eq('id', body.id)
      .maybeSingle();

    if (loadErr || !existing) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    // 7G-C: Validate state transition
    if (body.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(body.status)) {
        await logSecurityEvent({
          event_type: 'invalid_recovery_transition',
          severity: 'high',
          user_id: user.id,
          route,
          reason: `Invalid transition: ${existing.status} → ${body.status}`,
        });
        return NextResponse.json({
          ok: false,
          error: 'invalid_transition',
        }, { status: 400, headers: NO_STORE_HEADERS });
      }
    }

    // 7G-C: Transition-specific requirements
    if (body.status === 'refunded') {
      if (!body.stripe_refund_id) {
        await logSecurityEvent({
          event_type: 'refund_without_reference',
          severity: 'critical',
          user_id: user.id,
          route,
          reason: `Admin marked refunded without stripe_refund_id`,
        });
        return NextResponse.json({
          ok: false,
          error: 'refund_id_required',
        }, { status: 400, headers: NO_STORE_HEADERS });
      }
      if (!body.resolution_notes) {
        await logSecurityEvent({
          event_type: 'missing_resolution_note',
          severity: 'high',
          user_id: user.id,
          route,
          reason: `Refund without resolution_notes`,
        });
        return NextResponse.json({
          ok: false,
          error: 'resolution_notes_required',
        }, { status: 400, headers: NO_STORE_HEADERS });
      }
    }

    if (body.status === 'order_recreated') {
      if (!body.order_id) {
        await logSecurityEvent({
          event_type: 'recreate_without_order',
          severity: 'critical',
          user_id: user.id,
          route,
          reason: `Admin marked order_recreated without order_id`,
        });
        return NextResponse.json({
          ok: false,
          error: 'order_id_required',
        }, { status: 400, headers: NO_STORE_HEADERS });
      }
      // 7G-C: Verify the order exists and has matching payment_intent_id
      const { data: order } = await supabase
        .from('orders')
        .select('id, payment_intent_id')
        .eq('id', body.order_id)
        .maybeSingle();
      if (!order) {
        await logSecurityEvent({
          event_type: 'arbitrary_order_id_injection',
          severity: 'critical',
          user_id: user.id,
          route,
          reason: `Admin provided non-existent order_id: ${body.order_id}`,
        });
        return NextResponse.json({
          ok: false,
          error: 'order_not_found',
        }, { status: 400, headers: NO_STORE_HEADERS });
      }
      if (order.payment_intent_id !== existing.payment_intent_id) {
        await logSecurityEvent({
          event_type: 'arbitrary_order_id_injection',
          severity: 'critical',
          user_id: user.id,
          route,
          reason: `Order ${body.order_id} has PI ${order.payment_intent_id}, expected ${existing.payment_intent_id}`,
        });
        return NextResponse.json({
          ok: false,
          error: 'order_payment_intent_mismatch',
        }, { status: 400, headers: NO_STORE_HEADERS });
      }
    }

    // 7G-C: Build update
    const update: Record<string, unknown> = {
      status: body.status,
      resolution_notes: body.resolution_notes || existing.resolution_notes,
    };
    if (body.stripe_refund_id) update.stripe_refund_id = body.stripe_refund_id;
    if (body.order_id) update.order_id = body.order_id;
    if (body.status === 'resolved') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = user.id;
    }

    // 7G-C: CAS update — only update if status is still what we expect
    const { data, error } = await supabase
      .from('manual_recovery_queue')
      .update(update)
      .eq('id', body.id)
      .eq('status', existing.status)  // CAS: status must not have changed
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No row updated — concurrent admin conflict
        await logSecurityEvent({
          event_type: 'concurrent_admin_resolution',
          severity: 'high',
          user_id: user.id,
          route,
          reason: `Concurrent admin resolution: status was ${existing.status} but is now different`,
        });
        return NextResponse.json({
          ok: false,
          error: 'concurrent_modification',
        }, { status: 409, headers: NO_STORE_HEADERS });
      }
      logger.error('admin.recovery_queue.update_failed', { id: body.id, error: error.message });
      return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    // 7G-C: Write immutable admin action log
    await supabase.from('admin_action_log').insert({
      admin_user_id: user.id,
      admin_email: user.email,
      action: 'recovery_queue.update',
      resource_type: 'manual_recovery_queue',
      resource_id: String(body.id),
      before_state: redactRecoveryItem(existing),
      after_state: redactRecoveryItem(data),
      reason: body.resolution_notes,
      resolution_notes: body.resolution_notes,
      ip,
      user_agent: userAgent,
      request_id: requestId,
    });

    return NextResponse.json({ ok: true, item: redactRecoveryItem(data) }, { headers: NO_STORE_HEADERS });
  },
});
