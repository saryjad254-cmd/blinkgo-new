/**
 * Readiness Probe
 * ──────────────
 * GET /api/health/ready
 * 
 * Used by Kubernetes/load balancers to determine if this instance
 * can receive traffic. Returns 200 only when all dependencies
 * are healthy AND the instance is fully initialized.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getDeploymentReadiness } from '@/lib/config/deployment-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};
  const configuration = getDeploymentReadiness();
  // Legal, payment, email, and launch-certification checks belong to the
  // deployment gate, not to the runtime liveness of a local/test instance.
  // Keeping them in the HTTP readiness decision during development made the
  // global boot screen report a degraded app even while all runtime services
  // were healthy. Production remains fail-closed on the full launch gate.
  const runtimeConfigurationItems = configuration.mode === 'production'
    ? configuration.items.filter((item) => item.required)
    : configuration.items.filter((item) => item.category === 'core' && item.required);
  const runtimeConfigurationReady = runtimeConfigurationItems.every((item) => item.status === 'ready');

  try {
    const supabase = createServiceClient();
    const dbStart = Date.now();
    const { error } = await supabase.from('users').select('id').limit(1).maybeSingle();
    if (error) throw error;
    checks.database = { ok: true, latency_ms: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      ok: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Database unavailable'
        : error instanceof Error ? error.message : 'Database unavailable',
    };
  }

  checks.configuration = {
    ok: runtimeConfigurationReady,
    error: runtimeConfigurationReady
      ? undefined
      : `${runtimeConfigurationItems.filter((item) => item.status === 'missing').length} required runtime configuration item(s) missing`,
  };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      ready: allOk,
      timestamp: new Date().toISOString(),
      uptime_seconds: process.uptime(),
      response_ms: Date.now() - startTime,
      checks,
      configuration: {
        score: configuration.score,
        mode: configuration.mode,
        ready: configuration.ready,
        runtime_ready: runtimeConfigurationReady,
      },
    },
    { status: allOk ? 200 : 503 }
  );
}
