/**
 * Health Check Endpoint
 * ──────────────────────
 * GET /api/health
 *
 * Returns:
 *  - 200 + status='ok' if the service AND database are healthy
 *  - 503 + status='degraded' if the database is unreachable
 *
 * Used by:
 *  - Load balancers (health probe)
 *  - Monitoring (Uptime, Datadog, etc.)
 *  - CI/CD (smoke test after deploy)
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const START_TIME = Date.now();

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'fail'; latency_ms?: number; error?: string }> = {};

  // 1) Self check (always passes if we got here)
  checks.self = { status: 'ok' };

  // 2) Database check
  const dbStart = Date.now();
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('users').select('id').limit(1).maybeSingle();
    if (error) throw error;
    checks.database = { status: 'ok', latency_ms: Date.now() - dbStart };
  } catch (e: any) {
    checks.database = { status: 'fail', latency_ms: Date.now() - dbStart, error: e?.message };
  }

  // 3) Memory check (process-level)
  const mem = typeof process !== 'undefined' && process.memoryUsage
    ? {
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      }
    : null;

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      service: 'blinkgo-web',
      version: process.env.NEXT_PUBLIC_VERSION || 'dev',
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
      checks,
      memory: mem,
    },
    { status: allOk ? 200 : 503 },
  );
}
