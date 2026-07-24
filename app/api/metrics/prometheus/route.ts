/**
 * Prometheus Metrics Endpoint
 * ───────────────────────────
 * GET /api/metrics/prometheus
 * 
 * Exposes metrics in Prometheus text format for scraping.
 * Compatible with Prometheus, Grafana, Datadog Agent, etc.
 */

import { NextResponse } from 'next/server';
import { registry } from '@/lib/observability/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const text = registry.toPrometheus();
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Failed to export metrics', message: e?.message },
      { status: 500 }
    );
  }
}
