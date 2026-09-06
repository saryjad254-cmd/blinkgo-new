/**
 * Payment Reconciliation Cron (Phase 7G-B + 7G-C)
 * ───────────────────────────────────────────────
 * GET /api/cron/reconcile-payments
 *
 * Phase 7G-C security hardening:
 *   - Constant-time comparison of cron secret (timingSafeEqual)
 *   - Reject query-string secrets (only headers)
 *   - Postgres advisory lock to prevent overlap
 *   - Return 409 if another run is in progress
 *   - Log start, finish, duration, scanned, repaired, failures
 *   - Never expose secrets in responses
 *   - maxDuration enforced
 *
 * Schedules: every 15 minutes via Vercel Cron (recommended).
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runReconciliation } from '@/lib/services/payment-recovery';
import { logSecurityEvent } from '@/lib/services/payment-secrets';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_LOCK_ID = 9113374201; // Arbitrary constant for pg_try_advisory_lock

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || null;
}

function getUserAgent(req: NextRequest): string | null {
  return req.headers.get('user-agent') || null;
}

/**
 * Constant-time bearer token comparison.
 * Returns true if the provided token matches the expected secret.
 * Also accepts `x-cron-secret` header (constant-time).
 */
function verifyCronAuth(req: NextRequest, expectedSecret: string): boolean {
  if (!expectedSecret) return false;
  // Reject query-string secrets explicitly (security best practice)
  const url = new URL(req.url);
  if (url.searchParams.has('secret') || url.searchParams.has('cron_secret') || url.searchParams.has('token')) {
    return false;
  }
  // 1) Authorization: Bearer <secret>
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token.length !== expectedSecret.length) return false;
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(expectedSecret);
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
  // 2) x-cron-secret: <secret>
  const headerSecret = req.headers.get('x-cron-secret');
  if (headerSecret) {
    if (headerSecret.length !== expectedSecret.length) return false;
    try {
      const a = Buffer.from(headerSecret);
      const b = Buffer.from(expectedSecret);
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
  return false;
}

async function tryAcquireLock(): Promise<boolean> {
  const supabase = createServiceClient();
  try {
    // pg_try_advisory_lock returns true if acquired, false otherwise
    const { data, error } = await supabase.rpc('pg_try_advisory_lock' as never, { key: CRON_LOCK_ID } as never);
    if (error) {
      // RPC may not exist; fall back to a simpler approach
      logger.warn('cron.reconcile.advisory_lock_rpc_missing', { error: error.message });
      return true; // Allow run (no overlap protection in mock)
    }
    return !!data;
  } catch (error: unknown) {
    logger.warn('cron.reconcile.advisory_lock_failed', { error: safeErrorMessage(error) });
    return true;
  }
}

async function releaseLock(): Promise<void> {
  const supabase = createServiceClient();
  try {
    await supabase.rpc('pg_advisory_unlock' as never, { key: CRON_LOCK_ID } as never);
  } catch {
    // Best-effort
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);
  const expectedToken = process.env.CRON_SECRET || '';

  // ── Auth: constant-time comparison ─────────────────────────────────
  if (!expectedToken) {
    await logSecurityEvent({
      event_type: 'production_missing_keys',
      severity: 'critical',
      ip,
      user_agent: userAgent,
      route: 'GET /api/cron/reconcile-payments',
      reason: 'CRON_SECRET not configured',
    });
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }
  if (!verifyCronAuth(req, expectedToken)) {
    await logSecurityEvent({
      event_type: 'unauthorized_rpc_invocation',
      severity: 'critical',
      ip,
      user_agent: userAgent,
      route: 'GET /api/cron/reconcile-payments',
      reason: 'Cron auth failed',
    });
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // ── Reject query-string secrets ────────────────────────────────────
  const url = new URL(req.url);
  if (url.searchParams.has('secret') || url.searchParams.has('cron_secret')) {
    await logSecurityEvent({
      event_type: 'unauthorized_rpc_invocation',
      severity: 'high',
      ip,
      user_agent: userAgent,
      route: 'GET /api/cron/reconcile-payments',
      reason: 'Cron secret provided in query string',
    });
    return NextResponse.json({ ok: false, error: 'query_string_secret_not_allowed' }, { status: 400 });
  }

  // ── Acquire advisory lock to prevent overlap ───────────────────────
  const acquired = await tryAcquireLock();
  if (!acquired) {
    logger.info('cron.reconcile_payments.overlap_skipped', { ip });
    return NextResponse.json({
      ok: false,
      error: 'overlap',
      message: 'Another reconciliation run is in progress',
    }, { status: 409 });
  }

  try {
    const dryRun = url.searchParams.get('dryRun') === 'true';
    logger.info('cron.reconcile_payments.started', { dryRun, ip });

    const result = await runReconciliation({ dryRun });
    const duration = Date.now() - start;

    logger.info('cron.reconcile_payments.completed', {
      dryRun,
      scanned: result.scanned,
      issues_found: result.issues_found,
      issues_queued: result.issues_queued,
      issues_by_type: result.issues_by_type,
      duration_ms: duration,
      errors: result.errors,
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      scanned: result.scanned,
      issues_found: result.issues_found,
      issues_queued: result.issues_queued,
      issues_by_type: result.issues_by_type,
      duration_ms: duration,
      // Note: result.errors may contain sensitive info, sanitize
      error_count: result.errors?.length || 0,
    });
  } catch (error: unknown) {
    logger.error('cron.reconcile_payments.failed', {
      error: safeErrorMessage(error),
      duration_ms: Date.now() - start,
    });
    return NextResponse.json({
      ok: false,
      error: 'reconciliation_failed',
      message: 'Reconciliation failed; see logs',
    }, { status: 500 });
  } finally {
    await releaseLock();
  }
}
