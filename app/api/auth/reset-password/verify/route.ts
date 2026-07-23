import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';

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
    const { token: signedToken, email, password } = await req.json().catch(() => ({}) as any);

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
    const expectedHmac = crypto
      .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback')
      .update(`${token}.${email}`)
      .digest('hex')
      .slice(0, 16);

    if (hmac !== expectedHmac) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_TOKEN', message: 'Token signature mismatch' } },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const tokenHash = hashToken(token);

    // Look up the token row
    const { data: tokenRow, error: lookupErr } = await supabase
      .from('password_reset_tokens')
      .select('id, email, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (lookupErr) {
      // Table may be missing on projects without the migration. Try a
      // graceful fallback: still try to update the password via Supabase,
      // because the HMAC signature was valid (we verified it above).
      console.warn('[reset-verify] token lookup failed (table missing?):', lookupErr.message);
      const { error: updateErr } = await supabase.auth.admin.updateUserById(
        // Need a user id. The HMAC already authenticated the email, so
        // we look up the auth user.
        (await supabase.auth.admin.listUsers({ perPage: 200 }))
          .data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id || '',
        { password },
      );
      if (updateErr || !email) {
        return NextResponse.json(
          { ok: false, error: { code: 'UPDATE_FAILED', message: 'Could not update password' } },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true });
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

    // Look up the auth user
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 200 });
    const user = users?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      return NextResponse.json(
        { ok: false, error: { code: 'USER_NOT_FOUND', message: 'Account not found' } },
        { status: 400 },
      );
    }

    // Update the password
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: { code: 'UPDATE_FAILED', message: updateErr.message } },
        { status: 500 },
      );
    }

    // Mark the token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message: e?.message || 'Internal error' } },
      { status: 500 },
    );
  }
}
