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

import { NextRequest, NextResponse } from 'next/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('open'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => buildInfo() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function buildInfo(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    return ok({
      service: 'blinkgo-web',
      version: process.env.NEXT_PUBLIC_VERSION || process.env.VERSION || 'dev',
      build_time: process.env.NEXT_BUILD_TIME || process.env.BUILD_TIME || 'unknown',
      commit_sha: process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.COMMIT_SHA || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      node_version: process.version,
      uptime_seconds: process.uptime(),
    });
  });
}
