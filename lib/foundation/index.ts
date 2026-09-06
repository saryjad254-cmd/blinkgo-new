/**
 * Foundation: Barrel Export
 * ────────────────────────
 * One import for the whole foundation layer:
 *   import { ok, fail, log, env, ... } from '@/lib/foundation';
 */

// Core
export * from './types';
export * from './errors';
export { ok, err, isOk, isErr, unwrap, unwrapOr, map, mapErr, andThen, orElse, fromThrowable, fromThrowableAsync, all, partition } from './result';
export type { Result } from './result';
export * from './logger';
export * from './env';
export * from './cache';
export * from './response';
export * from './format';
export * from './http';
export * from './validation';
export * from './safe-error';
export * from './error-helper';
export { z } from './zod-mini';

// Note: api-handler.ts is intentionally NOT re-exported here to avoid
// pulling in legacy rate-limit / auth-helper modules. Import it
// directly: `import { apiHandler } from '@/lib/foundation/api-handler'`.
