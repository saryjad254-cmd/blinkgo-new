import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveConfiguredDeliveryZone, ZoneConfigurationError } from '@/lib/services/delivery-zone-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/zone/check
 * Body: { lat: number, lng: number, postal_code?: string }
 *
 * Returns whether the address is inside the BlinkGo delivery zone.
 * Used by the frontend before placing an order, and by the cart page
 * when a customer selects a delivery address.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_COORDS', message: 'lat and lng are required' } },
        { status: 400 },
      );
    }

    const result = await resolveConfiguredDeliveryZone(createServiceClient(), lat, lng);
    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    if (error instanceof ZoneConfigurationError) {
      return NextResponse.json({ ok: false, error: { code: 'ZONE_CONFIGURATION_UNAVAILABLE', message: error.message } }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message: 'check failed' } },
      { status: 500 },
    );
  }
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
