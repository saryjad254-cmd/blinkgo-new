import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { consumeOTP, invalidateOTPs, storeOTP } from '@/lib/otp-store';
import { authRateLimiters } from '@/lib/rate-limit';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ValidationError } from '@/lib/errors';
import { createClient } from '@supabase/supabase-js';
import { getCanonicalBaseUrl } from '@/lib/auth/redirect-url';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

function getAdminClient() {
  return createServiceClient();
}

// POST = verify code
export async function POST(req: NextRequest) {
  return (await withSecurity(
    secureRoute('auth'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => verifyHandler(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function verifyHandler(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const limited = authRateLimiters.otpVerify(req);
    if (limited) return limited;

    const { email, code } = await req.json();

    if (!email || !code) {
      throw new ValidationError('Email and code are required');
    }
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      throw new ValidationError('Invalid code format');
    }

    const norm = email.toLowerCase().trim();
    const verification = await consumeOTP({ email: norm, code, purpose: 'signup' });
    let verifiedUserId = verification?.user_id || null;

    // Registration can fall back to Supabase Auth SMTP. In that case the
    // six-digit token is owned and verified by GoTrue rather than email_otps.
    if (!verifiedUserId) {
      const authClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data: otpData, error: otpError } = await authClient.auth.verifyOtp({
        email: norm,
        token: code,
        type: 'email',
      });
      if (otpError || !otpData.user) throw new ValidationError('Invalid code');
      verifiedUserId = otpData.user.id;
    }

    const supabase = getAdminClient();
    if (verifiedUserId) {
      const { error: confirmErr } = await supabase.auth.admin.updateUserById(
        verifiedUserId,
        { email_confirm: true },
      );
      if (confirmErr) {
        console.error('Failed to confirm email:', confirmErr);
        throw new Error('Failed to confirm email');
      }
      await supabase
        .from('users')
        .update({ is_verified: true })
        .eq('id', verifiedUserId);
    }
    return ok({ message: 'Email verified' });
  });
}

// PUT = resend code
async function _resendWrapper(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('auth'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => resendHandler(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function resendHandler(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const limited = authRateLimiters.otpVerify(req);
    if (limited) return limited;

    const { email } = await req.json();
    if (!email) {
      throw new ValidationError('Email is required');
    }

    const norm = email.toLowerCase().trim();
    const supabase = getAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', norm)
      .maybeSingle();
    if (!user) {
      throw new ValidationError('User not found');
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await invalidateOTPs(norm, 'signup');
    await storeOTP({
      email: norm,
      user_id: user.id,
      code: otpCode,
      expires_at: expiresAt,
      purpose: 'signup',
    });

    let verificationEmailSent = false;
    try {
      const { sendOTPEmail } = await import('@/lib/email-service');
      const result = await sendOTPEmail({
        to: norm,
        code: otpCode,
        locale: 'de',
        expiresInMinutes: 15,
      });
      verificationEmailSent = result.ok;
    } catch (e) {
      console.error('Resend email error:', e);
    }

    if (!verificationEmailSent) {
      const { error: smtpError } = await supabase.auth.signInWithOtp({
        email: norm,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${getCanonicalBaseUrl(req.nextUrl.origin)}/login?verified=1`,
        },
      });
      if (smtpError) throw new Error('Verification email could not be sent');
    }

    return ok({ message: 'New code generated' });
  });
}

// PUT = resend code
export async function PUT(req: NextRequest) {
  return _resendWrapper(req);
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
