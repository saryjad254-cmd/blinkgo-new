/**
 * DEV-ONLY OTP Fetcher
 * ─────────────────────
 * Returns the latest valid OTP for an email.
 *
 * SECURITY: This endpoint is BLOCKED in production. It exists only for
 * local dev testing where SMTP is not configured.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getLatestOTP } from '@/lib/otp-store';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // SECURITY: hard-block this endpoint in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { ok: false, error: 'NOT_AVAILABLE' },
      { status: 404 }
    );
  }

  try {
    const limited = rateLimit({ limit: 30, windowSec: 15 * 60, name: 'get-otp' }, req);
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Email required' }, { status: 400 });
    }

    const record = await getLatestOTP(email, 'signup');
    if (!record) {
      return NextResponse.json(
        { ok: false, error: 'No valid code. Click "Resend" to generate a new one.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      expires_at: record.expires_at,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'FETCH_FAILED' }, { status: 500 });
  }
}
