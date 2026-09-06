/**
 * Foundation: API Response Helpers
 * ───────────────────────────────
 * Standardized HTTP response building. Every API route should use these
 * helpers — never construct NextResponse directly.
 *
 * Usage:
 *   return ok({ user });
 *   return ok({ order }, { cacheControl: 'private, max-age=30' });
 *   return fail(new NotFoundError('Order'));
 */

import { NextResponse } from 'next/server';
import { log } from './logger';
import { toAppError, isAppError, errorStatusCode } from './errors';
import type { ApiResponse, ApiSuccess, ApiFailure } from './types';
import { randomUUID } from 'node:crypto';

// ── Success ─────────────────────────────────────────────────────
// Legacy signature: ok<T>(data, meta?, init?)
// New signature: ok<T>(data, init?)
// We accept both for compat: 2nd arg is meta if it's an object without
// status/headers, otherwise it's init.
export function ok<T>(data: T, metaOrInit?: Record<string, unknown> | ResponseInit, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  let actualInit: ResponseInit | undefined = init;
  let meta: Record<string, unknown> | undefined;
  if (metaOrInit) {
    // If it looks like ResponseInit (has status, headers, or statusText), treat as init
    if (typeof metaOrInit === 'object' && ('status' in metaOrInit || 'headers' in metaOrInit || 'statusText' in metaOrInit)) {
      actualInit = metaOrInit as ResponseInit;
    } else {
      meta = metaOrInit as Record<string, unknown>;
    }
  }
  const res = NextResponse.json<ApiSuccess<T>>(
    { ok: true, data, meta, requestId: getRequestId() },
    actualInit,
  );
  res.headers.set('X-Request-Id', getRequestId());
  return res;
}

export function created<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return ok(data, { ...init, status: 201 });
}

export function noContent(init?: ResponseInit): NextResponse {
  return new NextResponse(null, { status: 204, ...init });
}

// ── Failure ────────────────────────────────────────────────────
export function fail(error: unknown): NextResponse<ApiFailure> {
  const appError = toAppError(error);
  const status = errorStatusCode(appError);
  const body: ApiFailure = {
    ok: false,
    error: {
      code: appError.code,
      message: appError.safeMessage,
      statusCode: status,
      details: appError.meta,
    },
    requestId: getRequestId(),
  };
  // Log internal errors (5xx) with full detail; client errors silently
  if (status >= 500) {
    log.error('api.unhandled_error', {
      code: appError.code,
      message: appError.message,
      statusCode: status,
      stack: appError.cause instanceof Error ? appError.cause.stack : undefined,
    });
  } else if (status >= 400) {
    log.debug('api.client_error', { code: appError.code, status });
  }
  const res = NextResponse.json<ApiFailure>(body, { status });
  res.headers.set('X-Request-Id', getRequestId());
  return res;
}

// ── Error-handling wrapper ─────────────────────────────────────
// Generic over the return type. The handler's success type is preserved;
// the wrapper widens to also allow ApiFailure if the handler throws.
export async function withErrorHandling<T extends NextResponse<unknown>>(
  handler: () => Promise<T>,
): Promise<T | NextResponse<ApiFailure>> {
  try {
    return await handler();
  } catch (e) {
    return fail(e) as unknown as T | NextResponse<ApiFailure>;
  }
}

// ── Request ID ─────────────────────────────────────────────────
let currentRequestId: string | null = null;

export function setRequestId(id: string): void {
  currentRequestId = id;
}

export function getRequestId(): string {
  return currentRequestId ?? (currentRequestId = randomUUID());
}

export function newRequestId(): string {
  return randomUUID();
}
