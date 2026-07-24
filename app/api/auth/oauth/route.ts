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
import { withErrorHandling, fail } from '@/lib/api/response';
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
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') as Provider;
    const next = safeNextPath(url.searchParams.get('next'), '/search');
    const locale = safeLang(url.searchParams.get('locale'));
    const reqOrigin = req.nextUrl.origin;

    if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
      return fail(new Error('INVALID_PROVIDER'));
    }

    // Build the callback URL from the canonical base (validated).
    let appUrl: string;
    try {
      appUrl = getCanonicalBaseUrl(reqOrigin);
    } catch (e: any) {
      logger.error('OAuth init: missing APP_URL', { err: e?.message });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'APP_URL_NOT_CONFIGURED',
            message: 'Server is missing APP_URL. Contact the operator.',
          },
        },
        { status: 500 },
      );
    }

    // Include locale in the callback URL so the post-OAuth render is in
    // the user's language. The callback also re-asserts the cookie.
    const redirectTo =
      `${appUrl}/auth/callback` +
      `?next=${encodeURIComponent(next)}` +
      `&lang=${locale}`;

    // Use service-role client to mint the OAuth URL
    const supabase = createServiceClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          // Localize the provider's consent screen
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

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: isProviderDisabled ? 'OAUTH_PROVIDER_DISABLED' : 'OAUTH_INIT_FAILED',
            message: isProviderDisabled
              ? `Provider "${provider}" is not enabled. Please configure it in Supabase Dashboard → Authentication → Providers.`
              : 'OAuth init failed',
            provider,
          },
        },
        { status: isProviderDisabled ? 503 : 500 },
      );
    }

    if (!data?.url) {
      return NextResponse.json(
        { ok: false, error: { code: 'OAUTH_NO_URL', message: 'No OAuth URL returned' } },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, data: { url: data.url } });
  });
}
