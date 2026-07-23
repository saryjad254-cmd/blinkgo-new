/**
 * Build Information Endpoint
 * ─────────────────────────
 * GET /api/build-info
 * 
 * Returns build metadata for verification:
 * - Build time
 * - Commit SHA
 * - Version
 * - Environment
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    service: 'blinkgo-web',
    version: process.env.NEXT_PUBLIC_VERSION || process.env.VERSION || 'dev',
    build_time: process.env.NEXT_BUILD_TIME || process.env.BUILD_TIME || 'unknown',
    commit_sha: process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.COMMIT_SHA || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    uptime_seconds: process.uptime(),
  });
}
