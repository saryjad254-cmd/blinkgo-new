/**
 * API Layer: Barrel Export
 * ───────────────────────
 * Single import for the entire API layer.
 *
 *   import { apiRoute, ok, fail, withErrorHandling } from '@/lib/api/canonical';
 *
 * All canonical types are also re-exported.
 */

// Canonical types
export {
  buildPaginatedMeta,
  type PaginationMeta,
  type PaginatedData,
  type ParsedQuery,
  type ParsedParams,
  type RequestMeta,
  type ApiOk,
  type ApiErr,
  type ApiEnvelope,
} from './dto';

// Canonical handler
export {
  apiRoute,
  methodNotAllowed,
  HTTP_METHODS,
  type ApiRouteOptions,
  type ApiRequestContext,
  type AuthMode,
  type RateLimitTier,
  type CsrfMode,
  type HttpMethod,
} from './handler';

// ── Foundation HTTP response helpers ────────────────────────
export {
  ok, fail, withErrorHandling, created, noContent, newRequestId, getRequestId,
} from '@/lib/foundation/response';

// ── Foundation errors ───────────────────────────────────────
export {
  ValidationError, AuthenticationError, AuthorizationError, NotFoundError,
  ConflictError, RateLimitError, AppError, isAppError,
} from '@/lib/foundation/errors';

// ── Foundation logger ───────────────────────────────────────
export { log } from '@/lib/foundation/logger';

// ── Foundation types ────────────────────────────────────────
export type { Role, ApiSuccess, ApiFailure, ApiResponse } from '@/lib/foundation/types';

// ── Foundation zod-mini ─────────────────────────────────────
export { z } from '@/lib/foundation/zod-mini';

// ── Data layer ──────────────────────────────────────────────
export { createServerClient, createServiceClient, createBrowserClient } from '@/lib/data';

// ── Security helpers ────────────────────────────────────────
export { withSecurity, secureRoute, tier } from '@/lib/api/security-helpers';
export { withPublicSecurity } from '@/lib/api/security';
export { getApiUserWithRole, requireApiRole } from '@/lib/auth-helper';

// ── File uploads ────────────────────────────────────────────
export {
  parseUploadedFile,
  parseUploadedFiles,
  UploadedFileMetaSchema,
  IMAGE_MIME_TYPES,
  IMAGE_EXTENSIONS,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_EXTENSIONS,
  type UploadedFile,
  type UploadOptions,
} from './uploads';

// ── Idempotency ─────────────────────────────────────────────
export {
  withIdempotency,
  getIdempotencyKey,
  type IdempotentResult,
  type IdempotencyStore,
  type IdempotencyOptions,
} from './idempotency';

// ── Pagination ──────────────────────────────────────────────
export {
  parsePagination,
  parsePaginationSafe,
  parseRange,
  parseCursor,
  encodeCursor,
  decodeCursor,
  InvalidPaginationError,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_LIMIT,
  type ParsedPagination,
  type ParsedRange,
  type CursorPagination,
} from './pagination';
