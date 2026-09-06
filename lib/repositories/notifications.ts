/**
 * Notifications Repository
 * ────────────────────────
 * Canonical data access for the `notifications` table.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { log, NotFoundError } from '@/lib/foundation';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationInsert {
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

const TABLE = 'notifications';
const COLUMNS = 'id, user_id, type, title, body, data, read_at, created_at';

export async function findById(id: string): Promise<NotificationRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'notifications.findById' },
  );
  if (error) throw error;
  return data as NotificationRow | null;
}

export async function listForUser(userId: string, opts: { unreadOnly?: boolean; pagination?: Pagination } = {}): Promise<PaginatedResult<NotificationRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<NotificationRow>(svc.from(TABLE), { label: 'notifications.listForUser' });
  q.select(COLUMNS, { count: 'exact' });
  q.eq('user_id', userId);
  if (opts.unreadOnly) q.is('read_at', null);
  q.orderBy('created_at', 'desc');

  if (opts.pagination) q.paginate(opts.pagination);
  else q.limit(20);

  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

export async function countUnread(userId: string): Promise<number> {
  const svc = createServiceClient();
  const { count, error } = await dbCall(
    () => svc.from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
    { label: 'notifications.countUnread' },
  );
  if (error) throw error;
  return count ?? 0;
}

export async function create(input: NotificationInsert): Promise<NotificationRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .insert({
          ...input,
          data: input.data ?? {},
          read_at: null,
          created_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single(),
    { label: 'notifications.create' },
  );
  if (error) {
    // Best-effort: notifications are not user-blocking
    log.warn('notifications.create.failed', { userId: input.user_id, error: error.message });
    throw error;
  }
  if (!data) throw new NotFoundError('Notification');
  return data as NotificationRow;
}

/**
 * Best-effort: returns null on failure, never throws.
 */
export async function tryCreate(input: NotificationInsert): Promise<NotificationRow | null> {
  try {
    return await create(input);
  } catch {
    return null;
  }
}

export async function markRead(id: string, userId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId),
    { label: 'notifications.markRead' },
  );
  if (error) {
    log.warn('notifications.markRead.failed', { id, error: error.message });
    return false;
  }
  return true;
}

export async function markAllRead(userId: string): Promise<number> {
  const svc = createServiceClient();
  const { count, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .update({ read_at: new Date().toISOString() }, { count: 'exact' })
        .eq('user_id', userId)
        .is('read_at', null),
    { label: 'notifications.markAllRead' },
  );
  if (error) {
    log.warn('notifications.markAllRead.failed', { userId, error: error.message });
    return 0;
  }
  return count ?? 0;
}

export async function deleteForUser(id: string, userId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { error } = await dbCall(
    () => svc.from(TABLE).delete().eq('id', id).eq('user_id', userId),
    { label: 'notifications.deleteForUser' },
  );
  return !error;
}
