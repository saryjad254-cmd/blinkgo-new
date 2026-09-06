/**
 * Prometheus Metrics Endpoint
 * ───────────────────────────
 * GET /api/metrics/prometheus
 * 
 * Exposes metrics in Prometheus text format for scraping.
 * Compatible with Prometheus, Grafana, Datadog Agent, etc.
 */

import { NextResponse } from 'next/server';
import { refreshProcessMetrics, registry } from '@/lib/observability/metrics';
import { requireMetricsToken } from '@/lib/observability/metrics-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const denied = requireMetricsToken(request);
  if (denied) return denied;
  try {
    refreshProcessMetrics();
    const text = registry.toPrometheus();
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: 'Failed to export metrics', message: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
