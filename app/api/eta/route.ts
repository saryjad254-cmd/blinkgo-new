/**
 * ETA Calculation API
 * ───────────────────
 * GET /api/eta?from=lat,lng&to=lat,lng
 * Returns estimated travel time and distance.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import type { ApiResponse } from '@/lib/api/response';
import { withPublicSecurity, type PublicHandlerContext } from '@/lib/api/security';
import { tier } from '@/lib/api/security-helpers';
import { ValidationError } from '@/lib/errors';
import { calculateEta } from '@/lib/maps/route-engine';
import { haversineDistance, type LatLng } from '@/lib/delivery-zone';
import { validateLocation } from '@/lib/driver/dispatch-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseLatLng(s: string): LatLng | null {
  const parts = s.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 2) return null;
  const result = validateLocation(parts[0], parts[1]);
  return result.ok ? { lat: result.lat, lng: result.lng } : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await withPublicSecurity(
    { rateLimit: tier('open') },
    async (ctx: PublicHandlerContext, request) => await calcEta(ctx, request) as NextResponse<ApiResponse<unknown>>,
  )(req) as NextResponse;
}

async function calcEta(
  _ctx: PublicHandlerContext,
  req: NextRequest,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const fromStr = url.searchParams.get('from');
    const toStr = url.searchParams.get('to');
    const requestedProfile = url.searchParams.get('profile');
    const profile: 'driving' | 'walking' | 'cycling' = requestedProfile === 'walking' || requestedProfile === 'cycling'
      ? requestedProfile
      : 'driving';

    if (!fromStr || !toStr) {
      throw new ValidationError('from and to query params required (lat,lng)');
    }

    const from = parseLatLng(fromStr);
    const to = parseLatLng(toStr);
    if (!from || !to) {
      throw new ValidationError('Invalid coordinates format');
    }

    const distance_m = haversineDistance(from, to);
    const eta = calculateEta({ distance_m, profile });

    return ok({
      distance_m: Math.round(distance_m),
      distance_km: Math.round((distance_m / 1000) * 10) / 10,
      duration_s: eta.duration_s,
      duration_min: eta.duration_min,
      formatted: eta.formatted,
      confidence: eta.confidence,
      profile,
      factors: eta.factors,
    });
  });
}
