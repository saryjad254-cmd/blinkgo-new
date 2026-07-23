/**
 * OAuth Callback Handler — v79 (root-cause fix)
 * ─────────────────────────────────────────────
 * Handles the redirect back from Google/Apple OAuth providers.
 *
 * Flow (official Supabase SSR pattern):
 *   1. Browser calls supabase.auth.signInWithOAuth({ provider, redirectTo })
 *      → @supabase/ssr stores the PKCE code_verifier in the
 *        `sb-<ref>-auth-token-code-verifier` cookie.
 *   2. Google authenticates → Supabase → redirects to /auth/callback?code=…
 *   3. This route builds a `createServerClient` (anon key + cookie adapter)
 *      and calls `supabase.auth.exchangeCodeForSession(code)`.
 *      @supabase/ssr reads the verifier cookie itself, performs the PKCE
 *      exchange, and emits the session cookies via our setAll() —
 *      correctly encoded (`base64-` + base64url of the single-stringified
 *      session JSON) and CHUNKED at 3180 chars (`…-auth-token.0`, `.1`),
 *      so the browser never drops an oversized cookie.
 *   4. We attach every cookie @supabase/ssr emitted onto the final
 *      redirect response.
 *   5. Profile row is fetched/created with the service-role client, then
 *      the user is redirected by role.
 *
 * WHY v78.3 WAS REMOVED (the root cause of the production failure):
 *   v78.3 bypassed exchangeCodeForSession with a hand-rolled path that
 *   extracted the verifier manually, called the token endpoint directly,
 *   and wrote the session cookie itself. That manual write was fatally
 *   broken in two independent ways:
 *     a) It DOUBLE-JSON-stringified the session
 *        (`JSON.stringify(JSON.stringify({...}))`), so @supabase/ssr /
 *        auth-js decoded it to a *string* instead of a session object →
 *        `_isValidSession()` failed → session treated as nonexistent.
 *     b) It wrote ONE unchunked cookie containing the full session
 *        (access token + refresh token + entire Google user object),
 *        whose base64 value routinely exceeds the ~4096-byte browser
 *        per-cookie limit → the browser silently DROPPED the Set-Cookie.
 *   Result: the code-verifier cookie existed, but the auth-token cookie
 *   was never created → middleware saw `hasAuthCookie=false` → redirect
 *   to /login after every successful Google consent.
 *   The "split is not a function" scenario the bypass was written for
 *   cannot occur with this stack: the verifier cookie is written by the
 *   same @supabase/ssr version that reads it, always as a JSON string.
 *
 * SECURITY:
 *   - `next` is validated with safeNextPath() (open-redirect prevention)
 *   - First-time OAuth users always get role: 'customer'
 *   - Locale is preserved through `?lang=`
 *   - We never log the access_token, refresh_token, or full email
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging';
import { getCanonicalBaseUrl, safeNextPath } from '@/lib/auth/redirect-url';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// PROVEN NECESSARY (v79 audit): `force-dynamic` alone does NOT stop Next's
// persistent Data Cache from storing fetch responses made inside this route.
// The audit caught the PKCE token exchange response (containing access +
// refresh tokens) and the /rest/v1/users profile lookups being written to
// .next/cache/fetch-cache and served back on later requests. A cached
// profile row would make role / is_active checks stale (e.g. a disabled
// account still passing), and session tokens must never be persisted to
// disk. force-no-store opts every fetch in this route out of the cache.
export const fetchCache = 'force-no-store';

type PendingCookie = { name: string; value: string; options: CookieOptions };

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function safeLang(s: string | null | undefined): 'de' | 'ar' | 'en' {
  if (s === 'ar' || s === 'en') return s;
  return 'de';
}

/**
 * Attach cookies emitted by @supabase/ssr onto a response.
 * We add `secure` in production as a default; any option provided by
 * @supabase/ssr wins (it supplies path, sameSite, maxAge, httpOnly).
 */
function applyPendingCookies(res: NextResponse, pending: PendingCookie[]): NextResponse {
  for (const { name, value, options } of pending) {
    res.cookies.set(name, value, {
      secure: process.env.NODE_ENV === 'production',
      ...options,
    });
  }
  return res;
}

function buildErrorRedirect(
  req: NextRequest,
  errorCode: string,
  lang: 'de' | 'ar' | 'en',
  pending?: PendingCookie[],
): NextResponse {
  let appUrl: string;
  try {
    appUrl = getCanonicalBaseUrl(req.nextUrl.origin);
  } catch {
    appUrl = req.nextUrl.origin;
  }
  authTrace('error_redirect', {
    source: AUTH_SOURCES.AUTH_CALLBACK_ERROR_REDIRECT,
    errorCode,
    redirectTarget: `${appUrl}/login?error=${errorCode}&lang=${lang}`,
  });
  const res = NextResponse.redirect(`${appUrl}/login?error=${errorCode}&lang=${lang}`);
  if (pending?.length) applyPendingCookies(res, pending);
  return res;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const next = safeNextPath(url.searchParams.get('next'), '/');
    const errorParam = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const lang = safeLang(url.searchParams.get('lang'));
    const reqOrigin = req.nextUrl.origin;

    // Cookie NAMES only (never values) for diagnostics.
    const cookieNames = req.cookies.getAll().map((c) => c.name);
    const hasCodeVerifierCookie = cookieNames.some((n) => n.includes('code-verifier'));
    const hasAuthTokenCookie = cookieNames.some(
      (n) => n.includes('auth-token') && !n.includes('code-verifier'),
    );

    authTrace('entry', {
      source: AUTH_SOURCES.AUTH_CALLBACK_ENTRY,
      pathname: req.nextUrl.pathname,
      hasSession: !!code,
      hasAuthCookie: hasAuthTokenCookie,
      cookieNames,
      extra: { hasCodeVerifierCookie, next, lang, errorParam: errorParam?.slice(0, 50) },
    });

    // 1) Error / early-exit cases
    if (errorParam) {
      logger.warn('OAuth callback error', {
        error: errorParam,
        description: errorDescription?.slice(0, 200),
        lang,
      });
      return buildErrorRedirect(req, `oauth_${errorParam}`, lang);
    }

    if (!code) {
      authTrace('error', {
        source: AUTH_SOURCES.AUTH_CALLBACK_NO_CODE,
        reason: 'no_oauth_code_in_query',
        cookieNames,
      });
      return buildErrorRedirect(req, 'oauth_no_code', lang);
    }

    // 2) PKCE exchange via the official Supabase SSR path.
    //    @supabase/ssr reads the code-verifier cookie from getAll() and
    //    emits correctly encoded + chunked session cookies via setAll().
    //    We buffer them and attach them to whichever response we return.
    const pendingCookies: PendingCookie[] = [];
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet: PendingCookie[]) {
            for (const c of cookiesToSet) {
              pendingCookies.push(c);
            }
          },
        },
      },
    );

    const { data: sessionData, error: sessionErr } =
      await supabase.auth.exchangeCodeForSession(code);

    if (sessionErr || !sessionData?.session) {
      authTrace('error', {
        source: AUTH_SOURCES.AUTH_CALLBACK_EXCHANGE_FAIL,
        reason: 'exchange_failed',
        cookieNames,
        errorCode: sessionErr?.name,
        errorMessage: sessionErr?.message,
      });
      logger.error('OAuth code exchange failed', {
        err: sessionErr?.message,
        hasSession: !!sessionData?.session,
      });
      return buildErrorRedirect(req, 'oauth_exchange_failed', lang, pendingCookies);
    }

    const userId = sessionData.user?.id;
    const userEmail = sessionData.user?.email;
    if (!userId || !userEmail) {
      authTrace('error', {
        source: AUTH_SOURCES.AUTH_CALLBACK_EXCHANGE_FAIL,
        reason: 'no_user_or_email_in_session',
        cookieNames,
      });
      return buildErrorRedirect(req, 'oauth_no_user', lang, pendingCookies);
    }

    authTrace('success', {
      source: AUTH_SOURCES.AUTH_CALLBACK_EXCHANGE_OK,
      userId,
      hasSession: true,
      hasAuthCookie: true,
      cookieNames: pendingCookies.map((c) => c.name),
      extra: { email_domain: userEmail.split('@')[1] },
    });

    // 3) Get or create the public.users record.
    // SECURITY: First-time OAuth users ALWAYS get role='customer' regardless
    // of any metadata the provider may include. Privilege escalation must
    // happen through an authenticated admin flow.
    const serviceClient = getServiceClient();
    const { data: existingUser } = await serviceClient
      .from('users')
      .select('id, email, name, role, is_active, restaurant_id, is_verified')
      .eq('id', userId)
      .maybeSingle();

    let profile = existingUser;
    authTrace('profile_lookup', {
      source: AUTH_SOURCES.AUTH_CALLBACK_PROFILE_FETCH,
      userId,
      profileFound: !!profile,
      role: profile?.role,
      isActive: profile?.is_active,
    });

    if (!profile) {
      const meta = sessionData.user?.user_metadata || {};
      const displayName =
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof meta.name === 'string' && meta.name) ||
        userEmail.split('@')[0];

      // Defensive: try with full payload first, fall back to minimal if
      // the production schema doesn't have all columns.
      const fullPayload = {
        id: userId,
        email: userEmail,
        name: displayName,
        role: 'customer', // ALWAYS customer on first OAuth login
        is_active: true,
        is_verified: true,
        auth_provider: 'oauth',
        avatar_url: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
      };
      const minimalPayload = {
        id: userId,
        email: userEmail,
        name: displayName,
        role: 'customer',
        is_active: true,
        is_verified: true,
      };

      let newUser: any = null;
      let createErr: any = null;
      const r1 = await serviceClient
        .from('users')
        .upsert(fullPayload, { onConflict: 'id', ignoreDuplicates: true })
        .select('id, email, name, role, is_active, is_verified')
        .maybeSingle();

      if (
        r1.error &&
        (r1.error.code === 'PGRST204' ||
          r1.error.message?.includes('schema cache') ||
          r1.error.message?.includes('does not exist'))
      ) {
        authTrace('profile_create_fallback_minimal', {
          source: AUTH_SOURCES.AUTH_CALLBACK_PROFILE_CREATE,
          userId,
          reason: 'full_payload_failed_using_minimal',
          errorCode: r1.error.code,
          errorMessage: r1.error.message,
        });
        const r2 = await serviceClient
          .from('users')
          .upsert(minimalPayload, { onConflict: 'id', ignoreDuplicates: true })
          .select('id, email, name, role, is_active, is_verified')
          .maybeSingle();
        newUser = r2.data;
        createErr = r2.error;
      } else {
        newUser = r1.data;
        createErr = r1.error;
      }

      if (createErr) {
        authTrace('error', {
          source: AUTH_SOURCES.AUTH_CALLBACK_PROFILE_CREATE,
          userId,
          reason: 'create_failed',
          errorCode: createErr.code,
          errorMessage: createErr.message,
        });
        logger.error('Failed to create OAuth user', { err: createErr.message, userId });
        const { data: reRead } = await serviceClient
          .from('users')
          .select('id, email, name, role, is_active, restaurant_id, is_verified')
          .eq('id', userId)
          .maybeSingle();
        profile = reRead;
      } else {
        profile = newUser;
      }
    }

    if (profile && profile.is_active === false) {
      authTrace('error', {
        source: AUTH_SOURCES.AUTH_CALLBACK_FINAL_REDIRECT,
        userId,
        reason: 'account_inactive',
        role: profile.role,
        isActive: profile.is_active,
        redirectTarget: '/login?error=account_disabled',
      });
      // Deliberately DO NOT forward the session cookies: a disabled
      // account must not end up authenticated in the browser.
      return buildErrorRedirect(req, 'account_disabled', lang);
    }

    authTrace('login_successful', {
      source: AUTH_SOURCES.AUTH_CALLBACK_FINAL_REDIRECT,
      userId,
      role: profile?.role || 'customer',
      isActive: profile?.is_active,
      isVerified: profile?.is_verified,
    });

    logger.info('OAuth login successful', {
      userId,
      role: profile?.role || 'customer',
      lang,
    });

    // 4) Determine the redirect target.
    let redirectTo = next;
    if (redirectTo === '/' || redirectTo === '/login') {
      const role = profile?.role || 'customer';
      redirectTo =
        role === 'driver'
          ? '/driver/dashboard'
          : role === 'restaurant_owner'
            ? '/restaurant/dashboard'
            : role === 'admin'
              ? '/admin'
              : '/search';
    }

    // 5) Build the final URL using the canonical base (validated).
    let appUrl: string;
    try {
      appUrl = getCanonicalBaseUrl(reqOrigin);
    } catch {
      appUrl = reqOrigin;
    }
    const sep = redirectTo.includes('?') ? '&' : '?';
    const targetUrl = `${appUrl}${redirectTo}${sep}lang=${lang}`;

    // 6) Single final response: redirect + ALL cookies @supabase/ssr emitted
    //    (chunked auth-token cookies + code-verifier removal) + locale.
    const finalResponse = NextResponse.redirect(targetUrl);
    applyPendingCookies(finalResponse, pendingCookies);
    finalResponse.cookies.set('blinkgo-locale', lang, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: false,
    });

    authTrace('final_redirect', {
      source: AUTH_SOURCES.AUTH_CALLBACK_FINAL_REDIRECT,
      userId,
      role: profile?.role || 'customer',
      redirectTarget: targetUrl,
      extra: {
        cookies_written: pendingCookies.map((c) => c.name),
        cookie_count: pendingCookies.length,
      },
    });

    return finalResponse;
  });
}
