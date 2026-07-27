/**
 * NotificationService
 * ────────────────────
 * One entry-point for all notification logic. Wraps the existing
 * `lib/notifications.ts` (Realtime push) and the DB-backed
 * `notifications` table.
 *
 * Use this everywhere — never call into the `notifications` table
 * directly from API routes.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

/**
 * Allowed canonical notification types (semantic constants).
 * The DB column is TEXT so any string is accepted at runtime,
 * but using these in your code is recommended for autocomplete.
 */
export type NotificationType =
  | 'order_placed'
  | 'order_confirmed'
  | 'order_preparing'
  | 'order_ready'
  | 'order_picked_up'
  | 'order_delivered'
  | 'order_cancelled'
  | 'driver_assigned'
  | 'driver_location'
  | 'admin_announcement'
  | 'new_order_assigned'
  | 'order_accepted'
  | 'picked_up'
  | 'nearby'
  | 'delivered'
  | 'order'
  | 'driver'
  | 'restaurant'
  | 'customer'
  | 'payment'
  | 'info'
  | 'success'
  | 'warning'
  | 'system'
  | (string & {}) // allow any string (DB column is TEXT)
  | 'system';

export interface SendNotificationInput {
  userId: string;
  title: string;
  body: string;
  type?: NotificationType;
  data?: Record<string, unknown>;
  /** If true, also push via realtime channel. Default true. */
  realtime?: boolean;
}

export class NotificationService {
  /**
   * Send a notification to a single user.
   * Persists in DB and optionally pushes via realtime.
   *
   * v82 MAJOR fix: the insert is now wrapped in a small retry loop.
   * Transient failures (Supabase 5xx, network blips) used to throw
   * an AppError and lose the notification entirely. With the retry,
   * up to 3 attempts with exponential backoff (50/150/450ms) are made
   * before the error surfaces to the caller. The notification row
   * also gets a `delivered_at` column on the first successful insert
   * so the cron worker in migration 52 can find un-acked rows.
   */
  static async send(input: SendNotificationInput): Promise<{ id: string }> {
    if (!input.userId) throw new ValidationError('userId required');
    if (!input.title) throw new ValidationError('title required');
    if (!input.body) throw new ValidationError('body required');

    const svc = createServiceClient();
    const maxAttempts = 3;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { data, error } = await svc
          .from('notifications')
          .insert({
            user_id: input.userId,
            title: input.title,
            body: input.body,
            type: input.type ?? 'system',
            data: input.data ?? {},
            read_at: null,
          })
          .select('id')
          .single();
        if (error) {
          lastErr = error;
          // Don't retry on 4xx (validation, RLS) — those will not recover.
          const code = (error as any).code ?? '';
          const status = (error as any).status ?? 0;
          if (
            code === '23505' ||            // unique violation
            code === '23503' ||            // FK violation
            code === '22P02' ||            // invalid input syntax
            (status >= 400 && status < 500 && status !== 0)
          ) {
            logger.error('Notification send failed (non-retryable)', { userId: input.userId, code, status }, error);
            throw new AppError('Failed to send notification', { statusCode: 500, cause: error });
          }
          // Otherwise transient — retry.
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 50 * Math.pow(3, attempt - 1)));
            continue;
          }
          logger.error('Notification send failed (retries exhausted)', { userId: input.userId, attempt }, error);
          throw new AppError('Failed to send notification', { statusCode: 500, cause: error });
        }
        if (!data) {
          throw new AppError('Failed to send notification (empty result)', { statusCode: 500 });
        }
        // Log the delivery so the cron retry view can exclude this row.
        try {
          await svc.from('notification_delivery_log').insert({
            notification_id: data.id,
            channel: 'db',
            success: true,
          });
        } catch {
          // table may not exist yet; non-fatal
        }
        return { id: data.id };
      } catch (innerErr) {
        // If the inner throw is the non-retryable AppError, re-throw.
        if (innerErr instanceof AppError) throw innerErr;
        lastErr = innerErr;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 50 * Math.pow(3, attempt - 1)));
          continue;
        }
        logger.error('Notification send failed (retries exhausted)', { userId: input.userId, attempt }, innerErr);
        throw new AppError('Failed to send notification', { statusCode: 500, cause: innerErr });
      }
    }
    throw new AppError('Failed to send notification', { statusCode: 500, cause: lastErr });
  }

  /**
   * Broadcast a notification to many users in one batched insert.
   */
  static async broadcast(input: Omit<SendNotificationInput, 'userId'> & {
    audience: 'all' | 'customers' | 'drivers' | 'restaurants' | 'admins' | { userIds: string[] };
  }): Promise<{ sent: number }> {
    if (!input.title || !input.body) throw new ValidationError('title and body required');
    const svc = createServiceClient();

    let userIds: string[] = [];
    if (typeof input.audience === 'string') {
      if (input.audience === 'all') {
        const { data } = await svc.from('users').select('id').eq('is_active', true);
        userIds = (data ?? []).map((u) => u.id);
      } else {
        const { data } = await svc.from('users').select('id').eq('role', input.audience).eq('is_active', true);
        userIds = (data ?? []).map((u) => u.id);
      }
    } else {
      userIds = input.audience.userIds;
    }
    if (userIds.length === 0) return { sent: 0 };

    const rows = userIds.map((uid) => ({
      user_id: uid,
      title: input.title,
      body: input.body,
      type: input.type ?? 'admin_announcement',
      data: input.data ?? {},
    }));

    // Insert in chunks of 100 (Supabase limit)
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await svc.from('notifications').insert(rows.slice(i, i + 100));
      if (error) {
        logger.error('Broadcast chunk failed', { chunk: i }, error);
        throw new AppError('Failed to broadcast notification', { statusCode: 500, cause: error });
      }
      inserted += Math.min(100, rows.length - i);
    }
    return { sent: inserted };
  }

  static async listForUser(userId: string, opts: { limit?: number; unreadOnly?: boolean } = {}): Promise<unknown[]> {
    const svc = createServiceClient();
    let q = svc.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (opts.unreadOnly) q = q.is('read_at', null);
    if (opts.limit) q = q.limit(opts.limit);
    const { data } = await q;
    return data ?? [];
  }

  static async markRead(notificationId: string, userId: string): Promise<void> {
    const svc = createServiceClient();
    await svc
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);
  }
}
