/**
 * Global Middleware
 * ─────────────────
 * Responsibilities:
 *  1. CORS preflight
 *  2. Session refresh (Supabase SSR)
 *  3. Security headers
 *  4. Public path bypass
 *  5. Auth redirect for protected prefixes
 *  6. CSRF protection for state-changing API requests
 *  7. Request body size limit (DoS protection)
 *  8. Request ID propagation (NEW)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { applyCorsHeaders, applySecurityHeaders, handlePreflight } from '@/lib/security-headers';
import { generateRequestId } from '@/lib/logging/logger';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';
import { checkLegalLaunchGate } from '@/lib/legal/launch-gate';
import { getPrivilegedMfaState, isPrivilegedMfaEnforced } from '@/lib/auth/privileged-mfa';
import { isTrustedCsrfOrigin } from '@/lib/security/csrf-origin';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/reset-password',
  '/api/login/submit',
  '/api/stripe/webhook',
  '/api/search',
  '/api/products/bestsellers',
  '/api/products/recent',
  '/api/favorites',
  '/api/health',
  '/api/zones',
  '/api/eta',
  '/api/announcements',
  '/api/cart/quote',
  '/api/analytics/product',
  '/api/analytics/cart',
  '/api/analytics/checkout',
];

const MAX_BODY_SIZE_BYTES = 1_000_000; // 1 MB

function isStateChanging(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isApiPath(path: string): boolean {
  return path.startsWith('/api/');
}

/**
 * CSRF check: reject state-changing API requests from untrusted origins.
 */
async function csrfCheck(request: NextRequest): Promise<NextResponse | null> {
  if (!isApiPath(request.nextUrl.pathname)) return null;
  if (!isStateChanging(request.method)) return null;

  const origin = request.headers.get('origin') || request.headers.get('referer') || '';

  if (!origin) {
    const allowNoOrigin = ['/api/stripe/webhook'];
    if (allowNoOrigin.some((p) => request.nextUrl.pathname.startsWith(p))) {
      return null;
    }
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }
    // Log security event (non-blocking)
    try {
      const { logSecurityEvent } = await import('@/lib/services/security-audit');
      if (logSecurityEvent)
      logSecurityEvent({
        eventType: 'CSRF_BLOCKED',
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        userAgent: request.headers.get('user-agent') || undefined,
        resourceType: 'api',
        resourceId: request.nextUrl.pathname,
        details: { method: request.method, reason: 'no_origin' },
      });
    } catch {}
    return NextResponse.json(
      { ok: false, error: 'CSRF', message: 'Origin required' },
      { status: 403 }
    );
  }

  // Production is exact-match only: the current deployment origin or an
  // explicitly configured application origin. This check runs before the
  // development compatibility block below so shared hosts (for example
  // *.vercel.app) never become a production wildcard.
  if (isTrustedCsrfOrigin({
    source: origin,
    requestOrigin: request.nextUrl.origin,
    forwardedHost: request.headers.get('x-forwarded-host') || request.headers.get('host'),
    forwardedProto: request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', ''),
    nodeEnv: process.env.NODE_ENV,
    appUrls: process.env.NEXT_PUBLIC_APP_URL,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
  })) return null;

  if (process.env.NODE_ENV !== 'production') {

  // SECURITY: do exact-match or `origin === u || origin.startsWith(u + '/')`
  // for localhost-family origins. The previous `startsWith('http://localhost')`
  // accepted `http://localhost.evil.com`, which is a phishing / CSRF
  // vector — the attacker's host would be let through, then any state-
  // changing request from a victim who clicked a link would succeed.
  try {
    const localOrigin = new URL(origin);
    if (
      localOrigin.protocol === 'http:' &&
      (localOrigin.hostname === 'localhost' || localOrigin.hostname === '127.0.0.1')
    ) {
      return null;
    }
  } catch {
    // malformed origin â€” continue to rejection
  }

  // Tunnel hosts (loca.lt, ngrok, etc.) - allow in dev
  // NOTE: `vercel.app` is included here so that Vercel preview deployments
  // and production Vercel domains pass the CSRF check. Without it, every
  // state-changing API call from a Vercel-hosted instance returns 403 CSRF
  // and customer-facing flows (registration, login, etc.) fail.
  const tunnelHosts = [
    'loca.lt',
    'ngrok.io',
    'ngrok-free.app',
    'ngrok.app',
    'trycloudflare.com',
    'githubpreview.dev',
    'gitpod.io',
    'serveousercontent.com',  // serveo.net
    'serveo.net',
    'vercel.app',             // Vercel preview + production domains
  ];
  try {
    const originHost = new URL(origin).host;
    if (tunnelHosts.some((h) => originHost === h || originHost.endsWith('.' + h))) {
      return null;
    }
  } catch {
    // bad URL — fall through
  }

  // Allow configured app URL (comma-separated list)
  // SECURITY: Only used as additional allow-list. If the operator's
  // NEXT_PUBLIC_APP_URL is mis-configured (e.g. only localhost on a
  // Vercel deployment), the tunnelHosts check above still permits
  // Vercel domains, so production Vercel traffic is never accidentally
  // blocked by a stale env value.
  //
  // SECURITY: use exact-match for both URL string and host. A naive
  // `startsWith(u)` would let `https://blinkgo.de.evil.com` pass when
  // the operator's APP_URL is `https://blinkgo.de`. Always compare
  // either the full origin or `origin === u || origin.startsWith(u + '/')`.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    const allowedUrls = appUrl.split(',').map((u) => u.trim()).filter(Boolean);
    if (allowedUrls.some((u) => origin === u || origin.startsWith(u + '/'))) {
      return null;
    }
    try {
      const appHosts = allowedUrls.map((u) => new URL(u).host);
      const originHost = new URL(origin).host;
      if (appHosts.includes(originHost)) return null;
    } catch {
      // bad URL in env — fall through to the final rejection
    }
  }

  // Allow operator-defined custom origins (e.g. own domain on Vercel)
  // via ALLOWED_ORIGINS env var (comma-separated). This is in addition to
  // the Vercel-domain allow-list above, so operators can whitelist
  // their own `*.blinkgo.de` or similar without removing the
  // Vercel allow-list.
  //
  // SECURITY: same exact-match constraint as above.
  const customOrigins = process.env.ALLOWED_ORIGINS;
  if (customOrigins) {
    const customUrls = customOrigins.split(',').map((u) => u.trim()).filter(Boolean);
    if (customUrls.some((u) => origin === u || origin.startsWith(u + '/'))) {
      return null;
    }
    try {
      const customHosts = customUrls.map((u) => new URL(u).host);
      const originHost = new URL(origin).host;
      if (customHosts.includes(originHost)) return null;
      if (customHosts.some((h) => originHost === h || originHost.endsWith('.' + h))) {
        return null;
      }
    } catch {
      // bad URL in env — fall through
    }
  }

  }

  // Log security event
  try {
    const { logSecurityEvent } = await import('@/lib/services/security-audit');
      if (logSecurityEvent)
    logSecurityEvent({
      eventType: 'CSRF_BLOCKED',
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      userAgent: request.headers.get('user-agent') || undefined,
      resourceType: 'api',
      resourceId: request.nextUrl.pathname,
      details: { method: request.method, origin, reason: 'origin_not_allowed' },
    });
  } catch {}
  return NextResponse.json(
    { ok: false, error: 'CSRF', message: 'Origin not allowed' },
    { status: 403 }
  );
}

export async function proxy(request: NextRequest) {
  // Germany/EU production launch gate. Legal pages, authentication and the
  // operator console remain reachable so missing evidence can be reviewed;
  // customer transactions and operational portals fail closed with HTTP 503.
  const legalGate = checkLegalLaunchGate();
  const legalGateAccess = [
    '/legal', '/login', '/api/auth', '/api/health', '/admin',
    '/api/admin', '/api/integrations', '/api/automation', '/api/webhooks', '/api/cron',
  ].some((prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`));
  if (!legalGate.ok && !legalGateAccess) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return applySecurityHeaders(NextResponse.json(
        { ok: false, error: 'LEGAL_LAUNCH_BLOCKED', missing: legalGate.missing },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ));
    }
    return applySecurityHeaders(new NextResponse(
      '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlinkGo – Start gesperrt</title><body style="margin:0;background:#0d0d0d;color:#fff;font:16px system-ui;display:grid;min-height:100vh;place-items:center"><main style="max-width:42rem;padding:2rem"><p style="color:#ffc107;font-weight:800">BlinkGo Launch Gate</p><h1>Produktionsstart noch nicht freigegeben</h1><p>Die rechtliche oder betriebliche Konfiguration für Deutschland ist noch unvollständig. Die Plattform nimmt deshalb keine Bestellungen an.</p><p><a href="/legal/impressum" style="color:#ff3b35">Impressum und rechtliche Hinweise</a></p></main></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    ));
  }

  // 1) CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // 2) CSRF check (early)
  const csrfError = await csrfCheck(request);
  if (csrfError) return csrfError;

  // 3) Body size limit
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, error: 'PAYLOAD_TOO_LARGE', max: MAX_BODY_SIZE_BYTES },
      { status: 413 }
    );
  }

  // 4) Session refresh — SKIP for logout
  const isLogoutRequest =
    request.method === 'POST' && request.nextUrl.pathname === '/api/auth/logout';
  const { response, user, supabase } = isLogoutRequest
    ? { response: NextResponse.next(), user: null, supabase: null }
    : await updateSession(request);
  const path = request.nextUrl.pathname;
  const startTime = Date.now();

  // Privileged portal/API access requires a freshly verified AAL2 session in
  // production. Authorization still happens in the page/API guard; this is a
  // centralized second-factor gate so no individual admin route can omit it.
  const isAdminSurface = path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
  const tokenRole = typeof user?.app_metadata?.app_role === 'string' ? user.app_metadata.app_role : '';
  const claimsPrivilegedRole = ['admin', 'super_admin', 'manager'].includes(tokenRole);
  if (isPrivilegedMfaEnforced() && isAdminSurface && user && claimsPrivilegedRole && supabase) {
    const mfaState = await getPrivilegedMfaState(supabase);
    if (mfaState !== 'verified') {
      if (path.startsWith('/api/')) {
        return applySecurityHeaders(NextResponse.json(
          { ok: false, error: 'MFA_REQUIRED', message: 'A verified second factor is required for privileged access.' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } },
        ));
      }
      const mfaUrl = request.nextUrl.clone();
      mfaUrl.pathname = '/auth/mfa';
      mfaUrl.search = '';
      mfaUrl.searchParams.set('redirect', `${path}${request.nextUrl.search}`);
      if (mfaState === 'unavailable') mfaUrl.searchParams.set('error', 'assurance_unavailable');
      return applySecurityHeaders(NextResponse.redirect(mfaUrl));
    }
  }

  // 5) Security headers + CORS
  applyCorsHeaders(request, response);
  applySecurityHeaders(response);

  // 6) Request ID + Response time
  const requestId = request.headers.get('x-request-id') || generateRequestId();
  response.headers.set('X-Request-Id', requestId);

  // 6a) Forward the full request URL to the server components so the
  //     i18n layer can read `?lang=` from the URL on the first render
  //     (matters for emails + OAuth callbacks that land with a lang param).
  response.headers.set('x-url', request.url);
  response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

  // 7) Public path bypass
  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return response;
  }

  // 8) Protected UI prefixes
  const protectedPrefixes = [
    '/admin',
    '/cart',
    '/orders',
    '/restaurants',
    '/restaurant',
    '/search',
    '/driver',
    '/profile',
  ];
  if (protectedPrefixes.some((p) => path.startsWith(p))) {
    const cookieNames = request.cookies.getAll().map(c => c.name);
    const hasAuthCookie = cookieNames.some(n => n.includes('auth-token') && !n.includes('code-verifier'));

    if (!user) {
      authTrace('redirect_to_login', {
        source: AUTH_SOURCES.MIDDLEWARE_NO_USER,
        reason: 'protected_prefix_no_user',
        pathname: path,
        hasAuthCookie,
        cookieNames,
        extra: { userId: (user as any)?.id },
      });
      const url = request.nextUrl.clone();
      const requestedPath = `${path}${request.nextUrl.search}`;
      url.pathname = '/login';
      url.search = '';
      url.searchParams.set('redirect', requestedPath);
      return applyCorsHeaders(request, applySecurityHeaders(NextResponse.redirect(url)));
    } else {
      authTrace('allow', {
        source: AUTH_SOURCES.MIDDLEWARE,
        pathname: path,
        userId: (user as any)?.id,
        hasAuthCookie,
        cookieNames,
        hasSession: true,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|zip|bin|pdf|txt|md|json|xml)$).*)',
  ],
};
