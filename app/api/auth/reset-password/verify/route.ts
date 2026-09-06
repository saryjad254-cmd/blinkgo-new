import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { authRateLimiters } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/auth/reset-password/verify
 * Body: { email, code, password }
 *
 * Exchanges a (signed token, email) pair plus a new password for an
 * updated Supabase password. The token must:
 *   - match the email
 *   - be unused
 *   - be unexpired
 *
 * Uses Supabase Admin API to update the user by email, then marks the
 * token as used.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = authRateLimiters.passwordResetVerify(req);
    if (limited) return limited;

    const body: unknown = await req.json().catch(() => ({}));
    const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const signedToken = input.token;
    const email = input.email;
    const password = input.password;

    if (
      !signedToken ||
      typeof signedToken !== 'string' ||
      !email ||
      typeof email !== 'string' ||
      !password ||
      typeof password !== 'string'
    ) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_INPUT', message: 'Missing required fields' } },
        { status: 400 },
      );
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { ok: false, error: { code: 'WEAK_PASSWORD', message: 'Password must be 8-128 characters' } },
        { status: 400 },
      );
    }

    // Parse the signed token: <token>.<hmac>
    const parts = signedToken.split('.');
    if (parts.length !== 2) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token format' } },
        { status: 400 },
      );
    }
    const [token, hmac] = parts;
    // SECURITY: must use the same RESET_TOKEN_SECRET as the sign side
    // (reset-password/route.ts). Failing closed if missing prevents an
    // attacker who knows the service-role key (or guesses the fallback
    // literal) from forging reset tokens.
    const secret = process.env.RESET_TOKEN_SECRET;
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: { code: 'MISCONFIGURED', message: 'RESET_TOKEN_SECRET is not configured' } },
        { status: 500 },
      );
    }
    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(`${token}.${email}`)
      .digest('hex')
      .slice(0, 16);

    const suppliedSignature = Buffer.from(hmac, 'utf8');
    const expectedSignature = Buffer.from(expectedHmac, 'utf8');
    if (suppliedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(suppliedSignature, expectedSignature)) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_TOKEN', message: 'Token signature mismatch' } },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const tokenHash = hashToken(token);
    const normalizedEmail = email.toLowerCase().trim();

    // Look up the token row
    const { data: tokenRow, error: lookupErr } = await supabase
      .from('password_reset_tokens')
      .select('id, email, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (lookupErr) {
      console.error('[reset-verify] token lookup failed:', lookupErr.message);
      return NextResponse.json(
        { ok: false, error: { code: 'RESET_TOKEN_STORE_UNAVAILABLE', message: 'Password reset is temporarily unavailable' } },
        { status: 503 },
      );
    }

    if (!tokenRow) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_TOKEN', message: 'Token not found' } },
        { status: 400 },
      );
    }

    if (tokenRow.used_at) {
      return NextResponse.json(
        { ok: false, error: { code: 'TOKEN_USED', message: 'Token already used' } },
        { status: 400 },
      );
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { ok: false, error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } },
        { status: 400 },
      );
    }

    // Atomically claim the token before changing the password. A concurrent
    // replay sees no claimable row and is rejected as already used.
    const usedAt = new Date().toISOString();
    const { data: claimedToken, error: claimError } = await supabase
      .from('password_reset_tokens')
      .update({ used_at: usedAt })
      .eq('id', tokenRow.id)
      .is('used_at', null)
      .select('id')
      .maybeSingle();
    if (claimError) {
      return NextResponse.json(
        { ok: false, error: { code: 'RESET_TOKEN_STORE_UNAVAILABLE', message: 'Password reset is temporarily unavailable' } },
        { status: 503 },
      );
    }
    if (!claimedToken) {
      return NextResponse.json(
        { ok: false, error: { code: 'TOKEN_USED', message: 'Token already used' } },
        { status: 400 },
      );
    }

    // Resolve the profile directly by normalized email instead of scanning
    // only the first 200 Auth users.
    const { data: user, error: userLookupError } = await supabase
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (userLookupError || !user) {
      await supabase.from('password_reset_tokens').update({ used_at: null }).eq('id', tokenRow.id).eq('used_at', usedAt);
      return NextResponse.json(
        { ok: false, error: { code: 'USER_NOT_FOUND', message: 'Account not found' } },
        { status: 400 },
      );
    }

    // Update the password
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (updateErr) {
      await supabase.from('password_reset_tokens').update({ used_at: null }).eq('id', tokenRow.id).eq('used_at', usedAt);
      return NextResponse.json(
        { ok: false, error: { code: 'UPDATE_FAILED', message: updateErr.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'Internal error' } },
      { status: 500 },
    );
  }
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
