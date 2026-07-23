/**
 * Liveness Probe
 * ─────────────
 * GET /api/health/live
 * 
 * Used by Kubernetes to determine if the process is alive.
 * Does NOT check external dependencies (use /ready for that).
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      alive: true,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime_seconds: process.uptime(),
    },
    { status: 200 }
  );
}
