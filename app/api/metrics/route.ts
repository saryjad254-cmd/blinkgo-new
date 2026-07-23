/**
 * Performance Metrics Endpoint
 * ────────────────────────────
 * GET /api/metrics
 * Returns application performance metrics for monitoring.
 */
import { NextResponse } from 'next/server';
import { getAllBreakerStats } from '@/lib/circuit-breaker';
import { searchCache, restaurantCache, categoryCache, userCache, productCache } from '@/lib/cache';
import { ok } from '@/lib/api/response';
import { getLatencyStats } from '@/lib/perf/latency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const uptime = process.uptime();

  const breakers = getAllBreakerStats();

  return ok({
    ts: new Date().toISOString(),
    uptime_seconds: Math.round(uptime),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      external_mb: Math.round(mem.external / 1024 / 1024),
    },
    cpu: {
      user_ms: Math.round(cpu.user / 1000),
      system_ms: Math.round(cpu.system / 1000),
    },
    caches: {
      search: searchCache.stats(),
      restaurants: restaurantCache.stats(),
      categories: categoryCache.stats(),
      users: userCache.stats(),
      products: productCache.stats(),
    },
    breakers,
    latency: getLatencyStats(),
    node_env: process.env.NODE_ENV,
    node_version: process.version,
  });
}
