/**
 * API Middleware
 * ──────────────
 * Common middleware for all API routes.
 * 
 * Features:
 *  - Request ID generation and propagation
 *  - Request timing
 *  - CORS headers
 *  - Security headers
 *  - Audit logging
 *  - Error handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateRequestId } from '@/lib/logging/logger';
import { logger } from '@/lib/logging';

export interface ApiContext {
  requestId: string;
  startTime: number;
  ip: string;
  userAgent: string;
}

/**
 * Extract client IP from various headers
 */
export function getClientIp(req: NextRequest | Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0]?.trim() || 'unknown';
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Create request context
 */
export function createContext(req: NextRequest): ApiContext {
  return {
    requestId: generateRequestId(),
    startTime: Date.now(),
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}

/**
 * Add common response headers (X-Request-Id, X-Response-Time, etc.)
 */
export function withResponseHeaders(
  response: NextResponse,
  context: ApiContext
): NextResponse {
  const duration = Date.now() - context.startTime;
  
  response.headers.set('X-Request-Id', context.requestId);
  response.headers.set('X-Response-Time', `${duration}ms`);
  
  // Don't cache API responses by default
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  return response;
}

/**
 * Log request completion
 */
export function logRequest(
  context: ApiContext,
  method: string,
  path: string,
  status: number
): void {
  const duration = Date.now() - context.startTime;
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  
  logger[level]('API request', {
    requestId: context.requestId,
    method,
    path,
    status,
    duration_ms: duration,
    ip: context.ip,
  });
}

/**
 * Wrap an API handler with common middleware
 */
export function withApiMiddleware<T extends unknown[]>(
  handler: (req: NextRequest, context: ApiContext, ...args: T) => Promise<NextResponse>
) {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    const context = createContext(req);
    const path = new URL(req.url).pathname;
    
    try {
      const response = await handler(req, context, ...args);
      logRequest(context, req.method, path, response.status);
      return withResponseHeaders(response, context);
    } catch (error) {
      logger.error('Unhandled API error', {
        requestId: context.requestId,
        path,
        method: req.method,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      const errorResponse = NextResponse.json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
        { status: 500 }
      );
      logRequest(context, req.method, path, 500);
      return withResponseHeaders(errorResponse, context);
    }
  };
}
