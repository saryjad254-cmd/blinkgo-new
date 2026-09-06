/**
 * Data Layer: Barrel Export
 * ───────────────────────
 * Single import for the data layer.
 *
 *   import { createServiceClient, dbCall, QueryBuilder, mapDbError } from '@/lib/data';
 *
 * Repositories:
 *   import { users, orders, restaurants, products, notifications, drivers, payments } from '@/lib/data';
 */

// Use explicit exports (not `export *`) to ensure clean type and runtime behavior.
export {
  createBrowserClient,
  createServerClient,
  createServiceClient,
  type SupabaseBrowser,
  type SupabaseServer,
  type SupabaseService,
  type SupabaseClient,
} from './clients';

export { mapDbError, isDbError, type DbError } from './errors';
export { dbCall, withRetry, type RetryOptions } from './retry';
export {
  QueryBuilder,
  normalizePagination,
  buildPaginatedResult,
  parseSort,
  SOFT_DELETE_COLUMN,
  excludeDeleted,
  type Pagination,
  type PaginatedResult,
  type SortDirection,
  type SortSpec,
  type FilterMap,
  type SupabaseResult,
  type QueryBuilderOptions,
} from './query';
export { rpc, execSql, type RpcCall, type RpcResult } from './transaction';
