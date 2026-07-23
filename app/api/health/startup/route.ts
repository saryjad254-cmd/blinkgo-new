/**
 * Startup Probe
 * ────────────
 * GET /api/health/startup
 * 
 * Used by Kubernetes during initial deployment.
 * Returns 200 only after the application has fully started.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STARTUP_GRACE_SECONDS = 10;

export async function GET() {
  const uptime = process.uptime();
  const started = uptime >= STARTUP_GRACE_SECONDS;

  return NextResponse.json(
    {
      started,
      uptime_seconds: uptime,
      grace_seconds: STARTUP_GRACE_SECONDS,
      timestamp: new Date().toISOString(),
    },
    { status: started ? 200 : 503 }
  );
}
