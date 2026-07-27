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
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ValidationError, NotFoundError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => getOtp(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function getOtp(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundError('Not available');
    }
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) {
      throw new ValidationError('Email required');
    }
    const record = await getLatestOTP(email, 'signup');
    if (!record) {
      throw new NotFoundError('No valid code');
    }
    return ok({ expires_at: record.expires_at });
  });
}
