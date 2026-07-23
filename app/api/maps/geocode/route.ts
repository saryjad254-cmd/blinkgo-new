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

export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST with { address } or ?q= for GET',
      },
    },
    { status: 405 }
  );
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
        if (!address || typeof address !== 'string') {
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
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
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
        if (!input || typeof input !== 'string') {
          return NextResponse.json(
            { ok: false, error: { code: 'BAD_REQUEST', message: 'input is required' } },
            { status: 400 }
          );
        }
        const result = await autocomplete(input);
        return NextResponse.json({ ok: true, data: { predictions: result } });
      }

      case 'directions': {
        if (!origin || !destination) {
          return NextResponse.json(
            { ok: false, error: { code: 'BAD_REQUEST', message: 'origin & destination required' } },
            { status: 400 }
          );
        }
        const result = await getDirections(
          { lat: Number(origin.lat), lng: Number(origin.lng) },
          { lat: Number(destination.lat), lng: Number(destination.lng) },
          { mode: mode ?? 'driving' }
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
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: err?.message ?? 'Server error' } },
      { status: 500 }
    );
  }
}
