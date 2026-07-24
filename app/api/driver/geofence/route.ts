/**
 * Driver Geofence Check
 * ─────────────────────
 * POST /api/driver/geofence
 * Body: { order_id, lat, lng }
 * 
 * Detects if the driver has arrived at the pickup or dropoff location.
 * Triggers automatic state transition when within threshold.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, ValidationError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { haversineDistance, type LatLng } from '@/lib/maps/distance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ARRIVAL_THRESHOLD_M = 50; // Within 50m = "arrived"
const PICKUP_THRESHOLD_M = 75;  // Slightly larger for restaurant pickup

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id ?? '');
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!orderId || !isFinite(lat) || !isFinite(lng)) {
      throw new ValidationError('order_id, lat, lng required');
    }

    const driverPos: LatLng = { lat, lng };
    const svc = createServiceClient();

    // Get order
    const { data: order, error: orderErr } = await svc
      .from('orders')
      .select('id, status, driver_id, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new NotFoundError('Order not found');
    if (order.driver_id !== user.id) {
      throw new ValidationError('Order is not assigned to you');
    }

    // Check distance to restaurant (pickup)
    let atPickup = false;
    let distanceToPickup: number | null = null;
    if (order.restaurant_latitude != null && order.restaurant_longitude != null) {
      distanceToPickup = haversineDistance(
        driverPos,
        { lat: Number(order.restaurant_latitude), lng: Number(order.restaurant_longitude) }
      );
      atPickup = distanceToPickup <= PICKUP_THRESHOLD_M;
    }

    // Check distance to customer (dropoff)
    let atDropoff = false;
    let distanceToDropoff: number | null = null;
    if (order.customer_latitude != null && order.customer_longitude != null) {
      distanceToDropoff = haversineDistance(
        driverPos,
        { lat: Number(order.customer_latitude), lng: Number(order.customer_longitude) }
      );
      atDropoff = distanceToDropoff <= ARRIVAL_THRESHOLD_M;
    }

    // Suggest next action based on order status
    let suggestedAction: string | null = null;
    if (atPickup && (order.status === 'confirmed' || order.status === 'preparing' || order.status === 'ready')) {
      suggestedAction = 'pickup';
    } else if (atDropoff && (order.status === 'picked_up' || order.status === 'on_the_way')) {
      suggestedAction = 'deliver';
    }

    return ok({
      at_pickup: atPickup,
      at_dropoff: atDropoff,
      distance_to_pickup_m: distanceToPickup ? Math.round(distanceToPickup) : null,
      distance_to_dropoff_m: distanceToDropoff ? Math.round(distanceToDropoff) : null,
      suggested_action: suggestedAction,
    });
  });
}
