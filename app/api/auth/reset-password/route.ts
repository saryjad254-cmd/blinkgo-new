import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { authRateLimiters } from '@/lib/rate-limit';
import { sanitizeEmail, isValidEmail } from '@/lib/validation';
import { buildAuthUrl, getCanonicalBaseUrl } from '@/lib/auth/redirect-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/reset-password
 * Body: { email: string }
 *
 * SECURITY:
 *   - Rate-limited to 5/15min per IP
 *   - Always returns success (no email enumeration)
 *   - Redirect URL is built from NEXT_PUBLIC_APP_URL ONLY (never from
 *     untrusted request headers). This prevents phishing via the reset
 *     email link.
 *
 * In addition to the Supabase-builtin email, BlinkGo also mints its own
 * short-lived (30 min) signed reset token and sends a BRANDED email via
 * Resend. The custom token lives in the `password_reset_tokens` table and
 * is consumed by the /reset-password page. This gives us full control of
 * the email content and the reset experience.
 */
const RESET_TOKEN_TTL_MIN = 30;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signToken(token: string, email: string): string {
  // Simple HMAC for tamper detection. Email signature stored alongside hash.
  const hmac = crypto
    .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback')
    .update(`${token}.${email}`)
    .digest('hex')
    .slice(0, 16);
  return `${token}.${hmac}`;
}

export async function POST(req: NextRequest) {
  try {
    const limited = authRateLimiters.passwordReset(req);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const email = sanitizeEmail(body.email ?? '');

    if (!email || !isValidEmail(email)) {
      // Don't leak whether the email is valid
      return NextResponse.json({ ok: true });
    }

    // Use the canonical base URL (validated against allowlist). Falls back
    // to the request origin in development ONLY. Production throws if
    // APP_URL is missing — never falls back to localhost or arbitrary host.
    const appUrl = getCanonicalBaseUrl(req.nextUrl.origin);

    // 1) Always call Supabase's built-in reset (in case the user is on the
    //    classic recovery flow). Its redirectTo points at /login so even
    //    if our branded email fails, the user still has a recovery path.
    const supabase = createServiceClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/login`,
    });

    // 2) Mint a BlinkGo signed token. Store its hash + email + expires_at.
    const token = crypto.randomBytes(32).toString('hex'); // 64-char url-safe
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000).toISOString();

    try {
      await supabase
        .from('password_reset_tokens')
        .insert({
          email,
          token_hash: hashToken(token),
          expires_at: expiresAt,
          used_at: null,
          ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        });
    } catch (tblErr: any) {
      // Table might not exist on projects that haven't run the migration.
      // We silently continue — the Supabase recovery email is still sent.
      console.warn('[reset-password] could not insert token (table missing?):', tblErr?.message);
    }

    // 3) Detect locale from cookie so the email + redirect land in the
    //    user's selected language. We also append `?lang=` to the link so
    //    the /reset-password page can pre-paint in the right language
    //    before the cookie sync runs.
    const cookieHeader = req.headers.get('cookie') || '';
    const localeMatch = cookieHeader.match(/blinkgo-locale=(de|ar|en)/);
    const locale = (localeMatch?.[1] as 'de' | 'ar' | 'en') || 'de';

    // 4) Send the BRANDED email. The link uses our custom token; the
    //    /reset-password page validates the token via the API and then
    //    triggers the actual password update.
    const signed = signToken(token, email);
    const resetLink = `${appUrl}/reset-password?token=${signed}&email=${encodeURIComponent(email)}&lang=${locale}`;
    // Debug log — never log the token. Only the host and the path.
    console.log('[reset-password] generated link', { host: new URL(resetLink).host, path: new URL(resetLink).pathname, locale });

    try {
      const { sendPasswordResetEmail } = await import('@/lib/email-password-reset');
      const sendResult = await sendPasswordResetEmail({
        to: email,
        resetLink,
        locale,
        expiresInMinutes: RESET_TOKEN_TTL_MIN,
      });
      if (!sendResult.ok) {
        console.warn('[reset-password] branded email failed (Supabase email is still the fallback):', sendResult.error);
      }
    } catch (e: any) {
      console.warn('[reset-password] branded email service threw:', e?.message);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
