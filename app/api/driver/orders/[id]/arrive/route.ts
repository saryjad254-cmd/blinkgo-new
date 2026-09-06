import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { haversineDistance } from '@/lib/realtime/location-service';
import {
  DRIVER_ARRIVAL_RADIUS_METERS,
  arrivalEventType,
  canMarkDriverArrival,
  isDriverArrivalStage,
  isWithinArrivalRadius,
} from '@/lib/driver/arrival-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  return (await withSecurity(
    secureRoute('moderate', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, request) => markArrival(ctx, request as NextRequest, params.id) as any,
  )(req)) as unknown as NextResponse;
}

async function markArrival(
  ctx: { auth: { user: { id: string; role: string } } },
  req: NextRequest,
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const body = await req.json().catch(() => null);
    if (!isDriverArrivalStage(body?.stage)) throw new ValidationError('stage must be pickup or dropoff');
    const stage = body.stage;
    const svc = createServiceClient();

    const { data: order, error: orderError } = await svc
      .from('orders')
      .select('*, restaurants(latitude, longitude, name)')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError || !order) throw new NotFoundError('Order');
    if (order.driver_id !== ctx.auth.user.id && !['admin', 'super_admin', 'manager'].includes(ctx.auth.user.role)) {
      throw new AuthorizationError('You are not the assigned driver');
    }
    if (!canMarkDriverArrival(stage, String(order.status))) {
      throw new ConflictError(`Cannot mark ${stage} arrival in status: ${order.status}`, {
        code: 'INVALID_ARRIVAL_STAGE',
        current_status: order.status,
      });
    }

    const eventType = arrivalEventType(stage);
    const { data: existing } = await svc
      .from('order_tracking_events')
      .select('id, created_at, event_type, metadata')
      .eq('order_id', orderId)
      .eq('event_type', eventType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return ok({ arrival: existing, duplicate: true });

    const { data: driverStatus } = await svc
      .from('driver_status')
      .select('latitude, longitude, current_lat, current_lng')
      .eq('driver_id', order.driver_id)
      .maybeSingle();
    const deliveryAddress = typeof order.delivery_address === 'object' && order.delivery_address
      ? order.delivery_address as Record<string, unknown>
      : {};
    const restaurant = Array.isArray(order.restaurants) ? order.restaurants[0] : order.restaurants;
    const driverLat = numeric(driverStatus?.latitude ?? driverStatus?.current_lat ?? order.driver_latitude);
    const driverLng = numeric(driverStatus?.longitude ?? driverStatus?.current_lng ?? order.driver_longitude);
    const targetLat = stage === 'pickup'
      ? numeric(order.restaurant_latitude ?? restaurant?.latitude)
      : numeric(order.customer_latitude ?? deliveryAddress.lat);
    const targetLng = stage === 'pickup'
      ? numeric(order.restaurant_longitude ?? restaurant?.longitude)
      : numeric(order.customer_longitude ?? deliveryAddress.lng);
    const distanceMeters = driverLat !== null && driverLng !== null && targetLat !== null && targetLng !== null
      ? haversineDistance({ lat: driverLat, lng: driverLng }, { lat: targetLat, lng: targetLng })
      : null;

    if (!isWithinArrivalRadius(distanceMeters)) {
      throw new ConflictError('Move closer to the destination before marking arrival', {
        code: 'ARRIVAL_TOO_FAR',
        distance_meters: Math.round(distanceMeters as number),
        allowed_radius_meters: DRIVER_ARRIVAL_RADIUS_METERS,
      });
    }

    const now = new Date().toISOString();
    const { data: arrival, error: insertError } = await svc
      .from('order_tracking_events')
      .insert({
        order_id: orderId,
        driver_id: order.driver_id,
        event_type: eventType,
        status: order.status,
        metadata: {
          stage,
          distance_meters: distanceMeters === null ? null : Math.round(distanceMeters),
          verified_by_location: distanceMeters !== null,
        },
        created_at: now,
      })
      .select('id, created_at, event_type, metadata')
      .single();
    if (insertError || !arrival) throw new Error('Failed to record arrival');

    if (stage === 'dropoff' && order.customer_id) {
      const { error: notificationError } = await svc.from('notifications').insert({
        user_id: order.customer_id,
        type: 'driver_arrived',
        title: 'Ihr Fahrer ist angekommen',
        body: `Der Fahrer wartet mit Bestellung #${order.order_number} an Ihrer Lieferadresse.`,
        data: { order_id: orderId, order_number: order.order_number, stage },
        is_read: false,
      });
      if (notificationError) logger.warn('Arrival notification failed', { orderId, error: notificationError.message });
    }

    await audit(stage === 'pickup' ? 'DRIVER_ARRIVED_PICKUP' : 'DRIVER_ARRIVED_DROPOFF', {
      severity: 'info',
      userId: ctx.auth.user.id,
      userRole: ctx.auth.user.role,
      resource: 'order',
      resourceId: orderId,
      metadata: { distance_meters: distanceMeters === null ? null : Math.round(distanceMeters) },
    });

    return ok({ arrival, duplicate: false });
  });
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180 ? parsed : null;
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
