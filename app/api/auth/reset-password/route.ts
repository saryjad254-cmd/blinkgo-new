import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { authRateLimiters } from '@/lib/rate-limit';
import { sanitizeEmail, isValidEmail } from '@/lib/validation';
import { getCanonicalBaseUrl } from '@/lib/auth/redirect-url';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';

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
  // SECURITY: the reset token is the only thing standing between a
  // password-reset email and account takeover. We sign it with a
  // dedicated RESET_TOKEN_SECRET (NOT the service-role key — that's
  // meant to stay private to the server). If the env var is missing,
  // fail closed: throw, do not silently fall back to a guessable key.
  const secret = process.env.RESET_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      'RESET_TOKEN_SECRET is not configured. Refusing to sign reset tokens with a ' +
      'fallback secret — set it in your environment before deploying.',
    );
  }
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(`${token}.${email}`)
    .digest('hex')
    .slice(0, 16);
  return `${token}.${hmac}`;
}

export async function POST(req: NextRequest) {
  return (await withSecurity(
    secureRoute('auth'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => resetPasswordHandler(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function resetPasswordHandler(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const limited = authRateLimiters.passwordReset(req);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const email = sanitizeEmail(body.email ?? '');

    if (!email || !isValidEmail(email)) {
      // Don't leak whether the email is valid
      return NextResponse.json({ ok: true });
    }

    const localTestBackend = ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('localhost')
        || (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('127.0.0.1'));
    if (localTestBackend && !process.env.RESET_TOKEN_SECRET) {
      // Keep the no-enumeration contract in local demos without pretending
      // that an email was sent. Production still fails closed below.
      return ok({ sent: false, reason: 'email_not_configured' });
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !process.env.RESET_TOKEN_SECRET
    ) {
      return NextResponse.json(
        { ok: false, error: { code: 'PASSWORD_RESET_UNAVAILABLE', message: 'Password reset is not configured' } },
        { status: 503 },
      );
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

    let customTokenStored = false;
    try {
      const { error: tokenInsertError } = await supabase
        .from('password_reset_tokens')
        .insert({
          email,
          token_hash: hashToken(token),
          expires_at: expiresAt,
          used_at: null,
          ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        });
      if (tokenInsertError) throw tokenInsertError;
      customTokenStored = true;
    } catch (tblErr: unknown) {
      // Table might not exist on projects that haven't run the migration.
      // We silently continue — the Supabase recovery email is still sent.
      console.warn('[reset-password] could not insert token (table missing?):', tblErr instanceof Error ? tblErr.message : 'unknown error');
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
    if (customTokenStored) try {
      const signed = signToken(token, email);
      const resetLink = `${appUrl}/reset-password?token=${signed}&email=${encodeURIComponent(email)}&lang=${locale}`;
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
    } catch (e: unknown) {
      console.warn('[reset-password] branded email service threw:', e instanceof Error ? e.message : 'unknown error');
    }

    return ok({ sent: true });
  });
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
