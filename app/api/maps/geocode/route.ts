/**
 * Server-side geocoding + autocomplete + routing API.
 *
 * POST /api/maps/geocode        — forward geocode
 * GET  /api/maps/geocode        — query `?q=...` forward geocode
 * GET  /api/maps/reverse?lat=..&lng=.. — reverse geocode
 * GET  /api/maps/autocomplete?q=..   — Places Autocomplete
 * POST /api/maps/directions           — get driving route
 * POST /api/maps/distance             — Haversine distance (no key needed)
 *
 * Server-only. The Google Maps key never leaves the server.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  geocode,
  reverseGeocode,
  autocomplete,
  getDirections,
  isGeocodingConfigured,
} from '@/lib/maps/geocoder';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TravelMode = 'driving' | 'walking' | 'bicycling';

function coordinatePair(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const point = value as Record<string, unknown>;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    ? { lat, lng }
    : null;
}

function providerName(): 'google_with_nominatim_fallback' | 'nominatim' {
  return isGeocodingConfigured() ? 'google_with_nominatim_fallback' : 'nominatim';
}

export async function GET(req: NextRequest) {
  const limited = rateLimit({ limit: 120, windowSec: 60, name: 'maps-geocode' }, req);
  if (limited) return limited;
  const query = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (!query || query.length > 300) {
    return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'q is required and must not exceed 300 characters' } }, { status: 400 });
  }
  try {
    const result = await geocode(query);
    return result
      ? NextResponse.json({ ok: true, data: result, provider: providerName() })
      : NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Address not found' } }, { status: 404 });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Geocoding is temporarily unavailable' } },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Rate-limit geocoding — Google has usage quotas
  const limited = rateLimit(
    { limit: 120, windowSec: 60, name: 'maps-geocode' },
    req
  );
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, address, lat, lng, origin, destination, mode, input } = body || {};

    switch (action) {
      case 'geocode': {
        if (!address || typeof address !== 'string' || address.trim().length > 300) {
          return NextResponse.json(
            { ok: false, error: { code: 'BAD_REQUEST', message: 'address is required' } },
            { status: 400 }
          );
        }
        const result = await geocode(address);
        if (!result) {
          return NextResponse.json(
            { ok: false, error: { code: 'NOT_FOUND', message: 'Address not found' } },
            { status: 404 }
          );
        }
        return NextResponse.json({ ok: true, data: result });
      }

      case 'reverse': {
        const latitude = Number(lat);
        const longitude = Number(lng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          return NextResponse.json(
            { ok: false, error: { code: 'BAD_REQUEST', message: 'lat & lng required' } },
            { status: 400 }
          );
        }
        const result = await reverseGeocode(latitude, longitude);
        if (!result) {
          return NextResponse.json(
            { ok: false, error: { code: 'NOT_FOUND', message: 'No address found' } },
            { status: 404 }
          );
        }
        return NextResponse.json({ ok: true, data: result });
      }

      case 'autocomplete': {
        if (!input || typeof input !== 'string' || input.trim().length > 200) {
          return NextResponse.json(
            { ok: false, error: { code: 'BAD_REQUEST', message: 'input is required and must not exceed 200 characters' } },
            { status: 400 }
          );
        }
        const result = await autocomplete(input);
        return NextResponse.json({ ok: true, data: { predictions: result } });
      }

      case 'directions': {
        const originPoint = coordinatePair(origin);
        const destinationPoint = coordinatePair(destination);
        const travelMode: TravelMode = mode === 'walking' || mode === 'bicycling' ? mode : 'driving';
        if (!originPoint || !destinationPoint) {
          return NextResponse.json(
            { ok: false, error: { code: 'BAD_REQUEST', message: 'origin & destination required' } },
            { status: 400 }
          );
        }
        const result = await getDirections(
          originPoint,
          destinationPoint,
          { mode: travelMode }
        );
        if (!result) {
          return NextResponse.json(
            { ok: false, error: { code: 'NOT_FOUND', message: 'No route found' } },
            { status: 404 }
          );
        }
        return NextResponse.json({ ok: true, data: result });
      }

      default:
        return NextResponse.json(
          { ok: false, error: { code: 'BAD_REQUEST', message: 'action must be geocode|reverse|autocomplete|directions' } },
          { status: 400 }
        );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Server error' } },
      { status: 500 }
    );
  }
}
