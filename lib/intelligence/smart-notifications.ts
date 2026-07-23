/**
 * Smart Notifications
 * ───────────────────
 * Decides WHICH notifications to send and WHEN.
 * 
 * Principles:
 * - Deduplicate (don't notify the same person twice for the same event)
 * - Coalesce (group similar events into one summary)
 * - Quiet hours (no low-priority notifications at night)
 * - Throttle (limit notifications per user per hour)
 * - Priority (only critical at quiet hours)
 */

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export type NotificationType =
  | 'new_order'
  | 'order_ready'
  | 'driver_assigned'
  | 'driver_near'
  | 'order_delayed'
  | 'order_cancelled'
  | 'payment_failed'
  | 'review_received'
  | 'system_alert'
  | 'tip_received'
  | 'peak_forecast';

export interface NotificationCandidate {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp: Date;
  /** Optional explicit priority override. */
  priority?: NotificationPriority;
}

export interface NotificationDecision {
  shouldSend: boolean;
  reason: string;
  priority: NotificationPriority;
  /** Delay before sending in ms (0 = immediate). */
  delayMs: number;
}

interface NotificationState {
  userId: string;
  recentNotifications: Array<{ type: NotificationType; timestamp: number; key?: string }>;
  quietHours?: { start: number; end: number };
  /** Max notifications per hour (default 20). */
  maxPerHour?: number;
  /** Dedupe window in ms (default 60_000). */
  dedupeWindowMs?: number;
}

const DEFAULT_DEDUPE_MS = 60_000;
const DEFAULT_MAX_PER_HOUR = 20;

const TYPE_BASE_PRIORITY: Record<NotificationType, NotificationPriority> = {
  new_order: 'high',
  order_ready: 'high',
  driver_assigned: 'normal',
  driver_near: 'normal',
  order_delayed: 'high',
  order_cancelled: 'high',
  payment_failed: 'critical',
  review_received: 'low',
  system_alert: 'critical',
  tip_received: 'low',
  peak_forecast: 'low',
};

function getQuietHours(time: Date, range: { start: number; end: number } | undefined): boolean {
  if (!range) return false;
  const h = time.getHours();
  if (range.start < range.end) {
    return h >= range.start && h < range.end;
  }
  return h >= range.start || h < range.end;
}

export function decideNotification(
  candidate: NotificationCandidate,
  state: NotificationState
): NotificationDecision {
  const now = candidate.timestamp;
  const basePriority = candidate.priority ?? TYPE_BASE_PRIORITY[candidate.type];
  const dedupeMs = state.dedupeWindowMs ?? DEFAULT_DEDUPE_MS;
  const maxPerHour = state.maxPerHour ?? DEFAULT_MAX_PER_HOUR;

  // 1. Quiet hours check
  if (getQuietHours(now, state.quietHours) && basePriority !== 'critical') {
    // Defer to end of quiet hours
    const delayMs = state.quietHours ? 8 * 60 * 60 * 1000 : 0;
    return {
      shouldSend: basePriority === 'high',
      reason: 'Quiet hours',
      priority: basePriority,
      delayMs: basePriority === 'high' ? delayMs : 0,
    };
  }

  // 2. Deduplication
  const dedupeKey = candidate.data?.dedupeKey as string | undefined;
  const recentSimilar = state.recentNotifications.find(
    (n) =>
      n.type === candidate.type &&
      now.getTime() - n.timestamp < dedupeMs &&
      (n.key === dedupeKey || !dedupeKey)
  );
  if (recentSimilar) {
    return {
      shouldSend: false,
      reason: 'Duplicate within dedupe window',
      priority: basePriority,
      delayMs: 0,
    };
  }

  // 3. Throttle
  const oneHourAgo = now.getTime() - 60 * 60 * 1000;
  const recentCount = state.recentNotifications.filter((n) => n.timestamp > oneHourAgo).length;
  if (recentCount >= maxPerHour && basePriority !== 'critical') {
    return {
      shouldSend: basePriority === 'high',
      reason: 'Hourly limit reached',
      priority: basePriority,
      delayMs: 5 * 60 * 1000, // retry in 5min
    };
  }

  // 4. Critical always sends
  if (basePriority === 'critical') {
    return { shouldSend: true, reason: 'Critical alert', priority: 'critical', delayMs: 0 };
  }

  // 5. Low priority: only during daytime
  if (basePriority === 'low') {
    const hour = now.getHours();
    if (hour < 9 || hour >= 22) {
      return {
        shouldSend: false,
        reason: 'Low priority outside daytime',
        priority: 'low',
        delayMs: (9 - hour) * 60 * 60 * 1000,
      };
    }
  }

  return { shouldSend: true, reason: 'OK', priority: basePriority, delayMs: 0 };
}

/**
 * Coalesce multiple notifications into one summary.
 */
export function coalesceNotifications(
  notifications: NotificationCandidate[]
): NotificationCandidate {
  if (notifications.length === 0) throw new Error('No notifications to coalesce');
  if (notifications.length === 1) return notifications[0];
  const first = notifications[0];
  return {
    ...first,
    title: `${notifications.length} updates`,
    body: notifications.map((n) => `• ${n.title}`).join('\n'),
    priority: 'high',
  };
}
