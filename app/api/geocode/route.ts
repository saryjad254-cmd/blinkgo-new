/**
 * Geocoding endpoint — converts address text to lat/lng.
 * Uses OpenStreetMap Nominatim (FREE, no API key needed).
 * Used as a fallback when delivery_address doesn't have coords stored.
 *
 * POST /api/geocode
 *   Body: { address: string, city?: string }
 *   Returns: { lat: number, lng: number, displayName: string } | { error }
 *
 * Notes:
 *   - On success, also updates the order's delivery_address JSON to cache the coords.
 *   - Returns 200 with `null` if geocoding fails (caller falls back to text-based search).
 */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
}

async function geocodeWithNominatim(query: string): Promise<NominatimResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}&accept-language=de,en,ar`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BlinkGo/1.0 (food delivery demo)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult[];
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0];
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // SECURITY: require auth to prevent data tampering of arbitrary orders
  const { createServerClient } = await import('@/lib/supabase/server');
  const sbAuth = createServerClient();
  const { data: { user } } = await sbAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const address: string = body.address || body.q || '';
    const city: string = body.city || '';
    const country: string = body.country || 'Germany';

    if (!address || address.length < 3) {
      return NextResponse.json({ ok: false, error: 'address required' }, { status: 400 });
    }

    // Build query with country hint for better accuracy
    const query = country ? `${address}, ${city ? city + ', ' : ''}${country}` : address;
    const result = await geocodeWithNominatim(query);

    if (!result) {
      return NextResponse.json({ ok: true, lat: null, lng: null, displayName: null });
    }

    const lat = Number(result.lat);
    const lng = Number(result.lon);

    // Cache to delivery_address if order_id provided
    const orderId = body.order_id;
    if (orderId) {
      try {
        const sb = createServiceClient();

        // SECURITY: verify ownership before writing
        const { data: order } = await sb
          .from('orders')
          .select('delivery_address, customer_id')
          .eq('id', orderId)
          .single();
        if (!order || order.customer_id !== user.id) {
          return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
        }
        if (order) {
          const addr = (order.delivery_address && typeof order.delivery_address === 'object')
            ? order.delivery_address
            : {};
          await sb.from('orders').update({
            customer_latitude: lat,
            customer_longitude: lng,
            delivery_address: { ...addr, lat, lng, displayName: result.display_name },
          }).eq('id', orderId);
        }
      } catch (e: any) {
        // Cache failure is non-fatal — log only
        logger.warn('Geocode cache write failed', { error: (e as Error).message });
      }
    }

    return NextResponse.json({
      ok: true,
      lat,
      lng,
      displayName: result.display_name,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
