/**
 * Cleanup Expired Order Drafts (HTTP Cron Fallback)
 * ───────────────────────────────────────────────────
 * Phase 7F: Invokes the `gc_expired_order_drafts()` RPC which
 * soft-deletes order_drafts that are:
 *   - Expired by more than 24 hours (no customer interaction)
 *   - Used and confirmed more than 7 days ago (audit window expired)
 *
 * Trigger:
 *   - Vercel Cron (vercel.json `crons` array) — once per hour
 *   - Any external scheduler (curl + bearer token)
 *   - The pg_cron job in deploy/supabase/61-order-drafts.sql
 *
 * Auth: CRON_SECRET bearer token. Returns 401 otherwise.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest, expected: string): boolean {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return false;
  const provided = header.slice(7).trim();
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.error('cron.cleanup-drafts.disabled', { reason: 'CRON_SECRET is not configured' });
    return NextResponse.json({ ok: false, error: 'Cron is not configured' }, { status: 503 });
  }
  if (req.nextUrl.searchParams.size > 0) {
    return NextResponse.json({ ok: false, error: 'query_parameters_not_allowed' }, { status: 400 });
  }
  if (!authorized(req, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const svc = createServiceClient();
  let cleaned = 0;
  try {
    const { data, error } = await svc.rpc('gc_expired_order_drafts');
    if (error) {
      logger.error('gc_expired_order_drafts RPC failed', { error });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    cleaned = (data ?? 0) as number;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'RPC failed';
    logger.error('gc_expired_order_drafts RPC threw', { error: message });
    return NextResponse.json({ ok: false, error: 'RPC failed' }, { status: 500 });
  }

  logger.info('cron.cleanup-drafts.completed', { cleaned });
  return NextResponse.json({ ok: true, cleaned });
}

// Vercel Cron invokes scheduled paths with GET.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
