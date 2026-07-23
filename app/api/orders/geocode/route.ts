/**
 * Order Address Geocoder
 * ──────────────────────
 * POST /api/orders/geocode
 * Body: { orderId?: string, batch?: boolean }
 *
 * Single-order mode: geocodes the delivery_address of the given order and writes
 * customer_latitude + customer_longitude + delivery_address.lat/lng back to the row.
 *
 * Batch mode (batch=true, admin only): walks all orders with null lat/lng and
 * geocodes them. Used for backfilling legacy orders so the new lazy-gecode path
 * is never the only source of truth.
 *
 * Geocoder: Nominatim (OpenStreetMap) — free, no API key.
 *
 * The endpoint is idempotent. If coords already exist for an order it is skipped
 * (no wasted external calls).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_HEADERS = {
  'User-Agent': 'BlinkGo/1.0 (food delivery demo)',
  'Accept': 'application/json',
};
const REQUEST_TIMEOUT_MS = 5000;

// Known city heuristics — for very short / illegible addresses we can still
// fall back to a city center so the order has a GPS point on the map
// (better than nothing). The driver can confirm with the customer.
// Note: regexes are substring (not word-boundary) so partial typos like
// 'bonnr' or 'koelnerstr' still match 'bonn' and 'koeln'.
const KNOWN_CITY_CENTERS: Array<{ needles: string[]; lat: number; lng: number; name: string }> = [
  { needles: ['bonn', 'bohn', 'bnn', 'bnn.', 'bon'], lat: 50.7374, lng: 7.0982, name: 'Bonn, Germany' },
  { needles: ['koeln', 'köln', 'koln', 'cologne', 'cgn'], lat: 50.9375, lng: 6.9603, name: 'Köln, Germany' },
  { needles: ['berlin', 'bln'], lat: 52.52, lng: 13.405, name: 'Berlin, Germany' },
  { needles: ['münchen', 'munchen', 'munich', 'muc'], lat: 48.1351, lng: 11.582, name: 'München, Germany' },
  { needles: ['frankfurt', 'fra'], lat: 50.1109, lng: 8.6821, name: 'Frankfurt, Germany' },
  { needles: ['hamburg', 'ham'], lat: 53.5511, lng: 9.9937, name: 'Hamburg, Germany' },
  { needles: ['düsseldorf', 'dusseldorf', 'dus'], lat: 51.2277, lng: 6.7735, name: 'Düsseldorf, Germany' },
  { needles: ['wesseling', 'wsl'], lat: 50.8209, lng: 6.9726, name: 'Wesseling, Germany' },
  { needles: ['brühl', 'bruhl'], lat: 50.8293, lng: 6.9033, name: 'Brühl, Germany' },
  { needles: ['sechtem'], lat: 50.7833, lng: 6.7333, name: 'Sechtem, Germany' },
];

/**
 * Try a known-city heuristic — useful when the address text is too short or
 * unparseable (e.g. typos, abbreviations, garbage user input). Returns city
 * center coordinates tagged as `cityFallback` so the caller can decide
 * whether to use them.
 */
function lookupKnownCity(text: string): { lat: number; lng: number; name: string } | null {
  const lower = text.toLowerCase();
  for (const c of KNOWN_CITY_CENTERS) {
    if (c.needles.some((n) => lower.includes(n))) {
      return { lat: c.lat, lng: c.lng, name: c.name };
    }
  }
  return null;
}

async function geocodeText(rawText: string): Promise<{ lat: number; lng: number; displayName: string; cityFallback?: boolean } | null> {
  const text = (rawText || '').trim();
  if (text.length < 2) return null;
  const queries = [
    text,
    `${text}, Germany`,
    `${text}, Deutschland`,
  ];
  for (const q of queries) {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: NOMINATIM_HEADERS,
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        const lat = Number(first.lat);
        const lng = Number(first.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat, lng, displayName: first.display_name || q };
        }
      }
    } catch {
      /* try next variant */
    }
  }

  // FALLBACK: try known-city heuristic before giving up
  const city = lookupKnownCity(text);
  if (city) {
    return { ...city, displayName: city.name, cityFallback: true };
  }
  return null;
}

function extractAddressText(deliveryAddress: any): string | null {
  if (!deliveryAddress) return null;
  if (typeof deliveryAddress === 'string') {
    const s = deliveryAddress.trim();
    return s.length ? s : null;
  }
  if (typeof deliveryAddress === 'object') {
    const cand =
      deliveryAddress.formatted_address ||
      deliveryAddress.address ||
      deliveryAddress.street ||
      null;
    if (typeof cand === 'string' && cand.trim().length >= 3) return cand.trim();
  }
  return null;
}

function hasCoords(order: any): boolean {
  return !!(
    order.customer_latitude && order.customer_longitude
    || (typeof order.delivery_address === 'object' &&
        order.delivery_address?.lat && order.delivery_address?.lng)
  );
}

export async function POST(req: NextRequest) {
  const supabaseAuth = createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const orderId = body?.orderId as string | undefined;
  const batch = body?.batch === true;

  const service = createServiceClient();

  if (batch) {
    const role = user.user_metadata?.role || 'customer';
    if (role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    const { data: orders, error } = await service
      .from('orders')
      .select('id, delivery_address, customer_latitude, customer_longitude')
      .limit(500);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ id: string; reason: string }> = [];
    for (const o of orders ?? []) {
      if (hasCoords(o)) {
        skipped++;
        continue;
      }
      const text = extractAddressText(o.delivery_address);
      if (!text) {
        failures.push({ id: o.id, reason: 'no address text' });
        failed++;
        continue;
      }
      const geo = await geocodeText(text);
      if (!geo) {
        failures.push({ id: o.id, reason: 'geocode miss' });
        failed++;
        continue;
      }
      const newAddress =
        typeof o.delivery_address === 'object' && o.delivery_address
          ? { ...o.delivery_address, lat: geo.lat, lng: geo.lng, formatted_address: o.delivery_address.formatted_address ?? geo.displayName }
          : { lat: geo.lat, lng: geo.lng, address: text, notes: '', formatted_address: geo.displayName };
      const { error: upErr } = await service
        .from('orders')
        .update({
          customer_latitude: geo.lat,
          customer_longitude: geo.lng,
          delivery_address: newAddress,
        })
        .eq('id', o.id);
      if (upErr) {
        failures.push({ id: o.id, reason: upErr.message });
        failed++;
      } else {
        updated++;
      }
      await new Promise((r) => setTimeout(r, 1100)); // respect Nominatim 1req/s policy
    }
    return NextResponse.json({ ok: true, mode: 'batch', updated, skipped, failed, failures });
  }

  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'orderId required' }, { status: 400 });
  }

  const { data: order, error: orderErr } = await service
    .from('orders')
    .select('id, customer_id, driver_id, delivery_address, customer_latitude, customer_longitude')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  }

  const role = user.user_metadata?.role || 'customer';
  const allowed =
    role === 'admin' ||
    order.customer_id === user.id ||
    order.driver_id === user.id;
  if (!allowed) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  if (hasCoords(order)) {
    return NextResponse.json({ ok: true, status: 'already_geocoded', lat: order.customer_latitude, lng: order.customer_longitude });
  }

  const text = extractAddressText(order.delivery_address);
  if (!text) {
    return NextResponse.json({ ok: false, error: 'No address text to geocode' }, { status: 400 });
  }

  const geo = await geocodeText(text);
  if (!geo) {
    return NextResponse.json({ ok: false, error: 'Geocoder found nothing for this address' }, { status: 422 });
  }

  const newAddress =
    typeof order.delivery_address === 'object' && order.delivery_address
      ? { ...order.delivery_address, lat: geo.lat, lng: geo.lng, formatted_address: order.delivery_address.formatted_address ?? geo.displayName }
      : { lat: geo.lat, lng: geo.lng, address: text, notes: '', formatted_address: geo.displayName };

  const { error: upErr } = await service
    .from('orders')
    .update({
      customer_latitude: geo.lat,
      customer_longitude: geo.lng,
      delivery_address: newAddress,
    })
    .eq('id', order.id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: 'geocoded',
    lat: geo.lat,
    lng: geo.lng,
    displayName: geo.displayName,
  });
}
