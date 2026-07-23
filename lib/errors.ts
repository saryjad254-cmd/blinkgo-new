/**
 * Custom Error Classes
 * ───────────────────
 * Centralized error types for the entire application.
 * Use these in services and catch them in API routes / pages to map
 * them to proper HTTP responses via lib/api/response.ts.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly meta?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      isOperational?: boolean;
      meta?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.isOperational = options.isOperational ?? true;
    this.meta = options.meta;
    if (options.cause) {
      this.cause = options.cause;
    }
    // Capture stack trace (V8)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      meta: this.meta,
    };
  }
}

// ───────────────────────────────────────────────────────────
// 4xx Client Errors
// ───────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', meta?: Record<string, unknown>) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', meta });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, { statusCode: 401, code: 'UNAUTHENTICATED' });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', meta?: Record<string, unknown>) {
    super(message, { statusCode: 409, code: 'CONFLICT', meta });
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super('Too many requests', {
      statusCode: 429,
      code: 'RATE_LIMITED',
      meta: { retryAfter },
    });
  }
}

// ───────────────────────────────────────────────────────────
// 5xx Server Errors
// ───────────────────────────────────────────────────────────

export class ExternalServiceError extends AppError {
  constructor(service: string, cause?: unknown) {
    super(`External service error: ${service}`, {
      statusCode: 502,
      code: 'EXTERNAL_SERVICE_ERROR',
      meta: { service },
      cause,
    });
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', cause?: unknown) {
    super(message, { statusCode: 500, code: 'DATABASE_ERROR', cause });
  }
}

/**
 * Convert any thrown value into an AppError.
 * If it's already an AppError, returns it; otherwise wraps it.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    // Next.js NEXT_REDIRECT sentinel thrown by redirect() from next/navigation
    // When an API route accidentally calls redirect(), map it to a 401.
    const msg = err.message || '';
    if (msg === 'NEXT_REDIRECT' || msg === 'NEXT_NOT_FOUND') {
      // Pages redirect to /login?error=unauthorized for role mismatches.
      // We can't easily tell apart "not signed in" vs "wrong role" from the
      // sentinel alone, so default to 401; specific API routes can
      // return a more precise status before reaching here.
      return new AppError('Authentication required', { statusCode: 401, code: 'UNAUTHORIZED', cause: err });
    }
    return new AppError(err.message, { statusCode: 500, code: 'INTERNAL_ERROR', cause: err });
  }
  return new AppError(String(err), { statusCode: 500, code: 'INTERNAL_ERROR' });
}
