/**
 * Driver Order Acceptance
 * ────────────────────────
 * POST /api/driver/orders/[id]/accept
 *
 * Driver-only. Atomically assigns the driver to an order if:
 *   - driver is online (per user_metadata.is_online)
 *   - order status is one of {confirmed, preparing, ready}
 *   - order has no driver_id yet (prevents double-accept race)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '@/lib/errors';
import { createDriverOfferQuote } from '@/lib/driver/offer-policy';
import { isDriverVerificationComplete } from '@/lib/driver/verification';
import { sanitizeDeliveryPreferences } from '@/lib/delivery-preferences';
import { requireFeatureFlag } from '@/lib/platform/feature-flags';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  return (await withSecurity(
    secureRoute('moderate', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => acceptOrder(ctx, params.id) as any,
  )(_req)) as unknown as NextResponse;
}

async function acceptOrder(
  ctx: { auth: { user: { id: string; role: string } } },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = ctx.auth.user;
    if (!user) throw new AuthenticationError();
    await requireFeatureFlag('dispatch.offers.enabled', {
      userId: user.id,
      role: user.role,
      activeOrder: false,
    });
    const svc = createServiceClient();

    // Check role
    const { data: profile } = await svc
      .from('users')
      .select('role,is_active,is_verified')
      .eq('id', user.id)
      .single();
    if (!profile || (profile.role !== 'driver' && profile.role !== 'admin' && profile.role !== 'super_admin' && profile.role !== 'manager')) {
      throw new AuthorizationError('Only drivers can accept orders');
    }

    // Check the server-owned operational state; user_metadata is user-editable
    // and must never authorize dispatch or order acceptance.
    const [{ data: dispatchStatus }, { data: driverProfile }, { data: driverDocuments }] = await Promise.all([
      svc.from('driver_status').select('is_online,is_on_delivery,current_order_id').eq('driver_id', user.id).maybeSingle(),
      svc.from('drivers').select('is_approved,status,vehicle_type').eq('id', user.id).maybeSingle(),
      svc.from('driver_documents').select('document_type,status,uploaded_at').eq('driver_id', user.id),
    ]);
    const evidenceComplete = driverProfile && isDriverVerificationComplete(driverProfile.vehicle_type, driverDocuments ?? []);
    if (profile.role === 'driver' && (!profile.is_active || !profile.is_verified || !driverProfile?.is_approved || driverProfile.status !== 'active' || !evidenceComplete)) {
      throw new ValidationError('Complete driver verification before accepting orders', {
        meta: { reason: 'DRIVER_VERIFICATION_REQUIRED' },
      });
    }
    if (!dispatchStatus?.is_online) {
      throw new ValidationError('Driver must be online to accept orders', {
        code: 'NOT_ONLINE',
      });
    }

    // A driver may own only one in-flight order at a time. Enforce this on
    // the server (not only in the UI) so concurrent tabs or direct API calls
    // cannot assign a second delivery to the same driver.
    const { data: activeOrder } = await svc
      .from('orders')
      .select('id, order_number, status')
      .eq('driver_id', user.id)
      .in('status', ['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
      .neq('id', orderId)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeOrder) {
      throw new ConflictError('Finish your active delivery before accepting another order', {
        code: 'ACTIVE_ORDER_EXISTS',
        meta: { active_order_id: activeOrder.id, active_order_number: activeOrder.order_number },
      });
    }

    const [{ data: offeredOrder }, { data: driverStatus }] = await Promise.all([
      svc
        .from('orders')
        .select('id, status, driver_id, accepted_at, delivery_fee, tip, customer_latitude, customer_longitude, restaurant_latitude, restaurant_longitude, restaurants:restaurant_id(latitude, longitude)')
        .eq('id', orderId)
        .maybeSingle(),
      svc
        .from('driver_status')
        .select('latitude, longitude, updated_at')
        .eq('driver_id', user.id)
        .maybeSingle(),
    ]);
    if (!offeredOrder) {
      throw new ConflictError('This order is no longer available', { code: 'ALREADY_TAKEN' });
    }
    const offerQuote = createDriverOfferQuote({
      ...offeredOrder,
      driver_latitude: driverStatus?.latitude,
      driver_longitude: driverStatus?.longitude,
    });
    if (!offerQuote.eligible) {
      throw new ValidationError('This delivery is outside the safe offer range', {
        code: 'OFFER_OUT_OF_RANGE',
        meta: { reason: offerQuote.reason, pickup_distance_km: offerQuote.pickupDistanceKm, route_distance_km: offerQuote.routeDistanceKm },
      });
    }

    // Auto-dispatch reserves a ready order for one driver before the driver
    // taps Accept. Confirming that reservation must succeed for that same
    // driver; previously this fell through to the `driver_id is null` claim
    // and returned ALREADY_TAKEN for the driver's own assignment.
    if (offeredOrder.driver_id === user.id) {
      const acceptedAt = offeredOrder.accepted_at ?? new Date().toISOString();
      const acceptedStatus = offeredOrder.status === 'ready' ? 'assigned' : offeredOrder.status;
      const { data: assignedOrder, error: assignedError } = await svc
        .from('orders')
        .update({ accepted_at: acceptedAt, status: acceptedStatus })
        .eq('id', orderId)
        .eq('driver_id', user.id)
        .in('status', ['confirmed', 'preparing', 'ready', 'assigned'])
        .select()
        .single();
      if (assignedError || !assignedOrder) {
        throw new ConflictError('Order state changed — please refresh', {
          code: 'ACCEPT_FAILED',
        });
      }

      await svc.from('driver_status').upsert({
        driver_id: user.id,
        is_online: true,
        is_on_delivery: true,
        current_order_id: orderId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'driver_id' });

      await audit('DRIVER_CONFIRMED_AUTO_ASSIGNMENT', {
        severity: 'info',
        userId: user.id,
        userRole: user.role,
        resource: 'order',
        resourceId: orderId,
      });

      const { data: assignedPreferenceRow } = await svc
        .from('order_delivery_preferences')
        .select('preferences')
        .eq('order_id', orderId)
        .maybeSingle();

      return ok({
        order: {
          ...assignedOrder,
          delivery_preferences: sanitizeDeliveryPreferences(assignedPreferenceRow?.preferences),
        },
        assignment_confirmed: true,
      });
    }

    if (offeredOrder.driver_id) {
      throw new ConflictError('This order has already been accepted by another driver', {
        code: 'ALREADY_TAKEN',
      });
    }

    // Atomic: assign driver to order only if status is one of
    // {confirmed, preparing, ready} and driver_id is null. This prevents
    // two drivers from accepting the same order.
    // Use the trusted server client after all identity, verification, online,
    // active-delivery and distance checks above. The user-scoped RLS UPDATE
    // policy cannot claim an unassigned row because its USING expression sees
    // driver_id = null; the atomic predicates below remain the race guard.
    const { data, error } = await svc
      .from('orders')
      .update({
        driver_id: user.id,
        accepted_at: new Date().toISOString(),
        ...(offeredOrder.status === 'ready' ? { status: 'assigned' } : {}),
      })
      .eq('id', orderId)
      .is('driver_id', null)
      .eq('status', offeredOrder.status)
      .select()
      .single();

    if (error) {
      console.error('[driver/accept] order update error:', error);
      if (error.code === 'PGRST116') {
        throw new ConflictError('This order has already been accepted by another driver', {
          code: 'ALREADY_TAKEN',
        });
      }
      throw new ConflictError('Could not accept this order. Please try again.', {
        code: 'ACCEPT_FAILED',
      });
    }
    if (!data) {
      throw new ConflictError('This order has already been accepted by another driver', {
        code: 'ALREADY_TAKEN',
      });
    }

    await svc.from('driver_status').upsert({
      driver_id: user.id,
      is_online: true,
      is_on_delivery: true,
      current_order_id: orderId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id' });

    await audit('DRIVER_ACCEPTED_ORDER', {
      severity: 'info',
      userId: user.id,
      userRole: user.role,
      resource: 'order',
      resourceId: orderId,
    });

    const { data: preferenceRow } = await svc
      .from('order_delivery_preferences')
      .select('preferences')
      .eq('order_id', orderId)
      .maybeSingle();

    return ok({
      order: {
        ...data,
        delivery_preferences: sanitizeDeliveryPreferences(preferenceRow?.preferences),
      },
    });
  });
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
