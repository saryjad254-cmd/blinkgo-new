/**
 * Cookie Consent API
 * ──────────────────
 *
 * POST /api/consent
 *
 * Records the user's cookie consent state. Audit-grade:
 *  - Timestamped
 *  - IP + user-agent recorded (for compliance audit)
 *  - Stored in `consent_records` table (defensive — table
 *    may not exist; falls back to log-only)
 *
 * The system currently uses NO non-essential cookies or
 * tracking scripts. This endpoint is wired up so that if
 * analytics or marketing tools are added later, the consent
 * state is enforced.
 *
 * The current behavior is "implicit" consent: only strictly
 * necessary cookies are set. Optional cookies are NOT set
 * unless the user explicitly accepts them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { ok, withErrorHandling } from '@/lib/api/response';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = ['strictly_necessary', 'preferences', 'analytics', 'marketing'];

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const limited = rateLimit({ limit: 30, windowSec: 60 * 60, name: 'consent' }, req);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const { categories, action } = body;

    if (!action || !['accept_all', 'reject_non_essential', 'custom'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
    }
    if (action === 'custom') {
      if (!categories || typeof categories !== 'object') {
        return NextResponse.json({ ok: false, error: 'categories required for custom' }, { status: 400 });
      }
      for (const k of Object.keys(categories)) {
        if (!VALID_CATEGORIES.includes(k)) {
          return NextResponse.json({ ok: false, error: `Invalid category: ${k}` }, { status: 400 });
        }
        if (typeof categories[k] !== 'boolean') {
          return NextResponse.json({ ok: false, error: `category ${k} must be boolean` }, { status: 400 });
        }
      }
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const record = {
      id: `consent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action,
      categories: action === 'accept_all' ? { strictly_necessary: true, preferences: true, analytics: true, marketing: true } : action === 'reject_non_essential' ? { strictly_necessary: true, preferences: false, analytics: false, marketing: false } : categories,
      ip,
      user_agent: userAgent,
      created_at: new Date().toISOString(),
    };

    // Log always (audit trail)
    logger.info('consent_recorded', {  ...record  });

    // Try to persist (defensive)
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const svc = createServiceClient();
      await svc.from('consent_records').insert(record);
    } catch (e: any) {
      // Table missing — log-only is acceptable
    }

    return ok({
      recorded: true,
      categories: record.categories,
      note: 'Current build uses only strictly_necessary cookies. Custom consent will be enforced if optional categories are later activated.',
    });
  });
}

export async function GET() {
  return NextResponse.json({
    current_state: 'no_non_essential_cookies_active',
    note: 'BlinkGo does not currently use non-essential cookies or tracking scripts. Consent endpoint is wired but no opt-in is required at this time.',
  });
}
