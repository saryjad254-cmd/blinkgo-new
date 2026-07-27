/**
 * OAuth Init Endpoint
 * ───────────────────
 * Initiates OAuth flow with Supabase (Google, Apple, etc.).
 * Returns the redirect URL to the client.
 *
 * Security:
 *   - The callback URL is built from APP_URL (validated against allowlist).
 *   - We never trust arbitrary Host headers for the redirect.
 *   - Locale is appended to the callback URL so the post-OAuth page
 *     renders in the same language the user started with.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { withErrorHandling, fail, ok } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { logger } from '@/lib/logging';
import { getCanonicalBaseUrl, safeNextPath } from '@/lib/auth/redirect-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_PROVIDERS = ['google', 'apple', 'github', 'facebook', 'azure'] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

function safeLang(s: string | null | undefined): 'de' | 'ar' | 'en' {
  if (s === 'ar' || s === 'en') return s;
  return 'de';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    // OAuth init is a public, sensitive endpoint — strong rate limit
    secureRoute('auth'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => oauthHandler(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function oauthHandler(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') as Provider;
    const next = safeNextPath(url.searchParams.get('next'), '/search');
    const locale = safeLang(url.searchParams.get('locale'));
    const reqOrigin = req.nextUrl.origin;

    if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
      return fail(new Error('INVALID_PROVIDER'));
    }

    let appUrl: string;
    try {
      appUrl = getCanonicalBaseUrl(reqOrigin);
    } catch (e: any) {
      logger.error('OAuth init: missing APP_URL', { err: e?.message });
      return fail(new Error('APP_URL_NOT_CONFIGURED: Server is missing APP_URL. Contact the operator.'));
    }

    const redirectTo =
      `${appUrl}/auth/callback` +
      `?next=${encodeURIComponent(next)}` +
      `&lang=${locale}`;

    const supabase = createServiceClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          hl: locale === 'ar' ? 'ar' : locale === 'en' ? 'en' : 'de',
        },
      },
    });

    if (error) {
      const isProviderDisabled =
        error.message?.toLowerCase().includes('not enabled') ||
        error.message?.toLowerCase().includes('provider is not enabled') ||
        error.message?.toLowerCase().includes('unsupported provider');

      logger.error('OAuth init failed', { provider, err: error.message, isProviderDisabled });

      return fail(new Error(
        isProviderDisabled
          ? `OAUTH_PROVIDER_DISABLED: Provider "${provider}" is not enabled. Please configure it in Supabase Dashboard → Authentication → Providers.`
          : 'OAUTH_INIT_FAILED: OAuth init failed',
      ));
    }

    if (!data?.url) {
      return fail(new Error('OAUTH_NO_URL: No OAuth URL returned'));
    }

    return ok({ url: data.url });
  });
}
