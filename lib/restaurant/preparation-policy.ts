export const MIN_PREPARATION_MINUTES = 5;
export const MAX_PREPARATION_MINUTES = 90;
export const DEFAULT_PREPARATION_MINUTES = 20;

export type PreparationState = 'on_track' | 'warning' | 'late' | 'critical' | 'ready';

export interface PreparationPlan {
  estimatedPrepMinutes: number;
  estimatedReadyAt: string;
}

export interface PreparationEventLike {
  metadata?: unknown;
  created_at?: string | null;
}

export function normalizePreparationMinutes(value: unknown, fallback = DEFAULT_PREPARATION_MINUTES): number {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : Number(value);
  const safeFallback = Math.min(MAX_PREPARATION_MINUTES, Math.max(MIN_PREPARATION_MINUTES, Math.round(fallback)));
  if (!Number.isFinite(parsed)) return safeFallback;
  return Math.min(MAX_PREPARATION_MINUTES, Math.max(MIN_PREPARATION_MINUTES, Math.round(parsed)));
}

export function createPreparationPlan(startedAt: string, estimate: unknown): PreparationPlan {
  const estimatedPrepMinutes = normalizePreparationMinutes(estimate);
  const start = new Date(startedAt);
  const safeStart = Number.isFinite(start.getTime()) ? start.getTime() : Date.now();
  return {
    estimatedPrepMinutes,
    estimatedReadyAt: new Date(safeStart + estimatedPrepMinutes * 60_000).toISOString(),
  };
}

export function extractPreparationPlan(events: PreparationEventLike[] | null | undefined): PreparationPlan | null {
  for (const event of events ?? []) {
    if (!event.metadata || typeof event.metadata !== 'object') continue;
    const metadata = event.metadata as Record<string, unknown>;
    const rawMinutes = metadata.estimated_prep_minutes;
    const rawReadyAt = metadata.estimated_ready_at;
    if (rawMinutes == null || typeof rawReadyAt !== 'string') continue;
    const readyAt = new Date(rawReadyAt);
    if (!Number.isFinite(readyAt.getTime())) continue;
    return {
      estimatedPrepMinutes: normalizePreparationMinutes(rawMinutes),
      estimatedReadyAt: readyAt.toISOString(),
    };
  }
  return null;
}

export function preparationState(status: string, estimatedReadyAt: string | null | undefined, now = Date.now()): PreparationState {
  if (status === 'ready' || ['assigned', 'picked_up', 'delivering', 'delivered'].includes(status)) return 'ready';
  if (!estimatedReadyAt) return 'on_track';
  const deadline = new Date(estimatedReadyAt).getTime();
  if (!Number.isFinite(deadline)) return 'on_track';
  const differenceMinutes = (deadline - now) / 60_000;
  if (differenceMinutes < -5) return 'critical';
  if (differenceMinutes < 0) return 'late';
  if (differenceMinutes <= 5) return 'warning';
  return 'on_track';
}

export function remainingPreparationMinutes(estimatedReadyAt: string | null | undefined, now = Date.now()): number | null {
  if (!estimatedReadyAt) return null;
  const deadline = new Date(estimatedReadyAt).getTime();
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - now) / 60_000));
}
