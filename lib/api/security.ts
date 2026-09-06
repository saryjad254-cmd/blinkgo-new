/**
 * Security Hardening — Production-Grade Defense in Depth
 * ─────────────────────────────────────────────────────
 * Centralized security helpers for every API route.
 *
 * Built on @/lib/foundation:
 *   - All errors use Foundation's AppError hierarchy
 *   - Logging uses Foundation's logger
 *   - Response building uses Foundation's fail()
 *
 * Exports:
 *  - withSecurity(opts, handler)    → wraps a route with auth + rate + role + error
 *  - withPublicSecurity(opts, h)    → public route wrapper
 *  - secureRoute(tier, roles?)      → build SecurityOptions quickly
 *  - authenticateRequest(req)       → verify JWT, return AuthedContext
 *  - verifyOwnership(...)           → IDOR prevention
 *  - types: Role, AuthedContext, HandlerContext, SecurityOptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, getClientIp, type RateLimitConfig } from '@/lib/rate-limit';
import { fail, type ApiResponse, type ApiFailure } from '@/lib/api/response';
import {
  activeConnections,
  httpErrorsTotal,
  httpRequestDurationMs,
  httpRequestsTotal,
} from '@/lib/observability/metrics';
import {
  log,
  AppError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  type Role,
} from '@/lib/foundation';

// ── Types ──
export type { Role } from '@/lib/foundation/types';

export interface AuthedContext {
  user: {
    id: string;
    email: string | null;
    role: Role;
    name: string | null;
    isActive: boolean;
    isVerified: boolean;
  };
}

export interface SecurityOptions {
  roles?: Role[];
  rateLimit?: RateLimitConfig;
  allowAdminKey?: boolean;
  customAuth?: (ctx: AuthedContext, req: NextRequest) => Promise<boolean>;
  publicAccess?: boolean;
}

export interface HandlerContext {
  req: NextRequest;
  auth: AuthedContext;
  requestId: string;
  startTime: number;
}

export interface PublicHandlerContext {
  req: NextRequest;
  auth: AuthedContext | null;
  requestId: string;
  startTime: number;
}

// ── Core helpers ──
export async function authenticateRequest(req: NextRequest): Promise<AuthedContext | null> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    let jwtPerms: string[] = [];
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (error || !user) {
      // Bearer fallback: ask Supabase Auth to verify the signature. Never
      // authorize from a locally decoded, unverified JWT payload.
      const auth = req.headers.get('authorization') || req.headers.get('Authorization');
      if (auth && auth.toLowerCase().startsWith('bearer ')) {
        const token = auth.slice(7).trim();
        if (token) {
          try {
            const { data: { user: bearerUser }, error: bearerError } = await supabase.auth.getUser(token);
            if (!bearerError && bearerUser) {
              userId = bearerUser.id;
              userEmail = bearerUser.email ?? null;
              jwtPerms = Array.isArray(bearerUser.app_metadata?.permissions) ? bearerUser.app_metadata.permissions : [];
            }
          } catch {
            // ignore
          }
        }
      }
      if (!userId) return null;
    } else {
      userId = user.id;
      userEmail = user.email ?? null;
      jwtPerms = (user.app_metadata as { permissions?: string[] } | undefined)?.permissions ?? [];
    }

    // Look up the profile (always via service client to bypass RLS)
    const service = createServiceClient();
    const { data: profile } = await service
      .from('users')
      .select('id, email, name, role, is_active, is_verified')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return null;
    if (profile.is_active === false) return null;

    return {
      user: {
        id: profile.id,
        email: profile.email ?? userEmail,
        role: profile.role as 'customer' | 'driver' | 'restaurant' | 'manager' | 'admin' | 'super_admin',
        name: profile.name,
        isActive: profile.is_active !== false,
        isVerified: profile.is_verified === true,
        permissions: jwtPerms,
      } as unknown as AuthedContext['user'] & { permissions?: string[] },
    };
  } catch (e) {
    log.warn('Authentication failed', { error: (e as Error).message });
    return null;
  }
}

export async function verifyOwnership(
  userId: string,
  role: Role,
  resourceType: 'order' | 'restaurant' | 'review' | 'coupon' | 'driver_status' | 'address',
  resourceId: string,
  resourceOwnerField: string = 'user_id'
): Promise<void> {
  if (role === 'admin' || role === 'super_admin' || role === 'manager') return;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from(resourceType)
    .select(resourceOwnerField)
    .eq('id', resourceId)
    .single();

  if (error || !data) {
    throw new NotFoundError(resourceType);
  }

  const ownerId = (data as unknown as Record<string, unknown>)[resourceOwnerField];
  if (ownerId !== userId) {
    if (resourceType === 'order' && role === 'driver' && resourceOwnerField === 'driver_id') {
      if (ownerId === userId) return;
    }
    if (resourceType === 'order' && role === 'restaurant' && resourceOwnerField === 'restaurant_id') {
      if (ownerId === userId) return;
    }
    throw new AuthorizationError('You do not have permission to access this resource');
  }
}

// ── Higher-level wrappers ──
function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function metricRoute(req: NextRequest): string {
  return req.nextUrl.pathname
    .split('/')
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
      if (/^\d{4,}$/.test(segment) || segment.length > 48) return ':id';
      return segment;
    })
    .join('/') || '/';
}

export function withSecurity<T = unknown>(
  options: SecurityOptions,
  handler: (ctx: HandlerContext, req: NextRequest) => Promise<NextResponse<ApiResponse<T>>>
) {
  return async (req: NextRequest): Promise<NextResponse<ApiResponse<T> | ApiFailure>> => {
    const startTime = Date.now();
    const requestId = req.headers.get('x-request-id') || generateRequestId();
    const route = metricRoute(req);
    const method = req.method.toUpperCase();
    const connectionLabels = { method, route };
    let responseStatus = 500;
    activeConnections.inc(connectionLabels);

    const finalize = <R extends NextResponse>(response: R): R => {
      responseStatus = response.status;
      return response;
    };

    try {
      if (options.rateLimit) {
        const limited = rateLimit(options.rateLimit, req);
        if (limited) {
          log.warn('Rate limit hit', {
            requestId,
            endpoint: options.rateLimit.name,
            ip: getClientIp(req),
          });
          return finalize(limited as NextResponse<ApiFailure>);
        }
      }

      if (options.allowAdminKey) {
        const adminKey = req.headers.get('x-admin-key');
        const expectedKey = process.env.ADMIN_SECRET_KEY || process.env.CRON_SECRET;
        if (expectedKey && adminKey === expectedKey) {
          const ctx: HandlerContext = {
            req,
            auth: { user: { id: 'system', email: null, role: 'super_admin', name: 'System', isActive: true, isVerified: true } },
            requestId,
            startTime,
          };
          const response = await handler(ctx, req);
          response.headers.set('X-Request-Id', requestId);
          response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
          return finalize(response);
        }
      }

      if (options.publicAccess) {
        const ctx: PublicHandlerContext = {
          req,
          auth: null,
          requestId,
          startTime,
        };
        const response = await (handler as (ctx: PublicHandlerContext, req: NextRequest) => Promise<NextResponse<ApiResponse<T>>>)(ctx, req);
        response.headers.set('X-Request-Id', requestId);
        response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
        return finalize(response);
      }

      const auth = await authenticateRequest(req);
      if (!auth) {
        return finalize(fail(new AuthenticationError('Authentication required')));
      }

      if (options.roles && options.roles.length > 0) {
        if (!options.roles.includes(auth.user.role)) {
          return finalize(fail(new AuthorizationError('Insufficient permissions')));
        }
      }

      if (options.customAuth) {
        const allowed = await options.customAuth(auth, req);
        if (!allowed) {
          return finalize(fail(new AuthorizationError('Access denied')));
        }
      }

      if (!auth.user.isActive) {
        return finalize(fail(new AuthorizationError('Account is disabled')));
      }

      const ctx: HandlerContext = { req, auth, requestId, startTime };
      const response = await handler(ctx, req);

      response.headers.set('X-Request-Id', requestId);
      response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

      return finalize(response);
    } catch (e) {
      const duration = Date.now() - startTime;
      const isAppErr = e instanceof AppError;

      log.error('API error', {
        requestId,
        path: new URL(req.url).pathname,
        method: req.method,
        duration_ms: duration,
        error: isAppErr ? e.message : 'unexpected',
        code: isAppErr ? e.code : 'INTERNAL',
      });

      return finalize(fail(e));
    } finally {
      const status = String(responseStatus);
      const labels = { method, route, status };
      const durationMs = Date.now() - startTime;
      httpRequestsTotal.inc(labels);
      httpRequestDurationMs.observe(durationMs, labels);
      if (responseStatus >= 500) httpErrorsTotal.inc(labels);
      activeConnections.dec(connectionLabels);
      log.info('API request completed', {
        requestId,
        method,
        route,
        status: responseStatus,
        duration_ms: durationMs,
      });
    }
  };
}

export function withPublicSecurity<T = unknown>(
  options: Omit<SecurityOptions, 'publicAccess' | 'roles' | 'customAuth' | 'allowAdminKey'>,
  handler: (ctx: PublicHandlerContext, req: NextRequest) => Promise<NextResponse<ApiResponse<T>>>
) {
  return withSecurity(
    { ...options, publicAccess: true },
    handler as unknown as (ctx: HandlerContext, req: NextRequest) => Promise<NextResponse<ApiResponse<T>>>,
  ) as unknown as (req: NextRequest) => Promise<NextResponse>;
}
