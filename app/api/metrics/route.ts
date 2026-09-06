/**
 * Production Metrics Endpoint
 * ──────────────────────────
 * Exposes Prometheus-compatible metrics for scraping.
 * Also serves as a health/diagnostics endpoint.
 *
 * Endpoints:
 *   - GET /api/metrics — Prometheus text format
 *   - GET /api/metrics/json — JSON format
 *   - GET /api/metrics/health — Pool health + recovery state
 */

import { NextResponse } from 'next/server';
import { refreshProcessMetrics, registry } from '@/lib/observability/metrics';
import { generatePoolHealthReport } from '@/lib/infrastructure/connection-pool-monitor';
import { verifyFinancialConsistency } from '@/lib/infrastructure/recovery-verification';
// Import payment metrics to ensure they're registered with the global registry.
// These imports execute module-level code that registers the metrics.
import '@/lib/infrastructure/payment-metrics';
import '@/lib/infrastructure/stripe-retry';
import { requireMetricsToken } from '@/lib/observability/metrics-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireMetricsToken(req);
  if (denied) return denied;
  refreshProcessMetrics();
  const url = new URL(req.url);
  const format = url.searchParams.get('format');

  if (format === 'json') {
    return NextResponse.json({
      metrics: registry.toJSON(),
      poolHealth: generatePoolHealthReport(),
      generatedAt: new Date().toISOString(),
    });
  }

  if (format === 'health') {
    const poolHealth = generatePoolHealthReport();
    let consistency;
    try {
      consistency = await verifyFinancialConsistency();
    } catch (e: unknown) {
      const err = e as { message?: string };
      consistency = {
        convergenceStatus: 'diverged' as const,
        issues: [{ message: err.message ?? 'unknown' }],
        generatedAt: new Date().toISOString(),
      };
    }
    return NextResponse.json({
      status: poolHealth.status === 'ok' ? 'healthy' : 'degraded',
      pool: poolHealth,
      consistency,
      generatedAt: new Date().toISOString(),
    });
  }

  // Default: Prometheus text format
  const body = registry.toPrometheus();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4',
      'Cache-Control': 'no-store',
    },
  });
}
