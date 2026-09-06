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
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { logger } from '@/lib/logging';
import { getCanonicalBaseUrl } from '@/lib/auth/redirect-url';
import { getEmailRouter } from '@/lib/integrations/email/router';
import { assertTrustedEmailUrl, emailIdempotencyKey, normalizeEmailLocale } from '@/lib/integrations/email/safety';
import { buildBlinkGoBrandedEmail } from '@/lib/integrations/email/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MIN = 15;

function getServiceClient() {
  return createServiceClient();
}

function buildMagicLinkEmailHtml(link: string, expiresInMin: number, locale: string): string {
  const safeLocale = normalizeEmailLocale(locale);
  const trustedLink = assertTrustedEmailUrl(link);
  const t = {
    de: { title: 'Dein BlinkGo Anmelde-Link', greeting: 'Hallo!', body: 'Klicke auf den Button um dich bei BlinkGo anzumelden:', cta: 'Bei BlinkGo anmelden', copy: 'Oder kopiere diesen Link:', footer: `Der Link ist ${expiresInMin} Minuten gültig und kann nur einmal verwendet werden.` },
    ar: { title: 'رابط تسجيل الدخول إلى BlinkGo', greeting: 'مرحباً!', body: 'انقر على الزر لتسجيل الدخول إلى BlinkGo:', cta: 'تسجيل الدخول إلى BlinkGo', copy: 'أو انسخ هذا الرابط:', footer: `الرابط صالح لمدة ${expiresInMin} دقيقة ويمكن استخدامه مرة واحدة فقط.` },
    en: { title: 'Your BlinkGo Sign-in Link', greeting: 'Hello!', body: 'Click the button to sign in to BlinkGo:', cta: 'Sign in to BlinkGo', copy: 'Or copy this link:', footer: `This link is valid for ${expiresInMin} minutes and can be used only once.` },
  };
  const c = t[safeLocale];
  const securityNote = {
    de: 'Wenn du diese Anmeldung nicht angefordert hast, kannst du diese E-Mail sicher ignorieren.',
    ar: 'إذا لم تطلب تسجيل الدخول هذا، يمكنك تجاهل هذه الرسالة بأمان.',
    en: 'If you did not request this sign-in, you can safely ignore this email.',
  }[safeLocale];
  return buildBlinkGoBrandedEmail({
    locale: safeLocale,
    preheader: c.title,
    headline: c.title,
    paragraphs: [c.greeting, c.body, c.footer],
    cta: { label: c.cta, url: trustedLink },
    fallbackLabel: c.copy,
    securityNote,
  });
}

async function sendMagicLinkEmail(to: string, link: string, locale: string): Promise<boolean> {
  try {
    const safeLocale = normalizeEmailLocale(locale);
    const trustedLink = assertTrustedEmailUrl(link);
    const subject = {
      de: 'Dein BlinkGo Anmelde-Link',
      ar: 'رابط تسجيل الدخول إلى BlinkGo',
      en: 'Your BlinkGo Sign-in Link',
    }[safeLocale];
    const result = await getEmailRouter().send({
      from: process.env.EMAIL_FROM || 'BlinkGo <auth@blinkgo.de>',
      reply_to: process.env.COMPANY_SUPPORT_EMAIL || undefined,
      to,
      subject,
      html: buildMagicLinkEmailHtml(trustedLink, TOKEN_TTL_MIN, safeLocale),
      text: `${subject}\n\n${trustedLink}`,
      tags: { type: 'magic_link', locale: safeLocale },
      idempotency_key: emailIdempotencyKey('magic-link', trustedLink),
    });
    return result.success;
  } catch (e) {
    logger.error('Magic link email send failed', { error_type: e instanceof Error ? e.name : 'unknown' });
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('auth'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => magicLinkHandler(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function magicLinkHandler(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const limited = authRateLimiters.magicLink(req);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const email = sanitizeEmail(body.email);

    // Always return success to prevent email enumeration
    if (!isValidEmail(email)) {
      return ok({ sent: true });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const requestId = `magic-${crypto.randomBytes(6).toString('hex')}`;
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'MAGIC_LINK_UNAVAILABLE',
            message: 'Magic link is not configured',
            requestId,
          },
        },
        { status: 503, headers: { 'X-Request-Id': requestId } },
      );
    }

    const supabase = getServiceClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, is_active, role')
      .eq('email', email)
      .maybeSingle();

    if (!user || !user.is_active) {
      logger.info('Magic link requested for non-existent or inactive user');
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
