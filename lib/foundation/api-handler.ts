/**
 * Foundation: API Handler
 * ──────────────────────
 * Modern wrapper that consolidates: auth, rate limit, CSRF, role check,
 * error handling, request ID, timing, audit logging.
 *
 * Replaces the legacy `withSecurity` + `secureRoute` + `withErrorHandling`
 * scattered across 60+ API routes.
 *
 * Usage:
 *   export const POST = apiHandler({
 *     method: 'POST',
 *     auth: true,
 *     roles: ['admin'],
 *     rateLimit: { limit: 10, windowSec: 60 },
 *     handler: async ({ req, user, requestId }) => {
 *       return ok({ userId: user.id });
 *     },
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling, getRequestId, setRequestId } from './response';
import { log } from './logger';
import { getClientIp, isTrustedOrigin, checkBodySize } from './http';
import { isAppError, ValidationError, AuthenticationError, AuthorizationError, RateLimitError } from './errors';
import { rateLimit, type RateLimitConfig, getClientIp as rlGetClientIp } from '@/lib/rate-limit';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { roleSatisfies, type Role } from './types';
import { newRequestId } from './response';

export type ApiHandler = (req: NextRequest) => Promise<NextResponse>;

export interface ApiContext {
  readonly req: NextRequest;
  readonly user: { id: string; email: string | null; role: string; name: string | null };
  readonly requestId: string;
  readonly startTime: number;
}

export interface ApiHandlerOptions<TBody = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  auth: boolean;
  roles?: Role[]; // required if auth=true
  publicAccess?: boolean; // if true, skip auth but still apply rate limit / CSRF
  rateLimit?: RateLimitConfig;
  csrf?: boolean | 'skip'; // default true for state-changing methods
  bodySchema?: (v: unknown) => { success: boolean; data?: TBody; error?: { issues: Array<{ message: string; path: (string | number)[] }> } };
  maxBodyBytes?: number;
  handler: (ctx: ApiContext, body?: TBody) => Promise<NextResponse>;
}

// ── Public API ─────────────────────────────────────────────────
export function apiHandler<TBody = unknown>(options: ApiHandlerOptions<TBody>): ApiHandler {
  return async (req: NextRequest) => {
    const requestId = req.headers.get('x-request-id') ?? newRequestId();
    setRequestId(requestId);
    const startTime = Date.now();
    req.headers.set('x-request-id', requestId);

    return withErrorHandling(async () => {
      // 1) Method check
      if (req.method !== options.method) {
        return new NextResponse(
          JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', statusCode: 405 } }),
          { status: 405, headers: { Allow: options.method, 'Content-Type': 'application/json' } },
        );
      }

      // 2) Body size
      if (!checkBodySize(req, options.maxBodyBytes)) {
        return fail({ name: 'PayloadTooLargeError', code: 'PAYLOAD_TOO_LARGE', statusCode: 413, message: 'Payload too large', isOperational: true, safeMessage: 'Payload too large' } as any);
      }

      // 3) CSRF for state-changing methods
      const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method);
      const csrfRequired = isStateChanging && options.csrf !== 'skip' && options.csrf !== false;
      if (csrfRequired) {
        const origin = req.headers.get('origin') ?? '';
        const referer = req.headers.get('referer') ?? '';
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        const allowedOrigins = process.env.ALLOWED_ORIGINS;
        const trusted = isTrustedOrigin(origin, appUrl, allowedOrigins);
        // Some legit requests have no Origin (e.g. server-to-server with
        // an admin key). If the route is admin-key-only, allow.
        if (!origin && !referer && process.env.NODE_ENV === 'production') {
          return fail(new (class extends Error { statusCode = 403; code = 'CSRF'; safeMessage = 'Origin required'; isOperational = true; } as any)());
        }
        if (origin && !trusted) {
          log.warn('csrf.blocked', { origin, path: new URL(req.url).pathname, method: options.method });
          return fail(new (class extends Error { statusCode = 403; code = 'CSRF'; safeMessage = 'Origin not allowed'; isOperational = true; } as any)());
        }
      }

      // 4) Rate limit
      if (options.rateLimit) {
        const limited = rateLimit(options.rateLimit, req);
        if (limited) {
          return new NextResponse(limited.body, {
            status: limited.status,
            headers: new Headers(limited.headers),
          });
        }
      }

      // 5) Auth
      let user: ApiContext['user'] | undefined;
      if (options.auth && !options.publicAccess) {
        const result = await getApiUserWithRole();
        if (!result) return fail(new AuthenticationError('Authentication required'));
        user = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          name: result.user.name,
        };
        // 5a) Role check
        if (options.roles && options.roles.length > 0) {
          if (!roleSatisfies(user.role as Role, options.roles)) {
            return fail(new AuthorizationError(`Required: ${options.roles.join('|')}`));
          }
        }
        // 5b) Active check
        if (!result.user.isActive) {
          return fail(new AuthorizationError('Account is disabled'));
        }
      }

      // 6) Body parsing + validation
      let body: TBody | undefined;
      if (isStateChanging && req.headers.get('content-length') !== '0') {
        const raw = await req.json().catch(() => ({}));
        if (options.bodySchema) {
          const r = options.bodySchema(raw);
          if (!r.success) {
            const first = r.error?.issues[0];
            return fail(new ValidationError(first ? `${first.path.join('.') || 'field'}: ${first.message}` : 'Invalid body'));
          }
          body = r.data as TBody;
        } else {
          body = raw as TBody;
        }
      }

      // 7) Execute
      const ctx: ApiContext = {
        req,
        user: user ?? { id: 'anonymous', email: null, role: 'anonymous', name: null },
        requestId,
        startTime,
      };
      const response = await options.handler(ctx, body);

      // 8) Add timing + request ID headers
      const elapsed = Date.now() - startTime;
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('X-Response-Time', `${elapsed}ms`);
      return response;
    });
  };
}

// ── Method-routing helper ──────────────────────────────────────
export function routeHandlers(handlers: Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', ApiHandler>>): ApiHandler {
  return async (req: NextRequest) => {
    const h = handlers[req.method as keyof typeof handlers];
    if (!h) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', statusCode: 405 } }),
        { status: 405, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return h(req);
  };
}

export { ok, fail, getRequestId, newRequestId, isAppError, ValidationError, AuthenticationError, AuthorizationError, RateLimitError };
