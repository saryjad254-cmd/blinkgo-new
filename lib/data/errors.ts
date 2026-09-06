/**
 * Data Layer: Database Error Mapping
 * ─────────────────────────────────
 * Maps Supabase / PostgREST error codes to Foundation AppError instances.
 *
 * Supabase error codes (PostgREST):
 *  - PGRST116  → "Results contain 0 rows" (single/maybeSingle)
 *  - PGRST301  → "Range Not Satisfiable" (out of range)
 *  - 23505     → unique_violation (Postgres SQLSTATE)
 *  - 23503     → foreign_key_violation
 *  - 23514     → check_violation
 *  - 22P02     → invalid_text_representation (bad UUID/enum)
 *  - 42501     → insufficient_privilege (RLS denied)
 *
 * Use this in every repository to normalize errors to AppError.
 */

import { AppError, NotFoundError, ConflictError, ValidationError, AuthorizationError } from '@/lib/foundation';

export interface DbError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
}

export function isDbError(e: unknown): e is DbError {
  if (typeof e !== 'object' || e === null) return false;
  // Must have at least 'code' or 'status' — not just 'message' (every Error has that)
  return 'code' in e || 'status' in e;
}

/**
 * Map any error from a Supabase call to an AppError.
 * - Already an AppError → return as-is
 * - DbError (PostgREST) → map code to typed error
 * - Network/timeout → ServiceUnavailableError
 * - Unknown → wrap in InternalError
 */
export function mapDbError(e: unknown, context?: Record<string, unknown>): AppError {
  if (e instanceof AppError) return e;

  if (isDbError(e)) {
    const code = e.code ?? '';
    const message = e.message ?? 'Database error';
    const meta = { ...context, dbCode: code, dbHint: e.hint, dbDetails: e.details };

    switch (code) {
      case 'PGRST116':
        return new NotFoundError('Resource', { meta });

      case 'PGRST301':
        return new ValidationError('Range out of bounds', { meta });

      case '23505':
        return new ConflictError('Resource already exists', { meta });

      case '23503':
        return new ValidationError('Referenced resource not found', { meta });

      case '23514':
        return new ValidationError(message, { meta });

      case '22P02':
        return new ValidationError('Invalid value format', { meta });

      case '42501':
      case 'PGRST302':
        return new AuthorizationError('Database access denied', { meta });

      default:
        // Check HTTP status
        if (e.status === 404) return new NotFoundError('Resource', { meta });
        if (e.status === 401 || e.status === 403) {
          return new AuthorizationError('Access denied', { meta });
        }
        if (e.status === 409) return new ConflictError(message, { meta });
        if (e.status === 400) return new ValidationError(message, { meta });
        if (e.status && e.status >= 500) {
          return new AppError('Database error', { statusCode: 500, code: 'DB_ERROR', meta });
        }
        return new AppError(message, { statusCode: 500, code: code || 'DB_ERROR', meta });
    }
  }

  if (e instanceof Error) {
    if (/timeout|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(e.message)) {
      return new AppError('Database temporarily unavailable', {
        statusCode: 503,
        code: 'DB_UNAVAILABLE',
        cause: e,
        meta: context,
      });
    }
    return new AppError(e.message, { statusCode: 500, code: 'INTERNAL_ERROR', cause: e, meta: context });
  }

  return new AppError('Unknown database error', { statusCode: 500, code: 'INTERNAL_ERROR', meta: context });
}
