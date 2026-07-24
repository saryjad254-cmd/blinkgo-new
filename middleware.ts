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
import { logSecurityEvent } from '@/lib/services/security-audit';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/go',
  '/fix-rls',
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

  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    return null;
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    const allowedUrls = appUrl.split(',').map((u) => u.trim()).filter(Boolean);
    if (allowedUrls.some((u) => origin.startsWith(u))) {
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
  const customOrigins = process.env.ALLOWED_ORIGINS;
  if (customOrigins) {
    const customUrls = customOrigins.split(',').map((u) => u.trim()).filter(Boolean);
    if (customUrls.some((u) => origin.startsWith(u))) {
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

export async function middleware(request: NextRequest) {
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
  const { response, user } = isLogoutRequest
    ? { response: NextResponse.next(), user: null }
    : await updateSession(request);
  const path = request.nextUrl.pathname;
  const startTime = Date.now();

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
      url.pathname = '/login';
      url.searchParams.set('redirect', path);
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
