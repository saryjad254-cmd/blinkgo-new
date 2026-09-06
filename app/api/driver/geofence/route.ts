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
import { ok, withErrorHandling } from '@/lib/api/response';
import type { ApiResponse } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { assertCanReadOrder } from '@/lib/api/ownership';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { haversineDistance, type LatLng } from '@/lib/delivery-zone';
import { validateLocation } from '@/lib/driver/dispatch-policy';
import type { AuthedUser } from '@/lib/auth-helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ARRIVAL_THRESHOLD_M = 50; // Within 50m = "arrived"
const PICKUP_THRESHOLD_M = 75;  // Slightly larger for restaurant pickup

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await withSecurity(
    secureRoute('moderate', ['driver', 'admin', 'super_admin', 'manager']),
    async (ctx, request) => await geofence(ctx.auth.user, request) as NextResponse<ApiResponse<unknown>>,
  )(req) as NextResponse;
}

async function geofence(user: Pick<AuthedUser, 'id' | 'role'>, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const rawBody: unknown = await req.json().catch(() => null);
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
      ? rawBody as Record<string, unknown>
      : {};
    const orderId = String(body.order_id ?? '');
    const location = validateLocation(body.lat, body.lng);
    if (!orderId || !location.ok) {
      throw new ValidationError('order_id, lat, lng required');
    }

    // Ownership check (throws 404 if not found, 403 if not allowed)
    await assertCanReadOrder(user, orderId);

    const driverPos: LatLng = { lat: location.lat, lng: location.lng };
    const svc = createServiceClient();

    // Get order
    const { data: order, error: orderErr } = await svc
      .from('orders')
      .select('id, status, driver_id, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new NotFoundError('Order not found');
    if (order.driver_id !== user.id && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'manager') {
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
    } else if (atDropoff && (order.status === 'picked_up' || order.status === 'on_the_way' || order.status === 'delivering')) {
      suggestedAction = 'deliver';
    }

    return ok({
      at_pickup: atPickup,
      at_dropoff: atDropoff,
      distance_to_pickup_m: distanceToPickup != null ? Math.round(distanceToPickup) : null,
      distance_to_dropoff_m: distanceToDropoff != null ? Math.round(distanceToDropoff) : null,
      suggested_action: suggestedAction,
    });
  });
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
