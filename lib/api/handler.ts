/**
 * API Layer: Canonical Handler
 * ─────────────────────────────
 * The single, canonical way to write an API route.
 *
 * Every API route in BlinkGo MUST go through `apiRoute()`.
 * This wrapper consolidates:
 *   1. Method validation (only the declared method returns 200; others get 405)
 *   2. Body parsing + Foundation `z` validation
 *   3. Authentication via Foundation + Data Layer
 *   4. Role-based authorization
 *   5. Rate limiting (token-bucket)
 *   6. CSRF protection (exact-match Origin)
 *   7. Body size limits
 *   8. Request ID + timing
 *   9. Structured logging (Foundation)
 *  10. Error handling → Foundation `fail()` → AppError → HTTP envelope
 *  11. Audit logging (for sensitive operations)
 *
 * Pattern:
 *   export const POST = apiRoute({
 *     method: 'POST',
 *     auth: 'required',
 *     roles: ['admin'],
 *     rateLimit: 'strict',
 *     schema: z.object({ ... }),
 *     handler: async (ctx) => {
 *       const result = await MyService.doThing(ctx.body, ctx.user);
 *       return ok(result);
 *     },
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  withErrorHandling, setRequestId,
  newRequestId, log, AppError, ValidationError,
  type Role,
} from '@/lib/foundation';
import { rateLimit, type RateLimitConfig } from '@/lib/rate-limit';
import { getApiUserFromRequest, type AuthedUser } from '@/lib/auth-helper';
import { getClientIp, isTrustedOrigin, checkBodySize } from '@/lib/foundation/http';
import { roleSatisfies } from '@/lib/foundation/types';
import { type ZodType } from '@/lib/foundation/zod-mini';
import { RATE_TIERS } from '@/lib/api/security-helpers';
import {
  activeConnections,
  httpErrorsTotal,
  httpRequestDurationMs,
  httpRequestsTotal,
} from '@/lib/observability/metrics';

// ── Types ────────────────────────────────────────────────────
export type AuthMode = 'required' | 'optional' | 'public';
export type RateLimitTier = keyof typeof RATE_TIERS;
export type CsrfMode = 'enforce' | 'skip' | 'admin-key-only';

export interface ApiRequestContext<TBody, TQuery = Record<string, unknown>> {
  readonly req: NextRequest;
  readonly user: AuthedUser | null;  // null when public
  readonly body: TBody;
  readonly query: TQuery;
  readonly params: Record<string, string>;
  readonly requestId: string;
  readonly startTime: number;
  readonly ip: string;
  readonly userAgent: string;
  readonly origin: string;
  readonly method: string;
  readonly path: string;
}

export interface ApiRouteOptions<TBody = unknown, TQuery = Record<string, unknown>, TParams = Record<string, string>> {
  /** HTTP method (only this method returns 200; others get 405) */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  /** Authentication mode */
  auth: AuthMode;

  /** Required roles (only if auth=required). Empty = any authenticated user. */
  roles?: Role[];

  /** Rate limit tier (string alias to RATE_TIERS) */
  rateLimit?: RateLimitTier | RateLimitConfig;

  /** CSRF mode (default: enforce for POST/PUT/PATCH/DELETE) */
  csrf?: CsrfMode;

  /** Body schema (Foundation `z` instance) — auto-parses and validates */
  bodySchema?: ZodType<TBody>;

  /** Max body size in bytes (default: 1 MB) */
  maxBodyBytes?: number;

  /** Audit log event name (logs to audit_log on every successful call) */
  auditEvent?: string;

  /** Custom authorization predicate (after role check) */
  customAuth?: (user: AuthedUser, req: NextRequest) => Promise<boolean> | boolean;

  /** Cache-Control header (string) — applied to response */
  cacheControl?: string;

  /** The actual handler — must return a NextResponse (use Foundation `ok()`) */
  handler: (ctx: ApiRequestContext<TBody, TQuery> & { params: TParams }) => Promise<NextResponse>;
}

// ── Helpers ──────────────────────────────────────────────────
function getRateLimitConfig(tier: RateLimitTier | RateLimitConfig | undefined): RateLimitConfig | undefined {
  if (!tier) return undefined;
  if (typeof tier === 'string') return RATE_TIERS[tier];
  return tier;
}

function isStateChanging(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function parseQuery(req: NextRequest): Record<string, string | string[]> {
  const url = new URL(req.url);
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) existing.push(value);
      else result[key] = [existing, value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function metricRoute(path: string): string {
  return path
    .split('/')
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
      if (/^\d{4,}$/.test(segment) || segment.length > 48) return ':id';
      return segment;
    })
    .join('/') || '/';
}

// ── The canonical wrapper ───────────────────────────────────
export function apiRoute<TBody = unknown, TQuery = Record<string, unknown>, TParams = Record<string, string>>(
  options: ApiRouteOptions<TBody, TQuery, TParams>,
): (req: NextRequest, ctx: { params: Promise<TParams> }) => Promise<NextResponse> {
  const tier = getRateLimitConfig(options.rateLimit);
  const csrfMode: CsrfMode = options.csrf ?? (isStateChanging(options.method) ? 'enforce' : 'skip');
  const maxBytes = options.maxBodyBytes ?? 1_000_000;

  return async (
    req: NextRequest,
    routeCtx?: { params?: Promise<TParams> | TParams },
  ): Promise<NextResponse> => {
    const startTime = Date.now();
    const requestId = req.headers.get('x-request-id') || newRequestId();
    setRequestId(requestId);
    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') ?? '';
    const origin = req.headers.get('origin') ?? '';
    const url = new URL(req.url);
    const path = url.pathname;
    const metricsRoute = metricRoute(path);
    const method = req.method.toUpperCase();
    const connectionLabels = { method, route: metricsRoute };
    activeConnections.inc(connectionLabels);

    const finish = <R extends NextResponse>(response: R): R => {
      const durationMs = Date.now() - startTime;
      const labels = { method, route: metricsRoute, status: String(response.status) };
      httpRequestsTotal.inc(labels);
      httpRequestDurationMs.observe(durationMs, labels);
      if (response.status >= 500) httpErrorsTotal.inc(labels);
      activeConnections.dec(connectionLabels);
      log.info('api.request.completed', {
        path: metricsRoute,
        method,
        status: response.status,
        durationMs,
        requestId,
      });
      return response;
    };

    // ── 1) Method check ─────────────────────────────────
    if (req.method !== options.method) {
      return finish(new NextResponse(
        JSON.stringify({
          ok: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed`, statusCode: 405 },
          requestId,
        }),
        { status: 405, headers: { Allow: options.method, 'Content-Type': 'application/json' } },
      ));
    }

    const finalResponse = await withErrorHandling(async () => {
      // ── 2) Body size ─────────────────────────────────────
      if (!checkBodySize(req, maxBytes)) {
        throw new AppError('Payload too large', { statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
      }

      // ── 3) CSRF ──────────────────────────────────────────
      if (csrfMode === 'enforce') {
        const trusted = isTrustedOrigin(origin, process.env.NEXT_PUBLIC_APP_URL, process.env.ALLOWED_ORIGINS);
        if (origin && !trusted) {
          log.warn('api.csrf.blocked', { origin, path, method: options.method, requestId });
          throw new AppError('Origin not allowed', { statusCode: 403, code: 'CSRF' });
        }
        if (!origin && process.env.NODE_ENV === 'production' && !req.headers.get('x-admin-key')) {
          throw new AppError('Origin required', { statusCode: 403, code: 'CSRF' });
        }
      }

      // ── 4) Rate limit ────────────────────────────────────
      if (tier) {
        const scopedTier: RateLimitConfig = tier.keyFn
          ? tier
          : { ...tier, keyFn: (request) => `${getClientIp(request)}:${request.nextUrl.pathname}` };
        const limited = rateLimit(scopedTier, req);
        if (limited) return limited;
      }

      // ── 5) Auth ──────────────────────────────────────────
      let user: AuthedUser | null = null;
      if (options.auth !== 'public') {
        const result = await getApiUserFromRequest(req);
        if (!result) {
          if (options.auth === 'required') {
            throw new AppError('Authentication required', { statusCode: 401, code: 'UNAUTHENTICATED' });
          }
          // 'optional' → user stays null
        } else {
          user = result.user;
          if (!user.isActive) {
            throw new AppError('Account is disabled', { statusCode: 403, code: 'ACCOUNT_DISABLED' });
          }
        }
      }

      // ── 6) Role check ────────────────────────────────────
      if (options.roles && options.roles.length > 0 && user) {
        // Match if: (1) user role is explicitly in the list, OR
        //           (2) hierarchy check passes (super_admin > admin > manager)
        const role = user.role as Role;
        const explicitlyAllowed = options.roles.includes(role);
        const hierarchyOk = roleSatisfies(role, options.roles);
        if (!explicitlyAllowed && !hierarchyOk) {
          log.warn('api.authz.denied', { required: options.roles, actual: user.role, requestId });
          throw new AppError('Insufficient permissions', { statusCode: 403, code: 'FORBIDDEN' });
        }
      }

      // ── 7) Custom auth ──────────────────────────────────
      if (options.customAuth && user) {
        const allowed = await options.customAuth(user, req);
        if (!allowed) {
          throw new AppError('Access denied', { statusCode: 403, code: 'FORBIDDEN' });
        }
      }

      // ── 8) Body parsing + validation ────────────────────
      let body: TBody = undefined as TBody;
      if (isStateChanging(options.method)) {
        // Only parse JSON for application/json content type.
        // multipart/form-data and other types should be parsed by the handler
        // using parseUploadedFile() / req.formData().
        const contentType = req.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const raw = await req.json().catch(() => ({}));
          if (options.bodySchema) {
            const r = options.bodySchema.safeParse(raw);
            if (!r.success) {
              const first = r.error.issues[0];
              throw new ValidationError(
                first ? `${first.path.join('.') || 'field'}: ${first.message}` : 'Invalid request body',
              );
            }
            body = r.data as TBody;
          } else {
            body = raw as TBody;
          }
        } else if (options.bodySchema) {
          // Form data + body schema is unsupported (would need JSON.parse(formData))
          throw new ValidationError(
            'bodySchema is not supported for non-JSON content types; use parseUploadedFile() for form data',
          );
        }
      }

      // ── 9) Query parsing ────────────────────────────────
      const query = parseQuery(req) as TQuery;

      // ── 10) Params from dynamic route ──────────────────
      const params = routeCtx?.params ? await routeCtx.params : ({} as TParams);

      // ── 11) Execute handler ─────────────────────────────
      const ctx: ApiRequestContext<TBody, TQuery> = {
        req,
        user,
        body,
        query,
        params: params as Record<string, string>,
        requestId,
        startTime,
        ip,
        userAgent,
        origin,
        method: options.method,
        path,
      };
      const response = await options.handler(ctx as ApiRequestContext<TBody, TQuery> & { params: TParams });

      // ── 12) Audit log (optional) ────────────────────────
      if (options.auditEvent && user) {
        log.info(`audit.${options.auditEvent}`, { userId: user.id, requestId, path, method: options.method });
      }

      // ── 13) Add response headers ───────────────────────
      const elapsed = Date.now() - startTime;
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('X-Response-Time', `${elapsed}ms`);
      if (options.cacheControl) {
        response.headers.set('Cache-Control', options.cacheControl);
      }

      // ── 14) Log completion ─────────────────────────────
      log.debug('api.complete', {
        path,
        method: options.method,
        status: response.status,
        durationMs: elapsed,
        userId: user?.id,
        requestId,
      });

      return response;
    });
    return finish(finalResponse);
  };
}

// ── Convenience: list of methods allowed ───────────────────
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

// ── Method-only handler (for OPTIONS / CORS preflight) ─────
export function methodNotAllowed(allowed: string): NextResponse {
  return new NextResponse(
    JSON.stringify({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', statusCode: 405 },
    }),
    { status: 405, headers: { Allow: allowed, 'Content-Type': 'application/json' } },
  );
}
