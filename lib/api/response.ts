/**
 * Standardized API Response Helpers
 * ─────────────────────────────────
 * Every API route in BlinkGo returns responses in one of these shapes:
 *
 *   { ok: true,  data, meta? }
 *   { ok: false, error: { code, message, ... } }
 *
 * Use these helpers instead of NextResponse.json() so the shape is
 * consistent and the status code is correct.
 */

import { NextResponse } from 'next/server';
import { AppError, toAppError, RateLimitError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    meta?: Record<string, unknown>;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure;

/**
 * 200 OK with payload
 */
export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data, meta }, init);
}

/**
 * 201 Created with payload
 */
export function created<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, { ...init, status: 201 });
}

/**
 * 204 No Content
 */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Map an error to a public-safe error message.
 * SECURITY: never leak database errors, stack traces, or internal details.
 */
function safeErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    return err.message; // AppError messages are curated as user-safe
  }
  if (err instanceof Error) {
    // Map known library error categories to safe messages
    const msg = err.message || '';
    if (/duplicate key|unique constraint/i.test(msg)) return 'Resource already exists';
    if (/foreign key|violates foreign key/i.test(msg)) return 'Referenced resource not found';
    if (/permission denied|insufficient_privilege/i.test(msg)) return 'Operation not permitted';
    if (/connection|timeout|ECONNREFUSED/i.test(msg)) return 'Service temporarily unavailable';
    if (/column .* does not exist|relation .* does not exist/i.test(msg)) {
      return 'Invalid request';
    }
    return 'An unexpected error occurred';
  }
  return 'An unexpected error occurred';
}

/**
 * Standard error response. Automatically maps AppError -> correct status code.
 * SECURITY: never leak raw error messages; log the original server-side.
 */
export function fail(err: unknown): NextResponse<ApiFailure> {
  const e = toAppError(err);
  const isOperational = err instanceof AppError && e.isOperational;
  if (!isOperational) {
    // Log unexpected errors with full stack — but don't leak to client
    logger.error('Unhandled API error', { code: e.code, raw: (err as any)?.message }, err as any);
  }
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: {
        code: e.code,
        message: isOperational ? e.message : safeErrorMessage(err),
        statusCode: e.statusCode,
        meta: isOperational ? e.meta : undefined,
      },
    },
    { status: e.statusCode },
  );
}

/**
 * Wrap a route handler so any thrown error is mapped to a fail() response.
 * Replaces the try/catch boilerplate at the start of every route.
 *
 * Accepts any NextResponse as the success type — success returns whatever
 * the handler returns (typically the result of `ok()` / `fail()` / a
 * `NextResponse.json` from a special case).
 */
export async function withErrorHandling<T extends NextResponse<unknown>>(
  handler: () => Promise<T>,
): Promise<T | NextResponse<ApiFailure>> {
  try {
    return await handler();
  } catch (e) {
    return fail(e);
  }
}

/**
 * Rate limit helper — emits a 429 with the same shape.
 */
export function rateLimited(retryAfterSec: number): NextResponse<ApiFailure> {
  const e = new RateLimitError(retryAfterSec);
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: {
        code: e.code,
        message: e.message,
        statusCode: e.statusCode,
        meta: e.meta,
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
