/**
 * Smart Driver Assignment API
 * Returns ranked driver candidates for an order.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { scoreDrivers, type DriverCandidate } from '@/lib/intelligence/driver-assignment';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, ValidationError } from '@/lib/errors';
import type { LatLng } from '@/lib/maps/distance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RequestBody {
  order_id?: string;
  restaurant_id?: string;
  restaurant_lat?: number;
  restaurant_lng?: number;
  urgency?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const body: RequestBody = await req.json().catch(() => ({}));
    let restaurantLoc: LatLng;

    if (body.order_id) {
      const { data: order } = await supabase
        .from('orders')
        .select('restaurant:restaurant_id(latitude, longitude)')
        .eq('id', body.order_id)
        .single();
      const rest = order?.restaurant as any;
      if (!rest?.latitude || !rest?.longitude) {
        throw new ValidationError('Restaurant location missing');
      }
      restaurantLoc = { lat: Number(rest.latitude), lng: Number(rest.longitude) };
    } else {
      if (!body.restaurant_id || body.restaurant_lat == null || body.restaurant_lng == null) {
        throw new ValidationError('restaurant_id + coordinates required');
      }
      restaurantLoc = { lat: body.restaurant_lat, lng: body.restaurant_lng };
    }

    // Fetch all available drivers
    const { data: drivers } = await supabase
      .from('users')
      .select('id, name, rating, current_latitude, current_longitude, current_order_id, online_status, last_delivery_at, total_accepted, total_rejected, total_deliveries')
      .eq('role', 'driver')
      .eq('is_active', true)
      .in('online_status', ['online', 'idle']);

    if (!drivers) {
      return ok({ candidates: [] });
    }

    const candidates: DriverCandidate[] = drivers.map((d: any) => {
      const minutesSinceLast = d.last_delivery_at
        ? Math.floor((Date.now() - new Date(d.last_delivery_at).getTime()) / 60_000)
        : 999;
      const totalOrders = (d.total_accepted ?? 0) + (d.total_rejected ?? 0);
      const acceptanceRate = totalOrders > 0 ? d.total_accepted / totalOrders : 0.95;
      return {
        id: d.id,
        name: d.name ?? 'Driver',
        currentLocation:
          d.current_latitude != null && d.current_longitude != null
            ? { lat: Number(d.current_latitude), lng: Number(d.current_longitude) }
            : null,
        activeOrderCount: d.current_order_id ? 1 : 0,
        minutesSinceLastDelivery: minutesSinceLast,
        headingTowardRestaurant: false, // computed if bearing data available
        acceptanceRate,
        rating: Number(d.rating ?? 5),
        speedFactor: 0.8 + (Number(d.rating ?? 5) - 3) * 0.2,
      };
    });

    const scored = scoreDrivers(candidates, {
      restaurantLocation: restaurantLoc,
      orderPlacedAt: new Date(),
      urgency: body.urgency ?? 0.5,
    });

    return ok({ candidates: scored.slice(0, 10) });
  });
}
