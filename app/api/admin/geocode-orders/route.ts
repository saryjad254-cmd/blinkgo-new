/**
 * Repairs active orders that are missing delivery coordinates.
 * Unresolved addresses remain untouched; coordinates are never invented.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { geocode } from '@/lib/maps/geocoder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeliveryAddress = Record<string, unknown>;
type RepairResult = {
  id: string;
  status: 'updated' | 'skipped' | 'unresolved' | 'failed';
  reason?: string;
  lat?: number;
  lng?: number;
  source?: 'google' | 'nominatim';
};

function normalizeAddress(value: unknown): { record: DeliveryAddress | null; text: string } {
  let parsed = value;
  if (typeof parsed === 'string') {
    const originalText = parsed.trim();
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return { record: null, text: originalText };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { record: null, text: '' };
  const record = parsed as DeliveryAddress;
  const candidate = record.formatted_address ?? record.formattedAddress ?? record.address;
  return { record, text: typeof candidate === 'string' ? candidate.trim() : '' };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createServiceClient();
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('id, delivery_address, customer_latitude, customer_longitude')
      .in('status', ['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
      .limit(250);
    if (fetchError) throw fetchError;

    const results: RepairResult[] = [];
    for (const order of orders ?? []) {
      if (order.customer_latitude != null && order.customer_longitude != null) {
        results.push({ id: order.id, status: 'skipped', reason: 'has_coordinates' });
        continue;
      }

      const address = normalizeAddress(order.delivery_address);
      if (!address.text) {
        results.push({ id: order.id, status: 'unresolved', reason: 'missing_address' });
        continue;
      }

      const location = await geocode(address.text);
      if (!location) {
        results.push({ id: order.id, status: 'unresolved', reason: 'address_not_found' });
        continue;
      }

      const deliveryAddress = {
        ...(address.record ?? { address: address.text }),
        formatted_address: location.formattedAddress,
        lat: location.lat,
        lng: location.lng,
        geocoding_source: location.source,
      };
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          customer_latitude: location.lat,
          customer_longitude: location.lng,
          delivery_address: deliveryAddress,
        })
        .eq('id', order.id);

      if (updateError) {
        results.push({ id: order.id, status: 'failed', reason: safeErrorMessage(updateError) });
      } else {
        results.push({ id: order.id, status: 'updated', lat: location.lat, lng: location.lng, source: location.source });
      }
    }

    return NextResponse.json({
      ok: true,
      updated: results.filter((result) => result.status === 'updated').length,
      unresolved: results.filter((result) => result.status === 'unresolved').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
