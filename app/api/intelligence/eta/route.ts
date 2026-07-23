/**
 * Predictive ETA API
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { predictETA } from '@/lib/intelligence/eta-predictor';
import type { LatLng } from '@/lib/maps/distance';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RequestBody {
  order_id?: string;
  driver_lat?: number;
  driver_lng?: number;
  restaurant_id?: string;
  customer_lat?: number;
  customer_lng?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const body: RequestBody = await req.json().catch(() => ({}));
    let restaurantLoc: LatLng;
    let customerLoc: LatLng;
    let historicalPrepMin: number | undefined;
    let prepVarianceMin: number | undefined;
    let prepSampleSize: number | undefined;
    let driverSpeedFactor: number | undefined;

    if (body.order_id) {
      const { data: order } = await serviceClient
        .from('orders')
        .select('restaurant_id, customer_latitude, customer_longitude, restaurant:restaurant_id(id, latitude, longitude, avg_prep_minutes, prep_variance_minutes)')
        .eq('id', body.order_id)
        .single();
      if (!order) throw new ValidationError('Order not found');
      const rest = order.restaurant as any;
      if (!rest?.latitude || !rest?.longitude) {
        throw new ValidationError('Restaurant location missing');
      }
      restaurantLoc = { lat: Number(rest.latitude), lng: Number(rest.longitude) };
      customerLoc = { lat: Number(order.customer_latitude), lng: Number(order.customer_longitude) };
      historicalPrepMin = undefined;
      prepVarianceMin = undefined;

      if (rest.id) {
        const { count } = await serviceClient
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rest.id)
          .eq('status', 'delivered')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        prepSampleSize = count ?? 0;
      }
    } else {
      if (!body.restaurant_id) throw new ValidationError('restaurant_id required');
      if (body.customer_lat == null || body.customer_lng == null) {
        throw new ValidationError('customer coordinates required');
      }
      const { data: rest } = await serviceClient
        .from('restaurants')
        .select('id, latitude, longitude')
        .eq('id', body.restaurant_id)
        .single();
      if (!rest) throw new ValidationError('Restaurant not found');
      restaurantLoc = { lat: Number(rest.latitude), lng: Number(rest.longitude) };
      customerLoc = { lat: body.customer_lat, lng: body.customer_lng };
      historicalPrepMin = undefined;
      prepVarianceMin = undefined;
    }

    const { data: driverMeta } = await serviceClient
      .from('users')
      .select('rating')
      .eq('id', user.id)
      .single();
    if (driverMeta?.rating) {
      const r = Number(driverMeta.rating);
      driverSpeedFactor = 0.8 + (r - 3) * 0.2;
    }

    const driverLoc: LatLng | null =
      body.driver_lat != null && body.driver_lng != null
        ? { lat: body.driver_lat, lng: body.driver_lng }
        : null;

    const prediction = predictETA({
      driverLocation: driverLoc,
      restaurantLocation: restaurantLoc,
      customerLocation: customerLoc,
      historicalPrepMinutes: historicalPrepMin,
      prepVarianceMinutes: prepVarianceMin,
      driverSpeedFactor,
      prepSampleSize,
    });

    return ok(prediction);
  });
}
