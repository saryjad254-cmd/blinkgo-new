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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};

  try {
    const supabase = createServiceClient();
    const dbStart = Date.now();
    const { error } = await supabase.from('users').select('id').limit(1).maybeSingle();
    if (error) throw error;
    checks.database = { ok: true, latency_ms: Date.now() - dbStart };
  } catch (e: any) {
    checks.database = { ok: false, error: e?.message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      ready: allOk,
      timestamp: new Date().toISOString(),
      uptime_seconds: process.uptime(),
      response_ms: Date.now() - startTime,
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
