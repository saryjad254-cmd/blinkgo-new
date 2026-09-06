/**
 * Users Repository
 * ───────────────
 * Canonical data access for the `users` table.
 * Used by every service that touches user records.
 *
 * Methods:
 *  - findById / findByEmail / findByIds
 *  - list / count
 *  - create / update
 *  - setActive / setVerified
 *  - softDelete
 *
 * All methods use dbCall() for retry + error mapping.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, excludeDeleted, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { log, AppError, NotFoundError } from '@/lib/foundation';

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface UserInsert {
  id?: string;
  email: string;
  name?: string;
  role: string;
  is_active?: boolean;
  is_verified?: boolean;
  phone?: string;
  avatar_url?: string;
}

export interface UserUpdate {
  name?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
  is_verified?: boolean;
  phone?: string;
  avatar_url?: string;
  updated_at?: string;
}

const TABLE = 'users';
const COLUMNS = 'id, email, name, role, is_active, is_verified, phone, avatar_url, created_at, updated_at, deleted_at';

// ── Read ─────────────────────────────────────────────────────
export async function findById(id: string): Promise<UserRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'users.findById' },
  );
  if (error) throw error;
  return data as UserRow | null;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).ilike('email', email.toLowerCase()).maybeSingle(),
    { label: 'users.findByEmail' },
  );
  if (error) throw error;
  return data as UserRow | null;
}

export async function findByIds(ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).in('id', ids),
    { label: 'users.findByIds' },
  );
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export interface ListUsersOptions {
  role?: string | string[];
  isActive?: boolean;
  isVerified?: boolean;
  search?: string;
  pagination?: Pagination;
  includeDeleted?: boolean;
}

export async function list(opts: ListUsersOptions = {}): Promise<PaginatedResult<UserRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<UserRow>(svc.from(TABLE), { label: 'users.list' });
  q.select(COLUMNS, { count: 'exact' });

  if (opts.role) {
    if (Array.isArray(opts.role)) q.in('role', opts.role);
    else q.eq('role', opts.role);
  }
  if (opts.isActive !== undefined) q.eq('is_active', opts.isActive);
  if (opts.isVerified !== undefined) q.eq('is_verified', opts.isVerified);
  if (opts.search) q.or(`name.ilike.%${opts.search}%,email.ilike.%${opts.search}%`);

  excludeDeleted(q as any, opts.includeDeleted);
  q.orderBy('created_at', 'desc');

  if (opts.pagination) {
    q.paginate(opts.pagination);
  } else {
    q.limit(50);
  }

  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

export async function countByRole(): Promise<Record<string, number>> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select('role').is('deleted_at', null),
    { label: 'users.countByRole' },
  );
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[(row as { role: string }).role] = (counts[(row as { role: string }).role] ?? 0) + 1;
  }
  return counts;
}

// ── Write ────────────────────────────────────────────────────
export async function create(input: UserInsert): Promise<UserRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .insert({
          ...input,
          email: input.email.toLowerCase(),
          created_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single(),
    { label: 'users.create' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('User (after insert)');
  return data as UserRow;
}

export async function update(id: string, patch: UserUpdate): Promise<UserRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(COLUMNS)
        .single(),
    { label: 'users.update' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('User');
  return data as UserRow;
}

export async function setActive(id: string, isActive: boolean): Promise<UserRow> {
  return update(id, { is_active: isActive });
}

export async function setVerified(id: string, isVerified: boolean): Promise<UserRow> {
  return update(id, { is_verified: isVerified });
}

export async function setRole(id: string, role: string): Promise<UserRow> {
  return update(id, { role });
}

export async function softDelete(id: string): Promise<UserRow> {
  return update(id, { updated_at: new Date().toISOString() } as UserUpdate);
}

// Helper: hard delete (use only for GDPR right-to-erasure flows)
export async function hardDelete(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await dbCall(
    () => svc.from(TABLE).delete().eq('id', id),
    { label: 'users.hardDelete' },
  );
  if (error) throw error;
}
