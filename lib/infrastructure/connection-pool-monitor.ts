/**
 * Phase 7G-F — Connection Pool Monitor
 * ─────────────────────────────────────
 * Tracks per-request and per-process Supabase/Postgres connection usage.
 *
 * Supabase manages connection pooling internally (PgBouncer in transaction mode),
 * but the application still has its own per-request client overhead. This monitor
 * tracks:
 *   - active connections (per-request client in use)
 *   - idle connections (singleton service client)
 *   - waiting queries (queue length)
 *   - slow queries (>1s)
 *   - pool exhaustion events
 *
 * Production deployment notes:
 *   - In serverless (Vercel), each function instance is short-lived. Track
 *     instance-scoped metrics; aggregate at the edge.
 *   - In long-running containers, export metrics every 30s.
 *   - For real Postgres, also query `pg_stat_activity` to get ground truth.
 */

import { registry } from '@/lib/observability/metrics';
import { logger, generateRequestId } from '@/lib/foundation/logger';

// ============================================================================
// Metrics
// ============================================================================

const dbPoolActive = registry.gauge(
  'db_pool_active',
  'Active (in-use) database client instances'
);
const dbPoolIdle = registry.gauge(
  'db_pool_idle',
  'Idle (cached) database client instances'
);
const dbPoolWaiting = registry.gauge(
  'db_pool_waiting',
  'Requests waiting for a database client'
);
const dbPoolExhausted = registry.counter(
  'db_pool_exhausted_total',
  'Pool exhaustion events (waited > threshold)'
);
const dbSlowQueries = registry.counter(
  'db_slow_queries_total',
  'Queries that took longer than 1 second'
);
const dbQueryErrors = registry.counter(
  'db_query_errors_total',
  'Database query errors (by code)'
);
const dbQueryDurationMs = registry.histogram(
  'db_query_duration_ms',
  'Database query duration in milliseconds'
);

// ============================================================================
// Internal state
// ============================================================================

interface PoolStats {
  activeCount: number;
  idleCount: number;
  waitingCount: number;
  totalAcquires: number;
  totalReleases: number;
  totalExhaustions: number;
  totalSlowQueries: number;
  startTime: number;
}

const stats: PoolStats = {
  activeCount: 0,
  idleCount: 0,
  waitingCount: 0,
  totalAcquires: 0,
  totalReleases: 0,
  totalExhaustions: 0,
  totalSlowQueries: 0,
  startTime: Date.now(),
};

// Track the high-water mark for alerts
let highWaterActive = 0;
let highWaterWaiting = 0;
const SLOW_QUERY_THRESHOLD_MS = 1000;
const POOL_EXHAUSTION_THRESHOLD = 10; // 10 waiting = exhaustion alert

// ============================================================================
// Public API
// ============================================================================

export interface DbClientLease {
  release: (durationMs: number, errorCode?: string) => void;
  leaseId: string;
  startTime: number;
}

/**
 * Acquire a database client. Returns a lease that must be released after use.
 * Tracks active count, wait time, and detects pool exhaustion.
 */
export async function acquireDbClient(opts: {
  operation: string;       // e.g. "orders.insert", "payment_refunds.select"
  requestId?: string;
} = { operation: 'unknown' }): Promise<DbClientLease> {
  const requestId = opts.requestId ?? generateRequestId();
  const startWait = Date.now();
  const leaseId = generateRequestId();

  stats.waitingCount++;
  if (stats.waitingCount > highWaterWaiting) highWaterWaiting = stats.waitingCount;
  dbPoolWaiting.set(stats.waitingCount);

  // Check for exhaustion
  if (stats.waitingCount > POOL_EXHAUSTION_THRESHOLD) {
    stats.totalExhaustions++;
    dbPoolExhausted.inc({ operation: opts.operation });
    logger.error('db.pool.exhausted', {
      requestId, operation: opts.operation, waiting: stats.waitingCount,
      highWaterActive, highWaterWaiting, totalExhaustions: stats.totalExhaustions,
    });
  }

  // Simulated wait — in production, this is the actual time to get a client
  // from the pool. For now, the mock just gives it immediately.
  const waitMs = 0;
  if (waitMs > 100) {
    logger.warn('db.pool.slow_acquire', {
      requestId, operation: opts.operation, waitMs, waiting: stats.waitingCount,
    });
  }

  stats.waitingCount--;
  stats.activeCount++;
  stats.totalAcquires++;
  if (stats.activeCount > highWaterActive) highWaterActive = stats.activeCount;
  dbPoolActive.set(stats.activeCount);
  dbPoolWaiting.set(stats.waitingCount);

  return {
    leaseId,
    startTime: Date.now(),
    release(durationMs: number, errorCode?: string) {
      // Decrement active, increment idle (in this mock, idle is approximated)
      stats.activeCount = Math.max(0, stats.activeCount - 1);
      stats.idleCount = Math.max(0, stats.idleCount + 1);
      stats.totalReleases++;
      dbPoolActive.set(stats.activeCount);

      // Record query duration
      dbQueryDurationMs.observe(durationMs, { operation: opts.operation });

      if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
        stats.totalSlowQueries++;
        dbSlowQueries.inc({ operation: opts.operation });
        logger.warn('db.slow_query', {
          requestId, operation: opts.operation, durationMs,
          threshold: SLOW_QUERY_THRESHOLD_MS, leaseId,
        });
      }

      if (errorCode) {
        dbQueryErrors.inc({ operation: opts.operation, code: errorCode });
        logger.error('db.query.error', {
          requestId, operation: opts.operation, durationMs, errorCode, leaseId,
        });
      }
    },
  };
}

/**
 * Get current pool stats (for /api/health and metrics endpoints).
 */
export function getPoolStats(): PoolStats & {
  highWaterActive: number;
  highWaterWaiting: number;
  uptimeMs: number;
} {
  return {
    ...stats,
    highWaterActive,
    highWaterWaiting,
    uptimeMs: Date.now() - stats.startTime,
  };
}

/**
 * Detect pool exhaustion and return an alert level.
 * - ok: under threshold
 * - warning: 1-2x threshold
 * - critical: 2x+ threshold
 */
export function detectPoolExhaustion(): {
  level: 'ok' | 'warning' | 'critical';
  reason: string;
  metrics: ReturnType<typeof getPoolStats>;
} {
  const s = getPoolStats();
  if (s.totalExhaustions > 0 && s.waitingCount > POOL_EXHAUSTION_THRESHOLD * 2) {
    return {
      level: 'critical',
      reason: `Pool exhaustion: ${s.waitingCount} waiting, ${s.totalExhaustions} total exhaustions`,
      metrics: s,
    };
  }
  if (s.waitingCount > POOL_EXHAUSTION_THRESHOLD) {
    return {
      level: 'warning',
      reason: `Pool near exhaustion: ${s.waitingCount} waiting`,
      metrics: s,
    };
  }
  if (s.activeCount > 50) {
    return {
      level: 'warning',
      reason: `High active connection count: ${s.activeCount}`,
      metrics: s,
    };
  }
  return { level: 'ok', reason: 'Pool healthy', metrics: s };
}

/**
 * Reset all stats — test only.
 */
export function _resetPoolStatsForTests(): void {
  stats.activeCount = 0;
  stats.idleCount = 0;
  stats.waitingCount = 0;
  stats.totalAcquires = 0;
  stats.totalReleases = 0;
  stats.totalExhaustions = 0;
  stats.totalSlowQueries = 0;
  highWaterActive = 0;
  highWaterWaiting = 0;
  stats.startTime = Date.now();
}

/**
 * Run a function with a database client lease.
 * Records duration and errors automatically.
 */
export async function withDbClient<T>(
  operation: string,
  fn: (lease: DbClientLease) => Promise<T>,
  opts: { requestId?: string } = {}
): Promise<T> {
  const lease = await acquireDbClient({ operation, requestId: opts.requestId });
  const start = Date.now();
  try {
    const result = await fn(lease);
    const durationMs = Date.now() - start;
    lease.release(durationMs);
    return result;
  } catch (e: unknown) {
    const durationMs = Date.now() - start;
    const err = e as { code?: string; message?: string };
    lease.release(durationMs, err?.code ?? 'unknown');
    throw e;
  }
}

// ============================================================================
// Health check (for /api/health/db-pool)
// ============================================================================

export interface PoolHealthReport {
  status: 'ok' | 'warning' | 'critical';
  active: number;
  idle: number;
  waiting: number;
  totalAcquires: number;
  totalExhaustions: number;
  totalSlowQueries: number;
  highWaterActive: number;
  highWaterWaiting: number;
  uptimeMs: number;
  recommendations: string[];
  generatedAt: string;
}

export function generatePoolHealthReport(): PoolHealthReport {
  const s = getPoolStats();
  const exhaustion = detectPoolExhaustion();
  const recommendations: string[] = [];

  if (s.totalExhaustions > 0) {
    recommendations.push(
      `${s.totalExhaustions} pool exhaustion event(s) detected. Consider: (1) reducing query duration, (2) increasing pool size, (3) adding connection retry logic.`
    );
  }
  if (s.totalSlowQueries > 0) {
    recommendations.push(
      `${s.totalSlowQueries} slow queries (>$1s). Investigate indexes, query plans, RLS overhead.`
    );
  }
  if (s.activeCount > 30) {
    recommendations.push(
      `High active connection count (${s.activeCount}). Consider request batching or async I/O.`
    );
  }
  if (s.waitingCount > 5) {
    recommendations.push(
      `${s.waitingCount} clients waiting. Pool may be undersized for current load.`
    );
  }

  return {
    status: exhaustion.level,
    active: s.activeCount,
    idle: s.idleCount,
    waiting: s.waitingCount,
    totalAcquires: s.totalAcquires,
    totalExhaustions: s.totalExhaustions,
    totalSlowQueries: s.totalSlowQueries,
    highWaterActive: s.highWaterActive,
    highWaterWaiting: s.highWaterWaiting,
    uptimeMs: s.uptimeMs,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}
