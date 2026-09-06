/**
 * Durable idempotency for state-changing API routes.
 *
 * Production uses an atomic Supabase claim so concurrent requests handled by
 * different serverless instances cannot both execute. Development and unit
 * tests use the same state machine in memory unless IDEMPOTENCY_USE_DB=1.
 */

import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/foundation/response';
import { log } from '@/lib/foundation/logger';
import { AppError, ServiceUnavailableError } from '@/lib/foundation/errors';
import type { ApiResponse } from '@/lib/foundation/types';
import { createServiceClient } from '@/lib/supabase/service';

type StoredResponse = {
  status: number;
  body: ApiResponse<unknown>;
};

export interface IdempotentResult {
  readonly response: NextResponse;
  readonly cached: boolean;
  readonly key: string;
}

export type IdempotencyClaim =
  | { action: 'acquired' }
  | { action: 'cached'; response: StoredResponse }
  | { action: 'conflict' }
  | { action: 'in_progress' };

export interface IdempotencyStore {
  claim(params: {
    key: string;
    scope: string;
    fingerprint: string;
    ownerToken: string;
    ttlMs: number;
    lockMs: number;
  }): Promise<IdempotencyClaim>;
  complete(params: {
    key: string;
    scope: string;
    ownerToken: string;
    response: StoredResponse;
    ttlMs: number;
  }): Promise<boolean>;
  release(params: { key: string; scope: string; ownerToken: string }): Promise<void>;
}

type MemoryEntry = {
  fingerprint: string;
  ownerToken: string | null;
  state: 'processing' | 'completed';
  lockedUntil: number | null;
  expiresAt: number;
  response: StoredResponse | null;
};

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async claim(params: {
    key: string;
    scope: string;
    fingerprint: string;
    ownerToken: string;
    ttlMs: number;
    lockMs: number;
  }): Promise<IdempotencyClaim> {
    const cacheKey = `${params.scope}:${params.key}`;
    const now = Date.now();
    const current = this.entries.get(cacheKey);

    if (!current || current.expiresAt <= now) {
      this.entries.set(cacheKey, {
        fingerprint: params.fingerprint,
        ownerToken: params.ownerToken,
        state: 'processing',
        lockedUntil: now + params.lockMs,
        expiresAt: now + params.ttlMs,
        response: null,
      });
      return { action: 'acquired' };
    }

    if (current.fingerprint !== params.fingerprint) return { action: 'conflict' };
    if (current.state === 'completed' && current.response) {
      return { action: 'cached', response: current.response };
    }
    if (current.lockedUntil != null && current.lockedUntil > now) {
      return { action: 'in_progress' };
    }

    current.ownerToken = params.ownerToken;
    current.lockedUntil = now + params.lockMs;
    current.expiresAt = now + params.ttlMs;
    return { action: 'acquired' };
  }

  async complete(params: {
    key: string;
    scope: string;
    ownerToken: string;
    response: StoredResponse;
    ttlMs: number;
  }): Promise<boolean> {
    const entry = this.entries.get(`${params.scope}:${params.key}`);
    if (!entry || entry.state !== 'processing' || entry.ownerToken !== params.ownerToken) return false;
    entry.state = 'completed';
    entry.response = params.response;
    entry.ownerToken = null;
    entry.lockedUntil = null;
    entry.expiresAt = Date.now() + params.ttlMs;
    return true;
  }

  async release(params: { key: string; scope: string; ownerToken: string }): Promise<void> {
    const cacheKey = `${params.scope}:${params.key}`;
    const entry = this.entries.get(cacheKey);
    if (entry?.state === 'processing' && entry.ownerToken === params.ownerToken) {
      this.entries.delete(cacheKey);
    }
  }
}

type ClaimRpcRow = {
  action: 'acquired' | 'cached' | 'conflict' | 'in_progress';
  cached_status: number | null;
  cached_body: ApiResponse<unknown> | null;
};

class SupabaseIdempotencyStore implements IdempotencyStore {
  async claim(params: {
    key: string;
    scope: string;
    fingerprint: string;
    ownerToken: string;
    ttlMs: number;
    lockMs: number;
  }): Promise<IdempotencyClaim> {
    const db = createServiceClient();
    const { data, error } = await db.rpc('claim_idempotency_key', {
      p_key: params.key,
      p_scope: params.scope,
      p_request_fingerprint: params.fingerprint,
      p_owner_token: params.ownerToken,
      p_ttl_seconds: Math.ceil(params.ttlMs / 1000),
      p_lock_seconds: Math.ceil(params.lockMs / 1000),
    });
    if (error) throw new Error(`idempotency claim failed: ${error.message}`);

    const row = (Array.isArray(data) ? data[0] : data) as ClaimRpcRow | null;
    if (!row) throw new Error('idempotency claim returned no result');
    if (row.action === 'cached') {
      if (!row.cached_body) throw new Error('idempotency cache row has no response body');
      return {
        action: 'cached',
        response: { status: row.cached_status ?? 200, body: row.cached_body },
      };
    }
    return { action: row.action };
  }

  async complete(params: {
    key: string;
    scope: string;
    ownerToken: string;
    response: StoredResponse;
    ttlMs: number;
  }): Promise<boolean> {
    const db = createServiceClient();
    const { data, error } = await db.rpc('complete_idempotency_key', {
      p_key: params.key,
      p_scope: params.scope,
      p_owner_token: params.ownerToken,
      p_response_status: params.response.status,
      p_response_body: params.response.body,
      p_ttl_seconds: Math.ceil(params.ttlMs / 1000),
    });
    if (error) throw new Error(`idempotency completion failed: ${error.message}`);
    return data === true;
  }

  async release(params: { key: string; scope: string; ownerToken: string }): Promise<void> {
    const db = createServiceClient();
    const { error } = await db.rpc('release_idempotency_key', {
      p_key: params.key,
      p_scope: params.scope,
      p_owner_token: params.ownerToken,
    });
    if (error) throw new Error(`idempotency release failed: ${error.message}`);
  }
}

let defaultStore: IdempotencyStore | null = null;

function getDefaultStore(): IdempotencyStore {
  if (!defaultStore) {
    const useDatabase = process.env.NODE_ENV === 'production' || process.env.IDEMPOTENCY_USE_DB === '1';
    defaultStore = useDatabase ? new SupabaseIdempotencyStore() : new InMemoryIdempotencyStore();
  }
  return defaultStore;
}

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOCK_MS = 5 * 60 * 1000;

export function getIdempotencyKey(req: NextRequest | Request): string | null {
  const value = req.headers.get(IDEMPOTENCY_HEADER)?.trim();
  return value || null;
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function requestFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export interface IdempotencyOptions {
  store?: IdempotencyStore;
  ttlMs?: number;
  lockMs?: number;
  skipForSafeMethods?: boolean;
  /** Parsed, validated request payload. Only its SHA-256 digest is stored. */
  fingerprint?: unknown;
}

function getRequestPath(req: NextRequest | Request): string {
  if ('nextUrl' in req && req.nextUrl) return req.nextUrl.pathname;
  try {
    return new URL(req.url).pathname;
  } catch {
    return '/';
  }
}

export async function withIdempotency(
  ctx: { req: NextRequest | Request; user: { id: string } | null; method: string },
  handler: () => Promise<NextResponse>,
  options: IdempotencyOptions = {},
): Promise<NextResponse> {
  const method = ctx.method.toUpperCase();
  if ((options.skipForSafeMethods ?? true) && (method === 'GET' || method === 'HEAD')) {
    return handler();
  }

  const key = getIdempotencyKey(ctx.req);
  if (!key) return handler();
  if (key.length < 8 || key.length > 200 || /[\r\n]/.test(key)) {
    return fail(new AppError('Invalid X-Idempotency-Key', {
      statusCode: 400,
      code: 'INVALID_IDEMPOTENCY_KEY',
    }));
  }

  const userId = ctx.user?.id ?? 'anon';
  const path = getRequestPath(ctx.req);
  const scope = `${userId}:${method}:${path}`;
  const fingerprint = requestFingerprint(options.fingerprint ?? { method, path });
  const ownerToken = randomUUID();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const lockMs = options.lockMs ?? DEFAULT_LOCK_MS;
  const store = options.store ?? getDefaultStore();

  let claim: IdempotencyClaim;
  try {
    claim = await store.claim({ key, scope, fingerprint, ownerToken, ttlMs, lockMs });
  } catch (error) {
    log.error('api.idempotency.claim_failed', {
      path,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return fail(new ServiceUnavailableError('Request safety service is temporarily unavailable'));
  }

  if (claim.action === 'cached') {
    log.debug('api.idempotency.hit', { path, userId });
    const replay = NextResponse.json(claim.response.body, { status: claim.response.status });
    replay.headers.set('X-Idempotency-Replayed', 'true');
    return replay;
  }
  if (claim.action === 'conflict') {
    return fail(new AppError('This idempotency key was already used for a different request', {
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    }));
  }
  if (claim.action === 'in_progress') {
    const pending = fail(new AppError('The original request is still being processed', {
      statusCode: 409,
      code: 'IDEMPOTENCY_IN_PROGRESS',
    }));
    pending.headers.set('Retry-After', '1');
    return pending;
  }

  try {
    const response = await handler();
    if (!response.ok) {
      await store.release({ key, scope, ownerToken }).catch((error: unknown) => {
        log.warn('api.idempotency.release_failed', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      });
      return response;
    }

    let body: ApiResponse<unknown>;
    try {
      body = await response.clone().json() as ApiResponse<unknown>;
    } catch {
      await store.release({ key, scope, ownerToken });
      log.warn('api.idempotency.non_json_response', { path });
      return response;
    }

    try {
      const completed = await store.complete({
        key,
        scope,
        ownerToken,
        response: { status: response.status, body },
        ttlMs,
      });
      if (!completed) {
        log.error('api.idempotency.lost_lease', { path, userId });
      }
    } catch (error) {
      // The business operation may already be committed. Do not turn a valid
      // success into a client retry; order creation also has a deterministic
      // database identity derived from the same key.
      log.error('api.idempotency.complete_failed', {
        path,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
    return response;
  } catch (error) {
    await store.release({ key, scope, ownerToken }).catch((releaseError: unknown) => {
      log.warn('api.idempotency.release_failed', {
        error: releaseError instanceof Error ? releaseError.message : 'unknown',
      });
    });
    throw error;
  }
}
