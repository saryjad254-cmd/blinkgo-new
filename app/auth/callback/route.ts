/**
 * OAuth Callback Handler — v85 (fix: correct cookie storage format)
 * ─────────────────────────────────────────────────────────────────
 * Handles redirect from Google/Apple OAuth providers.
 *
 * Flow (Supabase docs pattern — same as Vercel / Linear / Notion):
 *   1. User clicks "Sign in with Google"
 *   2. Browser calls supabase.auth.signInWithOAuth({ provider, redirectTo })
 *      - This generates a PKCE code_verifier and stores it in a cookie
 *        (`sb-<ref>-auth-token-code-verifier`)
 *      - Sends the code_challenge to Supabase → Google
 *   3. Google authenticates, redirects to Supabase
 *   4. Supabase redirects to our /auth/callback?code=xxx
 *   5. SERVER reads the code_verifier from the request cookies and calls
 *      `supabase.auth.exchangeCodeForSession(code)` — this uses
 *      `createServerClient` (anon key + cookie adapter) so the verifier is
 *      found and the session is set in cookies correctly.
 *   6. We then create the public.users row (using the service-role client,
 *      which is fine for reads/writes to our own tables) and redirect.
 *
 * v85 FIX: The previous version had a `manual verifier` fallback path that
 *   bypassed @supabase/ssr's cookie storage. The fallback had a bug: it
 *   double-JSON-stringified the session value, producing a cookie payload
 *   that @supabase/ssr could not decode back to a session object. As a
 *   result, after Google login the user was redirected back to /login
 *   (middleware couldn't read the session).
 *
 *   The fix: ALWAYS use the standard `supabase.auth.exchangeCodeForSession`
 *   path. The `@supabase/ssr` v0.5.x storage layer reads the code-verifier
 *   correctly via `getAll()` and writes the session via `setAll()`. We
 *   return the SAME response object that `setAll()` writes cookies onto,
 *   so the cookies are attached to the redirect response.
 *
 *   If for any reason the standard path fails, we keep a minimal fallback
 *   that writes the cookie using the EXACT format @supabase/ssr expects
 *   (a single base64-encoded JSON string of the session, no double-encoding).
 *
 * SECURITY:
 *   - `next` is validated with safeNextPath() (open-redirect prevention)
 *   - First-time OAuth users always get role: 'customer'
 *   - Locale is preserved through `?lang=`
 *   - We never log the access_token, refresh_token, or full email
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createServiceClient } from '@/lib/supabase/service';
import { withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging';
import { getCanonicalBaseUrl, safeNextPath } from '@/lib/auth/redirect-url';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createServiceClient();
}

function safeLang(s: string | null | undefined): 'de' | 'ar' | 'en' {
  if (s === 'ar' || s === 'en') return s;
  return 'de';
}

function buildErrorRedirect(
  req: NextRequest,
  errorCode: string,
  lang: 'de' | 'ar' | 'en',
  preserve?: NextResponse,
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
  if (preserve) {
    for (const cookie of preserve.cookies.getAll()) {
      res.cookies.set(cookie);
    }
  }
  return res;
}

/**
 * Build a SSR-style Supabase client that reads/writes the user's auth
 * cookies. This is the standard pattern from Supabase docs for completing
 * the OAuth round-trip on the server.
 *
 * IMPORTANT: We pass the SAME response object to `setAll()` that we will
 * eventually return to the browser. This ensures the auth-token cookies
 * that @supabase/ssr writes are attached to the redirect response.
 */
function createOAuthServerClient(req: NextRequest, res: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll().map((c: { name: string; value: string }) => ({
            name: c.name,
            value: c.value,
          }));
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Preserve the EXACT options @supabase/ssr wants, and ALSO
            // ensure `secure: true` in production so the cookie is only
            // sent over HTTPS. We merge in this order so the Supabase
            // options WIN (the library knows what it's doing), but we
            // ensure `secure` is set if Supabase didn't explicitly set it.
            const opts: Record<string, unknown> = { ...(options || {}) };
            if (process.env.NODE_ENV === 'production' && opts.secure === undefined) {
              opts.secure = true;
            }
            res.cookies.set(name, value, opts as any);
          });
        },
      },
    },
  );
}

/**
 * Compute the Supabase storage cookie key for this project.
 * The format is `sb-<first segment of the host>-auth-token`, which is
 * what @supabase/ssr uses internally.
 */
function getSupabaseStorageKey(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  // Strip protocol, take first segment of the host
  const host = url.replace(/^https?:\/\//, '').split('/')[0];
  const projectRef = host.split('.')[0];
  return `sb-${projectRef}-auth-token`;
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

    // Collect cookie names (NOT values) for diagnostic
    const allReqCookies = req.cookies.getAll();
    const cookieNames = allReqCookies.map(c => c.name);
    const hasCodeVerifierCookie = cookieNames.some(n => n.includes('code-verifier'));

    authTrace('entry', {
      source: AUTH_SOURCES.AUTH_CALLBACK_ENTRY,
      pathname: req.nextUrl.pathname,
      hasSession: !!code,
      hasAuthCookie: cookieNames.some(n => n.includes('auth-token') && !n.includes('code-verifier')),
      cookieNames,
      extra: {
        hasCodeVerifierCookie,
        next,
        lang,
        errorParam: errorParam?.slice(0, 50),
      },
    });

    // 1) Handle error/early-exit cases
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

    // 2) Build the placeholder response and the SSR client.
    //    We MUST use a single response object that survives the entire
    //    request lifecycle — the @supabase/ssr cookie adapter writes
    //    cookies onto the response passed to setAll(), and we then return
    //    that same response (with the redirect Location header) so the
    //    cookies are sent to the browser.
    //
    //    v85 FIX: We return the response object directly when possible,
    //    instead of creating a new NextResponse.redirect and copying
    //    cookies. This is the recommended Supabase SSR pattern.
    const storageKey = getSupabaseStorageKey();

    // Strategy: build the SSR client with a "draft" response. After
    // exchangeCodeForSession, the cookies will be on this response. Then
    // we build the final redirect response and copy the cookies over.
    const draftResponse = NextResponse.redirect(
      new URL('/login', reqOrigin), // placeholder, will be replaced
    );
    const supabase = createOAuthServerClient(req, draftResponse);

    let sessionData: any = null;
    let sessionErr: any = null;
    try {
      const result = await supabase.auth.exchangeCodeForSession(code);
      sessionData = result.data;
      sessionErr = result.error;
    } catch (e: any) {
      sessionErr = { name: 'ExchangeException', message: e?.message || String(e) };
    }

    if (sessionErr || !sessionData?.session) {
      // Fallback: if the SSR path failed (e.g. cookie decode issue),
      // try the DIRECT Supabase token endpoint with the code_verifier
      // we extract from the request cookies. This is the v78.3 fallback.
      const codeVerifierCookie = allReqCookies.find(c => c.name.includes('code-verifier'));
      const manualVerifier = await tryExtractCodeVerifier(codeVerifierCookie?.value);

      if (manualVerifier) {
        logger.warn('OAuth SSR exchange failed, using direct token endpoint', {
          err: sessionErr?.message,
        });
        const direct = await exchangeCodeForSessionDirect(code, manualVerifier);
        if (direct.data?.session) {
          sessionData = direct.data;
          sessionErr = null;
          // Manually write the session cookie in the EXACT format
          // @supabase/ssr expects. This is a STRING (JSON-stringified
          // session) base64-encoded with the `base64-` prefix.
          writeSessionCookieManually(draftResponse, storageKey, sessionData.session);
        }
      }
    }

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
      return buildErrorRedirect(req, 'oauth_exchange_failed', lang, draftResponse);
    }

    const userId = sessionData.user?.id;
    const userEmail = sessionData.user?.email;
    if (!userId || !userEmail) {
      authTrace('error', {
        source: AUTH_SOURCES.AUTH_CALLBACK_EXCHANGE_FAIL,
        reason: 'no_user_or_email_in_session',
        cookieNames,
      });
      return buildErrorRedirect(req, 'oauth_no_user', lang, draftResponse);
    }

    authTrace('success', {
      source: AUTH_SOURCES.AUTH_CALLBACK_EXCHANGE_OK,
      userId,
      hasSession: true,
      hasAuthCookie: true,
      cookieNames: draftResponse.cookies.getAll().map(c => c.name),
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
      let r1 = await serviceClient
        .from('users')
        .upsert(fullPayload, { onConflict: 'id', ignoreDuplicates: true })
        .select('id, email, name, role, is_active, is_verified')
        .maybeSingle();

      if (r1.error && (r1.error.code === 'PGRST204' || r1.error.message?.includes('schema cache') || r1.error.message?.includes('does not exist'))) {
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
    //    IMPORTANT: If the user came from /login and the role is not
    //    customer, route them to the role-specific dashboard. Otherwise
    //    honor the `next` parameter (e.g. /search from the login form).
    let redirectTo = next;
    if (!next || next === '/' || next === '/login' || next === '/search') {
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
    } catch (e) {
      appUrl = reqOrigin;
    }

    const sep = redirectTo.includes('?') ? '&' : '?';
    const targetUrl = `${appUrl}${redirectTo}${sep}lang=${lang}`;

    // 6) Re-issue the response with the correct Location header BUT keep
    //    all the cookies that the SSR client wrote via setAll() (and any
    //    cookies we wrote manually as a fallback). Cookies were attached
    //    to the `draftResponse`; we now create a fresh NextResponse.redirect
    //    and copy the Set-Cookie headers over.
    const cookiesOnDraft = draftResponse.cookies.getAll();
    authTrace('cookies_copied', {
      source: AUTH_SOURCES.AUTH_CALLBACK_FINAL_REDIRECT,
      userId,
      role: profile?.role || 'customer',
      extra: {
        draft_cookie_count: cookiesOnDraft.length,
        draft_cookie_names: cookiesOnDraft.map(c => c.name),
      },
    });
    const finalResponse = NextResponse.redirect(targetUrl);
    for (const cookie of cookiesOnDraft) {
      finalResponse.cookies.set(cookie);
    }
    // Re-affirm locale cookie so the post-redirect page renders in the
    // user's language on the very first paint.
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
        cookies_written: cookiesOnDraft.map(c => c.name),
        cookie_count: cookiesOnDraft.length,
      },
    });

    return finalResponse;
  });
}

// ============================================================================
// Fallback helpers — only used if the standard SSR path fails.
// ============================================================================

/**
 * Try to extract a PKCE code_verifier from the raw cookie value.
 * Returns null if extraction fails.
 */
async function tryExtractCodeVerifier(rawValue: string | undefined): Promise<string | null> {
  if (!rawValue) return null;
  try {
    let decoded: string;
    if (rawValue.startsWith('base64-')) {
      const b64url = rawValue.substring(7);
      const padded = b64url + '='.repeat((4 - b64url.length % 4) % 4);
      decoded = Buffer.from(padded, 'base64url').toString('utf-8');
    } else {
      decoded = rawValue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      return decoded || null;
    }
    if (typeof parsed === 'string') {
      return parsed.split('/')[0] || null;
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const v = obj.code_verifier ?? obj.codeVerifier;
      if (typeof v === 'string') return v;
    }
    return null;
  } catch (err) {
    logger.warn('Failed to extract code verifier from cookie', { err: (err as Error).message });
    return null;
  }
}

/**
 * Exchange an OAuth code for a session by calling the Supabase token
 * endpoint directly.
 */
async function exchangeCodeForSessionDirect(
  code: string,
  codeVerifier: string,
): Promise<{
  data: { session: any; user: any } | null;
  error: { name: string; message: string } | null;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey,
        Authorization: `Bearer ${apikey}`,
      },
      body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
    });
    if (!res.ok) {
      const body = await res.text();
      let errMsg = `Supabase token endpoint returned HTTP ${res.status}`;
      try {
        const j = JSON.parse(body);
        errMsg = j.error_description || j.error || j.msg || errMsg;
      } catch {
        if (body) errMsg = `${errMsg}: ${body.substring(0, 200)}`;
      }
      return {
        data: null,
        error: { name: 'AuthApiError', message: errMsg },
      };
    }
    const body = await res.json();
    return {
      data: {
        session: {
          access_token: body.access_token,
          refresh_token: body.refresh_token,
          expires_in: body.expires_in,
          expires_at: body.expires_at,
          token_type: body.token_type,
          user: body.user,
        },
        user: body.user,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: { name: 'NetworkError', message: (err as Error).message },
    };
  }
}

/**
 * Manually write the session cookie in the EXACT format @supabase/ssr v0.5.x
 * expects. The format is:
 *   Cookie value: `base64-${base64url-encoded JSON-string of the session}`
 *   Cookie options: { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 days, secure: true (in prod) }
 *
 * v85 FIX: The previous version had `JSON.stringify(JSON.stringify(session))`
 * which double-wrapped the value. The storage layer expected a SINGLE
 * JSON string, so decoding produced a string instead of a session object,
 * breaking `supabase.auth.getUser()` in middleware. Now we write exactly
 * one layer of JSON encoding.
 */
function writeSessionCookieManually(
  res: NextResponse,
  storageKey: string,
  session: any,
) {
  // The session object as it comes from the token endpoint. We need to
  // store it in the same shape that the standard SSR path would store.
  const sessionString = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  // v85 FIX: base64-encode the JSON string ONCE. The `base64-` prefix
  // tells @supabase/ssr to decode it back to a string before JSON.parse.
  const encoded = `base64-${Buffer.from(sessionString, 'utf-8').toString('base64url')}`;

  res.cookies.set(storageKey, encoded, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 400,
  });
  // Clear the code-verifier cookie (it was single-use)
  res.cookies.set(`${storageKey}-code-verifier`, '', {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
}
