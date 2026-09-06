/**
 * API Layer: DTOs (Data Transfer Objects)
 * ─────────────────────────────────────────
 * Canonical request/response types for every API route.
 *
 * Every endpoint returns an `ApiResponse<T>` (defined in Foundation/types).
 * All errors use the canonical error envelope.
 *
 * Pagination envelope:
 *   { ok: true, data: T[], meta: { page, limit, total, totalPages } }
 *
 * Single-item envelope:
 *   { ok: true, data: T }
 *
 * Error envelope:
 *   { ok: false, error: { code, message, statusCode, details? } }
 */

import type { ApiSuccess, ApiFailure } from '@/lib/foundation/types';

// ── Pagination ──────────────────────────────────────────────
export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

export interface PaginatedData<T> {
  readonly items: ReadonlyArray<T>;
  readonly pagination: PaginationMeta;
}

export function buildPaginatedMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// ── Request types ──────────────────────────────────────────
export interface ParsedQuery {
  readonly [key: string]: string | string[] | undefined;
}

export interface ParsedParams {
  readonly [key: string]: string;
}

export interface RequestMeta {
  readonly requestId: string;
  readonly ip: string;
  readonly userAgent: string;
  readonly origin: string;
  readonly method: string;
  readonly path: string;
}

// ── Standard responses ──────────────────────────────────────
export type ApiOk<T> = ApiSuccess<T>;
export type ApiErr = ApiFailure;
export type ApiEnvelope<T> = ApiOk<T> | ApiErr;
