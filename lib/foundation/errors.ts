/**
 * Foundation: Error Handling
 * ──────────────────────────
 * Strongly-typed, operational error hierarchy with HTTP status mapping.
 * All non-trivial errors should be AppError subclasses — they get
 * logged, mapped to HTTP responses, and carry safe user-facing messages.
 *
 * Usage:
 *   throw new NotFoundError('User', { userId });
 *   throw new ValidationError('Invalid email');
 *
 * Handler:
 *   return withErrorHandling(async () => { ... });
 */

import { AppErrorShape } from './types';

// ── Base class ──────────────────────────────────────────────────
export type AppErrorOptions = {
  cause?: unknown;
  meta?: Record<string, unknown>;
  code?: string;
  statusCode?: number;
  isOperational?: boolean;
} & { [key: string]: unknown };

export class AppError extends Error implements AppErrorShape {
  readonly name: string = 'AppError';
  code: string = 'INTERNAL_ERROR';
  statusCode: number = 500;
  readonly isOperational: boolean = true;
  readonly meta?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(
    message: string,
    options?: AppErrorOptions | { cause?: unknown; meta?: Record<string, unknown> },
  ) {
    super(message);
    if (options) {
      if ('code' in options && typeof options.code === 'string') this.code = options.code;
      if ('statusCode' in options && typeof options.statusCode === 'number') this.statusCode = options.statusCode;
      if ('isOperational' in options && typeof options.isOperational === 'boolean') this.isOperational = options.isOperational;
      if ('meta' in options) this.meta = options.meta;
      if ('cause' in options) this.cause = options.cause;
    }
  }

  /** Safe message returned to clients (may be different from internal message). */
  get safeMessage(): string {
    return this.message;
  }

  toJSON(): AppErrorShape {
    return {
      name: this.name,
      code: this.code,
      statusCode: this.statusCode,
      message: this.message,
      safeMessage: this.safeMessage,
      isOperational: this.isOperational,
      cause: this.cause,
      meta: this.meta,
    };
  }
}

// ── 4xx Client errors ───────────────────────────────────────────
export class ValidationError extends AppError {
  readonly name = 'ValidationError';
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
}

export class AuthenticationError extends AppError {
  readonly name = 'AuthenticationError';
  readonly code = 'UNAUTHENTICATED';
  readonly statusCode = 401;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'Authentication required', options);
  }
  get safeMessage(): string {
    return 'Authentication required';
  }
}

export class AuthorizationError extends AppError {
  readonly name = 'AuthorizationError';
  readonly code = 'FORBIDDEN';
  readonly statusCode = 403;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'Insufficient permissions', options);
  }
  get safeMessage(): string {
    return 'You do not have permission to perform this action';
  }
}

export class NotFoundError extends AppError {
  readonly name = 'NotFoundError';
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
  constructor(resource: string = 'Resource', options?: AppErrorOptions) {
    super(`${resource} not found`, options);
  }
}

export class ConflictError extends AppError {
  readonly name = 'ConflictError';
  readonly code = 'CONFLICT';
  readonly statusCode = 409;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'Resource already exists', options);
  }
}

export class GoneError extends AppError {
  readonly name = 'GoneError';
  readonly code = 'GONE';
  readonly statusCode = 410;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'Resource is no longer available', options);
  }
}

export class RateLimitError extends AppError {
  readonly name = 'RateLimitError';
  readonly code = 'RATE_LIMITED';
  readonly statusCode = 429;
  constructor(retryAfter?: number, options?: AppErrorOptions) {
    super('Too many requests', { ...options, meta: { ...options?.meta, retryAfter } });
  }
}

// ── 5xx Server errors ───────────────────────────────────────────
export class InternalError extends AppError {
  readonly name = 'InternalError';
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'An unexpected error occurred', options);
  }
  get safeMessage(): string {
    return 'An unexpected error occurred';
  }
}

export class NotImplementedError extends AppError {
  readonly name = 'NotImplementedError';
  readonly code = 'NOT_IMPLEMENTED';
  readonly statusCode = 501;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'Not implemented', options);
  }
}

export class ServiceUnavailableError extends AppError {
  readonly name = 'ServiceUnavailableError';
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'Service temporarily unavailable', options);
  }
}

export class GatewayTimeoutError extends AppError {
  readonly name = 'GatewayTimeoutError';
  readonly code = 'GATEWAY_TIMEOUT';
  readonly statusCode = 504;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'Gateway timeout', options);
  }
}

// ── Domain-specific errors ──────────────────────────────────────
export class IdempotencyError extends AppError {
  readonly name = 'IdempotencyError';
  readonly code = 'IDEMPOTENCY_CONFLICT';
  readonly statusCode = 409;
  constructor(message?: string, options?: AppErrorOptions) {
    super(message ?? 'Idempotency conflict', options);
  }
}

// RateLimitedError is an alias for RateLimitError.

export class CircuitOpenError extends AppError {
  readonly name = 'CircuitOpenError';
  readonly code = 'CIRCUIT_OPEN';
  readonly statusCode = 503;
}

export class CsrfError extends AppError {
  readonly name = 'CsrfError';
  readonly code = 'CSRF';
  readonly statusCode = 403;
}

// ── Type guards ──────────────────────────────────────────────────
export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function isOperationalError(e: unknown): boolean {
  if (isAppError(e)) return e.isOperational;
  return false;
}

// ── Convert unknown to AppError ────────────────────────────────
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e instanceof Error) {
    // Wrap unexpected errors
    return new InternalError('An unexpected error occurred', { cause: e });
  }
  return new InternalError(String(e), { cause: e });
}

// ── Error → HTTP status mapping ─────────────────────────────────
export function errorStatusCode(e: unknown): number {
  if (isAppError(e)) return e.statusCode;
  return 500;
}
