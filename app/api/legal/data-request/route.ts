/**
 * Data Subject Request API
 * ─────────────────────────
 *
 * POST /api/legal/data-request
 * Public endpoint (no auth) for DSAR submissions.
 *
 * Behavior:
 *  1. Validate input (type, name, email, length limits)
 *  2. Try to insert into `data_subject_requests` table if it exists
 *     (defensive — schema may be added later, no migration now)
 *  3. Always log the request via structured logger so it appears
 *     in audit trail regardless of schema state
 *  4. If legal email is configured, attempt to send notification
 *     (optional — never blocks the user response)
 *
 * Rate limit: 5 per IP per hour to prevent abuse.
 *
 * We do NOT add a new table per the v65 architecture freeze.
 * The request is logged + stored as best-effort and routed to
 * the legal contact email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { rateLimit } from '@/lib/rate-limit';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { ValidationError, RateLimitError } from '@/lib/errors';

const VALID_TYPES = ['access', 'rectification', 'erasure', 'restriction', 'portability', 'objection', 'consent_withdrawal'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    // Rate limit
    const limited = rateLimit({ limit: 5, windowSec: 60 * 60, name: 'dsar-submit' }, req);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const { type, name, email, account_email, details } = body;

    if (!type || !VALID_TYPES.includes(type)) {
      throw new ValidationError('Invalid type');
    }
    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 200) {
      throw new ValidationError('Name required (2-200 chars)');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('Valid email required');
    }
    if (details && (typeof details !== 'string' || details.length > 2000)) {
      throw new ValidationError('Details too long (max 2000 chars)');
    }
    if (account_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account_email)) {
      throw new ValidationError('Invalid account_email');
    }

    const requestId = `dsar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const record = {
      id: requestId,
      type,
      name,
      email,
      account_email: account_email || null,
      details: details || null,
      ip,
      user_agent: userAgent,
      status: 'pending',
      created_at: createdAt,
    };

    // Always log — this is the source of truth in current build
    logger.info('dsar_submitted', {  ...record  });

    // Try to insert into a possible `data_subject_requests` table.
    // If the table doesn't exist, this fails silently and we still return ok.
    let persisted = false;
    try {
      const svc = createServiceClient();
      const { error } = await svc.from('data_subject_requests').insert(record);
      if (!error) {
        persisted = true;
      } else {
        logger.warn('dsar_persist_failed', {  error: error.message  });
      }
    } catch (e: any) {
      // Table doesn't exist or service not configured — not blocking
      logger.warn('dsar_persist_skipped', {  reason: e?.message  });
    }

    // Optional: email the legal contact. Best-effort.
    let emailSent = false;
    try {
      const legalEmail = process.env.COMPANY_LEGAL_EMAIL || process.env.COMPANY_SUPPORT_EMAIL;
      if (legalEmail && process.env.RESEND_API_KEY) {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'BlinkGo <onboarding@resend.dev>',
          to: legalEmail,
          subject: `[DSAR] ${type} — ${name}`,
          text: `New Data Subject Request\n\nID: ${requestId}\nType: ${type}\nName: ${name}\nEmail: ${email}\nAccount: ${account_email || 'n/a'}\nDetails: ${details || 'n/a'}\nCreated: ${createdAt}\nIP: ${ip}\n`,
        });
        emailSent = true;
      }
    } catch (e: any) {
      logger.warn('dsar_email_failed', {  reason: e?.message  });
    }

    return ok({
      request_id: requestId,
      status: 'received',
      persisted,
      email_notification_sent: emailSent,
      next_step: 'You will receive a response within 30 days.',
    });
  });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}
