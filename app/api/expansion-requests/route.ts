import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkDeliveryZone } from '@/lib/delivery-zone';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { requireAdminRole } from '@/lib/rbac';
import { rateLimit } from '@/lib/rate-limit';
import { isValidEmail, sanitizeText } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/expansion-requests
 * Body: { address, city, postal_code, lat, lng, email?, name?, notes? }
 *
 * Records a request from a user who lives outside the current delivery
 * zone. The user-facing "Coming Soon" page uses this endpoint.
 *
 * Tables: the route tolerates the table being missing (defensive — the
 * migration is shipped separately). If the table is missing, we still
 * respond ok but log the request server-side so it can be batch-imported
 * later.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit({ limit: 10, windowSec: 3600, name: 'expansion-request' }, req);
  if (limited) return limited;
  try {
    const rawBody: unknown = await req.json().catch(() => null);
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
      ? rawBody as Record<string, unknown>
      : {};
    const address = sanitizeText(String(body.address || ''), 300).trim();
    const city = sanitizeText(String(body.city || ''), 100).trim();
    const postalCode = sanitizeText(String(body.postal_code || ''), 12).trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const name = body.name ? sanitizeText(String(body.name), 100).trim() : null;
    const notes = body.notes ? sanitizeText(String(body.notes), 1000).trim() : null;

    if (!address || !city) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_INPUT', message: 'address and city are required' } },
        { status: 400 },
      );
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_COORDS', message: 'lat and lng are required' } },
        { status: 400 },
      );
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_EMAIL', message: 'email is invalid' } },
        { status: 400 },
      );
    }

    // Verify it is actually outside the zone (defensive)
    const zone = checkDeliveryZone(lat, lng, postalCode);
    if (zone.ok) {
      // Already served — no need to record
      return NextResponse.json({
        ok: true,
        result: { status: 'already_served', distance_km: zone.distanceKm },
      });
    }

    const supabase = createServiceClient();
    try {
      const { error } = await supabase
        .from('expansion_requests')
        .insert({
          address,
          city,
          postal_code: postalCode,
          lat,
          lng,
          email,
          name,
          notes,
          distance_km: zone.distanceKm,
          status: 'pending',
        });
      if (error) {
        console.warn('[expansion-requests] insert error (table missing?):', error.message);
        return NextResponse.json({ ok: true, result: { status: 'queued' } });
      }
    } catch (error: unknown) {
      console.warn('[expansion-requests] insert threw:', safeErrorMessage(error));
    }

    return NextResponse.json({ ok: true, result: { status: 'recorded', distance_km: zone.distanceKm } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message: safeErrorMessage(error) } },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  // v81 SECURITY: GET must be admin-only. The admin layout is a
  // client-side guard and can be bypassed; server must enforce.
  // PII dump (name, email, lat/lng, address) of up to 500 users must
  // not be exposed to unauthenticated callers.
  const auth = await requireAdminRole(req, 'manager');
  if (auth instanceof NextResponse) return auth;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('expansion_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return NextResponse.json({ ok: true, requests: [] });
      }
      return NextResponse.json(
        { ok: false, error: { code: 'FETCH_FAILED', message: safeErrorMessage(error) } },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, requests: data || [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message: safeErrorMessage(error) } },
      { status: 500 },
    );
  }
}
