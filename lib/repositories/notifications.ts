/**
 * Notification Repository
 * ───────────────────────
 * Centralized data access for the `notifications` table.
 * Used by services and admin/operation scripts.
 *
 * Why a repository?
 *  - Single source of truth for queries
 *  - Easier to mock for tests
 *  - Easier to swap to a different storage backend
 */

import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationInsert {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

/**
 * Insert a notification. Best-effort: errors are logged but not thrown
 * (notifications are not user-blocking).
 */
export async function insertNotification(input: NotificationInsert): Promise<string | null> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('notifications')
      .insert({
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ?? {},
        read_at: null,
      })
      .select('id')
      .single();

    if (error) {
      logger.warn('Notification insert failed', { userId: input.userId, error: error.message });
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    logger.warn('Notification insert threw', {
      userId: input.userId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * List recent notifications for a user, newest first.
 */
export async function listForUser(
  userId: string,
  limit = 20
): Promise<NotificationRow[]> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('notifications')
      .select('id, user_id, type, title, body, data, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn('List notifications failed', { userId, error: error.message });
      return [];
    }
    return (data ?? []) as NotificationRow[];
  } catch {
    return [];
  }
}

/**
 * Mark a notification as read.
 */
export async function markRead(id: string, userId: string): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Mark all of a user's notifications as read.
 */
export async function markAllRead(userId: string): Promise<number> {
  try {
    const svc = createServiceClient();
    const { count, error } = await svc
      .from('notifications')
      .update({ read_at: new Date().toISOString() }, { count: 'exact' })
      .eq('user_id', userId)
      .is('read_at', null);
    return count ?? 0;
  } catch {
    return 0;
  }
}
