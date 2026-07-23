/**
 * Magic Link Verify — Exchange token for session
 * GET /api/auth/magic-link/verify?token=xxx[&lang=de|ar|en]
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { withErrorHandling } from '@/lib/api/response';
import { AuthService, AuthenticatedUser } from '@/lib/services/auth-service';
import { logger } from '@/lib/logging';
import { getCanonicalBaseUrl } from '@/lib/auth/redirect-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createServiceClient();
}

function safeLang(s: string | null | undefined): 'de' | 'ar' | 'en' {
  if (s === 'ar' || s === 'en') return s;
  return 'de';
}

function redirectWithError(error: string, reqOrigin?: string, lang?: string): NextResponse {
  let appUrl: string;
  try {
    appUrl = getCanonicalBaseUrl(reqOrigin);
  } catch (e) {
    // Fallback to request origin if env is missing (dev only). In prod,
    // the operator will see the same error in Vercel logs.
    appUrl = reqOrigin || 'http://localhost:3000';
  }
  const qs = lang ? `&lang=${safeLang(lang)}` : '';
  return NextResponse.redirect(`${appUrl}/login?error=${error}${qs}`);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const lang = safeLang(url.searchParams.get('lang'));
    const reqOrigin = req.nextUrl.origin;

    if (!token || token.length !== 64) {
      return redirectWithError('invalid_magic_link', reqOrigin, lang);
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const supabase = getServiceClient();

    // Find valid token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('magic_link_tokens')
      .select('id, user_id, email, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenErr && (tokenErr.code === 'PGRST205' || tokenErr.code === '42P01')) {
      // Table missing — this is a deployment error, not user error.
      // Surface a clear message instead of silently failing.
      logger.error('magic_link_tokens table missing — run deploy/supabase/00-INIT-MAGIC-LINK-TOKENS.sql');
      return redirectWithError('magic_link_unavailable', reqOrigin, lang);
    }

    if (!tokenRow) {
      return redirectWithError('invalid_magic_link', reqOrigin, lang);
    }

    if (tokenRow.used_at) {
      return redirectWithError('magic_link_used', reqOrigin, lang);
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return redirectWithError('magic_link_expired', reqOrigin, lang);
    }

    // Mark token as used (single-use enforcement) BEFORE the session mint
    // so a replay attack cannot reuse the token if minting fails.
    const { error: markErr } = await supabase
      .from('magic_link_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)
      .is('used_at', null);
    if (markErr) {
      logger.warn('Magic link token mark-as-used failed', { err: markErr.message });
    }

    // Get user details
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, role, restaurant_id, is_active')
      .eq('id', tokenRow.user_id)
      .maybeSingle();

    if (!user || !user.is_active) {
      return redirectWithError('account_disabled', reqOrigin, lang);
    }

    // Create session via Supabase admin API.
    // Use canonical base for the redirectTo (not the raw request origin).
    let appUrl: string;
    try {
      appUrl = getCanonicalBaseUrl(reqOrigin);
    } catch (e) {
      appUrl = reqOrigin;
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: tokenRow.email,
      options: { redirectTo: `${appUrl}/api/auth/magic-link/verify` },
    });

    if (linkErr || !linkData) {
      logger.error('Failed to generate session for magic link', { err: linkErr?.message });
      return redirectWithError('login_failed', reqOrigin, lang);
    }

    // Mint a real session by verifying the OTP returned by admin.generateLink.
    const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties?.email_otp || linkData.properties?.hashed_token,
      type: 'magiclink',
    });

    if (otpErr || !otpData?.session) {
      logger.warn('verifyOtp failed for magic link', { err: otpErr?.message });
      return redirectWithError('login_failed', reqOrigin, lang);
    }

    // Set the session cookies
    AuthService.setSessionCookies({
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
      token_type: otpData.session.token_type,
      expires_in: otpData.session.expires_in,
      expires_at: otpData.session.expires_at,
    });

    // Set the locale cookie so the post-redirect render is in the right language
    const cookieLang = req.cookies.get('blinkgo-locale')?.value;
    if (cookieLang !== lang) {
      // No-op here; the caller page reads `lang` from the URL and sets the cookie
    }

    logger.info('Magic link login successful', { userId: user.id, role: user.role, lang });

    // Redirect to role-specific dashboard. Preserve lang so the next page
    // renders in the right language.
    const dashboard = user.role === 'driver'
      ? '/driver/dashboard'
      : user.role === 'restaurant_owner'
        ? '/restaurant/dashboard'
        : user.role === 'admin'
          ? '/admin'
          : '/search';

    // Use NextResponse.redirect with cookies so the locale sticks.
    const redirectResponse = NextResponse.redirect(`${appUrl}${dashboard}?lang=${lang}`);
    // Re-affirm locale cookie (1 year, same lax) so the auth client picks it up
    redirectResponse.cookies.set('blinkgo-locale', lang, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: false, // must be readable by client I18nProvider
    });
    return redirectResponse;
  });
}
