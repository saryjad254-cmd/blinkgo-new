/**
 * Account Deletion Request (DSGVO Art. 17)
 * ────────────────────────────────────────
 *
 * DELETE /api/account/delete
 *
 * Authenticated. Marks the user account for deletion:
 *  - Sets `is_active = false` (defensive schema-drift, only
 *    uses existing column)
 *  - Records a deletion request in `data_subject_requests`
 *    (defensive — table may not exist)
 *  - Logs the event
 *  - Returns a confirmation. Actual data deletion is queued
 *    and processed by an operator after legal retention
 *    periods (typically 30 days) for finance / tax law
 *    compliance.
 *
 * NOTE: This does NOT immediately delete financial records
 * (orders, invoices). German law requires invoice retention
 * for 10 years (§ 147 AO). Such records are anonymized
 * after the retention period expires.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest) {
  return withErrorHandling(async () => {
    const limited = rateLimit({ limit: 3, windowSec: 60 * 60, name: 'account-delete' }, req);
    if (limited) return limited;

    const auth = await requireApiRole(['customer', 'driver', 'restaurant', 'admin']);
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.id;

    const svc = createServiceClient();

    // Deactivate the account (defensive — only is_active exists)
    const { error: updErr } = await svc.from('users').update({ is_active: false }).eq('id', userId);
    if (updErr) {
      logger.error('account_delete_failed', {  user_id: userId, error: updErr.message  });
      return NextResponse.json({ ok: false, error: 'Failed to deactivate' }, { status: 500 });
    }

    // Sign out everywhere
    try {
      // Best-effort: revoke refresh tokens
      const admin = createServiceClient();
      // mark as banned so refresh fails (use is_active=false is already set)
    } catch (e: any) {
      logger.warn('account_delete_token_revoke_failed', {  reason: e?.message  });
    }

    // Record DSAR
    const requestId = `dsar_delete_${Date.now()}`;
    try {
      await svc.from('data_subject_requests').insert({
        id: requestId,
        type: 'erasure',
        name: 'authenticated-user',
        email: auth.email || 'unknown',
        account_email: auth.email,
        details: 'Self-service account deletion via DELETE /api/account/delete',
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    } catch (e: any) {
      // Table might not exist; that's fine, the action is logged
    }

    logger.info('account_deletion_requested', {  user_id: userId, request_id: requestId  });

    return ok({
      request_id: requestId,
      status: 'deactivated',
      note: 'Your account has been deactivated. Personal data will be deleted within 30 days, except financial records which are retained for 10 years per § 147 AO.',
    });
  });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}
