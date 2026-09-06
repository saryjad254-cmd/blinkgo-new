/**
 * Authenticated legacy geocoding endpoint.
 * Uses the canonical server-side provider and optionally caches a result on
 * an order owned by the current customer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { geocode } from '@/lib/maps/geocoder';
import { rateLimit } from '@/lib/rate-limit';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requestObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  const limited = rateLimit({ limit: 60, windowSec: 60, name: 'legacy-geocode' }, req);
  if (limited) return limited;

  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = requestObject(await req.json().catch(() => null));
    const address = text(body.address ?? body.q, 300);
    const city = text(body.city, 100);
    const country = text(body.country, 100) || 'Germany';
    if (address.length < 3) {
      return NextResponse.json({ ok: false, error: 'address required' }, { status: 400 });
    }

    const query = [address, city, country].filter(Boolean).join(', ');
    const result = await geocode(query);
    if (!result) return NextResponse.json({ ok: true, lat: null, lng: null, displayName: null });

    const orderId = text(body.order_id, 80);
    if (orderId) {
      const service = createServiceClient();
      const { data: order, error: orderError } = await service
        .from('orders')
        .select('delivery_address, customer_id')
        .eq('id', orderId)
        .single();
      if (orderError || !order || order.customer_id !== user.id) {
        return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
      }

      const existingAddress = order.delivery_address && typeof order.delivery_address === 'object' && !Array.isArray(order.delivery_address)
        ? order.delivery_address as Record<string, unknown>
        : {};
      const { error: updateError } = await service.from('orders').update({
        customer_latitude: result.lat,
        customer_longitude: result.lng,
        delivery_address: {
          ...existingAddress,
          lat: result.lat,
          lng: result.lng,
          displayName: result.formattedAddress,
          geocoding_source: result.source,
        },
      }).eq('id', orderId);
      if (updateError) logger.warn('Geocode cache write failed', { orderId }, updateError);
    }

    return NextResponse.json({
      ok: true,
      lat: result.lat,
      lng: result.lng,
      displayName: result.formattedAddress,
      source: result.source,
    });
  } catch (error: unknown) {
    logger.warn('Legacy geocode failed', {}, error);
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
