/**
 * API Layer: Pagination Helper
 * ─────────────────────────────
 * Canonical pagination for list endpoints.
 *
 * Usage:
 *   export const GET = apiRoute({
 *     method: 'GET',
 *     auth: 'required',
 *     handler: async ({ query }) => {
 *       const { page, limit } = parsePagination(query);
 *       const { items, total } = await orderRepo.list({ page, limit });
 *       return ok(items, { pagination: buildPaginationMeta(total, page, limit) });
 *     },
 *   });
 */

import { buildPaginatedMeta, type PaginationMeta } from './dto';

// ── Pagination defaults ─────────────────────────────────────
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MIN_LIMIT = 1;

export interface ParsedPagination {
  page: number;
  limit: number;
  offset: number;
}

export class InvalidPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaginationError';
  }
}

/**
 * Parse pagination params from a query object.
 * - page: 1-indexed (default: 1)
 * - limit: page size (default: 20, max: 100)
 *
 * Throws InvalidPaginationError on invalid input.
 */
export function parsePagination(query: Record<string, string | string[] | undefined>): ParsedPagination {
  const pageStr = String(query.page ?? DEFAULT_PAGE);
  const limitStr = String(query.limit ?? DEFAULT_LIMIT);

  const page = parseInt(pageStr, 10);
  const limit = parseInt(limitStr, 10);

  if (!Number.isFinite(page) || page < 1) {
    throw new InvalidPaginationError(`Invalid page: ${pageStr}`);
  }
  if (!Number.isFinite(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
    throw new InvalidPaginationError(
      `Invalid limit: ${limitStr} (must be ${MIN_LIMIT}-${MAX_LIMIT})`,
    );
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function parsePaginationSafe(
  query: Record<string, string | string[] | undefined>,
): ParsedPagination {
  try {
    return parsePagination(query);
  } catch {
    return {
      page: DEFAULT_PAGE,
      limit: DEFAULT_LIMIT,
      offset: 0,
    };
  }
}

// ── Range pagination (for Supabase range) ────────────────────
export interface ParsedRange {
  from: number;
  to: number;
  limit: number;
}

export function parseRange(query: Record<string, string | string[] | undefined>): ParsedRange {
  const pagination = parsePagination(query);
  return {
    from: pagination.offset,
    to: pagination.offset + pagination.limit - 1,
    limit: pagination.limit,
  };
}

// ── Cursor pagination (for large datasets) ───────────────────
export interface CursorPagination {
  cursor?: string;
  limit: number;
}

export function parseCursor(
  query: Record<string, string | string[] | undefined>,
): CursorPagination {
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(MIN_LIMIT, parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  return { cursor, limit };
}

// ── Cursor encoding (base64 of JSON) ─────────────────────────
export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor<T = Record<string, unknown>>(cursor: string): T | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

// ── Re-export ────────────────────────────────────────────────
export { buildPaginatedMeta, type PaginationMeta };
