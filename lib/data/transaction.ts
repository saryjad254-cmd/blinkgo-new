/**
 * Data Layer: Transaction Helpers
 * ─────────────────────────────
 * Postgres transactions require Supabase RPC functions. Use these
 * helpers to wrap multi-step operations atomically.
 *
 * Pattern:
 *   const { data, error } = await transaction(svc, [
 *     { sql: 'UPDATE orders SET status = $1 WHERE id = $2', args: ['paid', orderId] },
 *     { sql: 'INSERT INTO order_events ...', args: [...] },
 *   ]);
 *
 * NOTE: Supabase JS doesn't expose a public transaction API. The canonical
 * pattern is to define an RPC function in a migration, then call it.
 * Use `rpc()` for atomic operations.
 */

import { dbCall } from './retry';
import { mapDbError } from './errors';
import { log } from '@/lib/foundation';
import type { SupabaseService } from './clients';

export interface RpcCall {
  fn: string;
  args?: Record<string, unknown>;
}

export interface RpcResult<T> {
  data: T | null;
  error: unknown;
}

/**
 * Call a stored procedure / RPC function.
 * Throws AppError on failure.
 */
export async function rpc<T = unknown>(
  svc: SupabaseService,
  call: RpcCall,
  options: { label?: string } = {},
): Promise<T> {
  const { fn, args = {} } = call;
  try {
    const result = await dbCall(
      async () => await (svc.rpc as any)(fn, args),
      { label: options.label ?? `rpc.${fn}` },
    );
    if (result.error) {
      throw mapDbError(result.error, { rpc: fn });
    }
    return result.data as T;
  } catch (e) {
    log.error(`rpc.${fn}.failed`, { args, error: e instanceof Error ? e.message : String(e) });
    throw mapDbError(e, { rpc: fn });
  }
}

/**
 * Execute a raw SQL function.
 * SECURITY: Use with extreme caution. Always parameterize inputs.
 */
export async function execSql<T = unknown>(
  svc: SupabaseService,
  fn: string,
  args: Record<string, unknown> = {},
  options: { label?: string } = {},
): Promise<T> {
  return rpc<T>(svc, { fn, args }, options);
}
