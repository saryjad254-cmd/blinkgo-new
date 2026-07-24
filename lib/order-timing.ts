/**
 * Order timing helpers — canonical preparation-timer semantics.
 *
 * ROOT CAUSE THIS REPLACES
 * ------------------------
 * The kitchen board computed elapsed minutes from `order.created_at` with no
 * upper bound and no status awareness, so a stale non-terminal test order
 * rendered values such as 16694 min (11.6 days).
 *
 * SEMANTICS
 * ---------
 * The timer answers "how long has this order been in the kitchen", so it
 * measures from the moment work actually started:
 *   preparing / ready → prepared_at  (stamped on confirmed → preparing)
 *   confirmed         → accepted_at  (stamped on pending → confirmed)
 *   pending           → created_at   (correct here: it IS the wait to accept)
 * Falling back down the chain when a timestamp is missing on older rows.
 *
 * Terminal orders (delivered / cancelled) never run a timer.
 * Values are never negative. Beyond STALE_AFTER_MIN the order is reported as
 * stale so the UI can label it instead of rendering an absurd number.
 */

export const STALE_AFTER_MIN = 24 * 60; // 24h in a non-terminal state

export type TimedOrder = {
  status?: string | null;
  created_at?: string | null;
  accepted_at?: string | null;
  prepared_at?: string | null;
};

const TERMINAL = new Set(['delivered', 'cancelled']);

/** The timestamp the timer should measure from, per status. */
export function prepStartedAt(order: TimedOrder): string | null {
  if (!order) return null;
  const { status } = order;
  if (status === 'preparing' || status === 'ready') {
    return order.prepared_at ?? order.accepted_at ?? order.created_at ?? null;
  }
  if (status === 'confirmed') {
    return order.accepted_at ?? order.created_at ?? null;
  }
  return order.created_at ?? null;
}

export type ElapsedInfo = {
  minutes: number | null; // null → no timer should render
  isStale: boolean;
  isTerminal: boolean;
};

export function elapsedInfo(order: TimedOrder, now: number = Date.now()): ElapsedInfo {
  const isTerminal = TERMINAL.has(String(order?.status ?? ''));
  if (isTerminal) return { minutes: null, isStale: false, isTerminal: true };

  const startedAt = prepStartedAt(order);
  if (!startedAt) return { minutes: null, isStale: false, isTerminal: false };

  const ts = new Date(startedAt).getTime();
  if (!Number.isFinite(ts)) return { minutes: null, isStale: false, isTerminal: false };

  // Clock skew between client and server must never render a negative timer.
  const minutes = Math.max(0, Math.floor((now - ts) / 60000));
  return { minutes, isStale: minutes > STALE_AFTER_MIN, isTerminal: false };
}

/** Human-readable duration: "8 min", "1h 20m", "2d 3h". */
export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ${minutes % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
