import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { consumeOTP, invalidateOTPs, storeOTP } from '@/lib/otp-store';
import { authRateLimiters } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

function getAdminClient() {
  return createServiceClient();
}

// POST = verify code
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 verify attempts per 15 minutes
    const limited = authRateLimiters.otpVerify(req);
    if (limited) return limited;

    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ ok: false, error: 'Email and code are required' }, { status: 400 });
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ ok: false, error: 'Invalid code format' }, { status: 400 });
    }

    const norm = email.toLowerCase().trim();

    // Use file-based OTP store (no SMTP needed)
    const verification = await consumeOTP({ email: norm, code, purpose: 'signup' });

    if (!verification) {
      return NextResponse.json({ ok: false, error: 'Invalid code' }, { status: 400 });
    }

    // Confirm the user's email in Supabase Auth
    const supabase = getAdminClient();
    if (verification.user_id) {
      const { error: confirmErr } = await supabase.auth.admin.updateUserById(
        verification.user_id,
        { email_confirm: true },
      );

      if (confirmErr) {
        console.error('Failed to confirm email:', confirmErr);
        return NextResponse.json({ ok: false, error: 'Failed to confirm email' }, { status: 500 });
      }

      // Mark user as verified in public.users
      await supabase
        .from('users')
        .update({ is_verified: true })
        .eq('id', verification.user_id);
    }

    return NextResponse.json({ ok: true, message: 'Email verified' });
  } catch (e: any) {
    console.error('Verify error:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// PUT = resend code
export async function PUT(req: NextRequest) {
  try {
    // Rate limit: 3 resend per 5 minutes (prevents OTP spam)
    const limited = authRateLimiters.otpVerify(req);
    if (limited) return limited;

    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Email is required' }, { status: 400 });
    }

    const norm = email.toLowerCase().trim();
    const supabase = getAdminClient();

    // Find the user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', norm)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    // Generate new OTP
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Invalidate previous OTPs
    await invalidateOTPs(norm, 'signup');

    // Store new OTP
    await storeOTP({
      email: norm,
      user_id: user.id,
      code: otpCode,
      expires_at: expiresAt,
      purpose: 'signup',
    });

    // Send OTP email
    try {
      const { sendOTPEmail } = await import('@/lib/email-service');
      await sendOTPEmail({
        to: norm,
        code: otpCode,
        locale: 'de',
        expiresInMinutes: 15,
      });
    } catch (e) {
      console.error('Resend email error:', e);
    }

    return NextResponse.json({
      ok: true,
      message: 'New code generated',
    });
  } catch (e: any) {
    console.error('Resend error:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
