/**
 * ETA Calculation API
 * ───────────────────
 * GET /api/eta?from=lat,lng&to=lat,lng
 * Returns estimated travel time and distance.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/errors';
import { calculateEta, haversineDistance } from '@/lib/maps/route-engine';
import type { LatLng } from '@/lib/maps/distance';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseLatLng(s: string): LatLng | null {
  const parts = s.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 2 || !isFinite(parts[0]) || !isFinite(parts[1])) return null;
  return { lat: parts[0], lng: parts[1] };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const fromStr = url.searchParams.get('from');
    const toStr = url.searchParams.get('to');
    const profile = (url.searchParams.get('profile') ?? 'driving') as 'driving' | 'walking' | 'cycling';

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
