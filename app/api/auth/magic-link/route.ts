/**
 * Magic Link Authentication API
 * ──────────────────────────────
 * Passwordless login via email link (Stripe / Slack / Notion pattern).
 * 
 * Flow:
 * 1. POST /api/auth/magic-link with { email }
 *    - Rate limited (5/hour/email, 20/hour/IP)
 *    - Always returns success (prevent email enumeration)
 *    - If email exists: generates token, sends email with link
 *    - Token stored in DB with 15-min expiry
 * 2. GET /api/auth/magic-link/verify?token=xxx
 *    - Validates token (not used, not expired)
 *    - Logs in user, sets cookies
 *    - Marks token as used
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { authRateLimiters } from '@/lib/rate-limit';
import { isValidEmail, sanitizeEmail } from '@/lib/validation';
import { ok, withErrorHandling, fail } from '@/lib/api/response';
import { logger } from '@/lib/logging';
import { getCanonicalBaseUrl } from '@/lib/auth/redirect-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MIN = 15;

function getServiceClient() {
  return createServiceClient();
}

function buildMagicLinkEmailHtml(link: string, expiresInMin: number, locale: string): string {
  const t = {
    de: { title: 'Dein BlinkGo Anmelde-Link', greeting: 'Hallo!', body: 'Klicke auf den Button um dich bei BlinkGo anzumelden:', cta: 'Bei BlinkGo anmelden', copy: 'Oder kopiere diesen Link:', footer: `Der Link ist ${expiresInMin} Minuten gültig und kann nur einmal verwendet werden.` },
    ar: { title: 'رابط تسجيل الدخول إلى BlinkGo', greeting: 'مرحباً!', body: 'انقر على الزر لتسجيل الدخول إلى BlinkGo:', cta: 'تسجيل الدخول إلى BlinkGo', copy: 'أو انسخ هذا الرابط:', footer: `الرابط صالح لمدة ${expiresInMin} دقيقة ويمكن استخدامه مرة واحدة فقط.` },
    en: { title: 'Your BlinkGo Sign-in Link', greeting: 'Hello!', body: 'Click the button to sign in to BlinkGo:', cta: 'Sign in to BlinkGo', copy: 'Or copy this link:', footer: `This link is valid for ${expiresInMin} minutes and can be used only once.` },
  };
  const c = t[locale as 'de' | 'ar' | 'en'] ?? t.de;
  return `
    <div dir="${locale === 'ar' ? 'rtl' : 'ltr'}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px; background: #0a0a0a; color: #f5f5f5;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="background: linear-gradient(135deg, #DC2626, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 32px; margin: 0;">BlinkGo</h1>
      </div>
      <h2 style="color: #f5f5f5; font-size: 22px; margin: 0 0 16px;">${c.greeting}</h2>
      <p style="color: #d4d4d4; font-size: 16px; line-height: 1.5;">${c.body}</p>
      <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #DC2626 0%, #ef4444 100%); color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; margin: 24px 0;">${c.cta}</a>
      <p style="color: #a3a3a3; font-size: 14px;">${c.copy}</p>
      <p style="background: #171717; padding: 12px; border-radius: 8px; word-break: break-all; font-size: 12px; color: #d4d4d4; border: 1px solid #262626;">${link}</p>
      <p style="color: #737373; font-size: 12px; margin-top: 24px;">${c.footer}</p>
    </div>
  `;
}

async function sendMagicLinkEmail(to: string, link: string, locale: string): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    logger.info('Magic link (no email service configured):', { to, link });
    return true;
  }
  try {
    const { Resend } = await import('resend');
    const r = new Resend(resendKey);
    const subject = {
      de: 'Dein BlinkGo Anmelde-Link',
      ar: 'رابط تسجيل الدخول إلى BlinkGo',
      en: 'Your BlinkGo Sign-in Link',
    }[locale] || 'Your BlinkGo Sign-in Link';
    await r.emails.send({
      from: process.env.EMAIL_FROM || 'BlinkGo <noreply@blinkgo.de>',
      to,
      subject,
      html: buildMagicLinkEmailHtml(link, TOKEN_TTL_MIN, locale),
    });
    return true;
  } catch (e) {
    logger.error('Magic link email send failed', { err: String(e) });
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const limited = authRateLimiters.magicLink(req);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const email = sanitizeEmail(body.email);

    // Always return success to prevent email enumeration
    if (!isValidEmail(email)) {
      return ok({ sent: true });
    }

    const supabase = getServiceClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, is_active, role')
      .eq('email', email)
      .maybeSingle();

    if (!user || !user.is_active) {
      logger.info('Magic link requested for non-existent or inactive user', { email });
      return ok({ sent: true });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000).toISOString();
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '0.0.0.0';

    // Store token (graceful if table doesn't exist)
    const { error: insertErr } = await supabase
      .from('magic_link_tokens')
      .insert({
        email,
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_ip: clientIp,
      });

    if (insertErr) {
      // Table-missing is a CONFIGURATION error, not a user error.
      // Log a clear, actionable message and return 503 so the operator sees
      // it in Vercel logs and knows to run the migration. We do NOT silently
      // fake success — that was the original bug.
      if (insertErr.code === 'PGRST205' || insertErr.code === '42P01') {
        const reqId = `magic-${crypto.randomBytes(6).toString('hex')}`;
        logger.error('magic_link_tokens table missing — run deploy/supabase/00-INIT-MAGIC-LINK-TOKENS.sql', {
          reqId,
          table: 'magic_link_tokens',
          migration: 'deploy/supabase/00-INIT-MAGIC-LINK-TOKENS.sql',
        });
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'MAGIC_LINK_UNAVAILABLE',
              message:
                'Magic link is temporarily unavailable. The operator has been notified. Please try again later or use password login.',
              requestId: reqId,
            },
          },
          { status: 503 },
        );
      }
      const reqId = `magic-${crypto.randomBytes(6).toString('hex')}`;
      logger.error('Magic link token insert failed', { reqId, err: insertErr.message });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'MAGIC_LINK_FAILED',
            message: 'Could not generate magic link. Please try again.',
            requestId: reqId,
          },
        },
        { status: 500 },
      );
    }

    // Build magic link URL using the canonical production base.
    // This is the SAME base as reset-password so behavior is consistent.
    // In dev, falls back to the request origin (validated via allowlist).
    const appUrl = getCanonicalBaseUrl(req.nextUrl.origin);
    const link = `${appUrl}/api/auth/magic-link/verify?token=${token}`;

    // Detect locale from cookie
    const cookieHeader = req.headers.get('cookie') || '';
    const localeMatch = cookieHeader.match(/blinkgo-locale=(de|ar|en)/);
    const locale = localeMatch?.[1] || 'de';

    // Send the email. If delivery fails, surface a 502 so the operator
    // sees the problem rather than a fake success.
    const sent = await sendMagicLinkEmail(email, link, locale);
    if (!sent) {
      const reqId = `magic-${crypto.randomBytes(6).toString('hex')}`;
      logger.error('Magic link email delivery failed', { reqId, email });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'EMAIL_DELIVERY_FAILED',
            message: 'We could not send the magic link email. Please try again later.',
            requestId: reqId,
          },
        },
        { status: 502 },
      );
    }

    const reqId = `magic-${crypto.randomBytes(6).toString('hex')}`;
    logger.info('Magic link sent', { reqId, userId: user.id });
    return ok({ sent: true, requestId: reqId });
  });
}
