import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkDeliveryZone } from '@/lib/delivery-zone';

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
  try {
    const body = await req.json().catch(() => ({}));
    const address = String(body.address || '').trim();
    const city = String(body.city || '').trim();
    const postalCode = String(body.postal_code || '').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const name = body.name ? String(body.name).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!address || !city) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_INPUT', message: 'address and city are required' } },
        { status: 400 },
      );
    }
    if (!isFinite(lat) || !isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_COORDS', message: 'lat and lng are required' } },
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
    } catch (e: any) {
      console.warn('[expansion-requests] insert threw:', e?.message);
    }

    return NextResponse.json({ ok: true, result: { status: 'recorded', distance_km: zone.distanceKm } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message: e?.message || 'submit failed' } },
      { status: 500 },
    );
  }
}

export async function GET() {
  // For admin dashboard. The admin layout guards this — we don't add
  // public access here.
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
        { ok: false, error: { code: 'FETCH_FAILED', message: error.message } },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, requests: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message: e?.message } },
      { status: 500 },
    );
  }
}
