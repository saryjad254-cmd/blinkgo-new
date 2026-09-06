/**
 * Driver Orders List
 * ───────────────────
 * GET /api/driver/orders?status=available|active|completed
 *
 * Returns orders relevant to the current driver:
 *  - available: orders with status in {confirmed, preparing, ready} and no driver
 *  - active: orders assigned to this driver, not yet delivered
 *  - completed: orders assigned to this driver, status = delivered
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { getApiUserFromRequest } from '@/lib/auth-helper';
import { AuthenticationError, ValidationError } from '@/lib/errors';
import { createDriverOfferQuote } from '@/lib/driver/offer-policy';
import { isDriverVerificationComplete } from '@/lib/driver/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
    async (_ctx, r) => listDriverOrders(r as NextRequest) as Promise<NextResponse<never>>,
  )(req)) as unknown as NextResponse;
}

async function listDriverOrders(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const auth = await getApiUserFromRequest(req);
    const user = auth?.user;
    if (!user || !['driver', 'admin', 'super_admin', 'manager'].includes(user.role)) throw new AuthenticationError();

    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? 'available';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);

    const svc = createServiceClient();
    if (status === 'available' && user.role === 'driver') {
      const [{ data: publicUser }, { data: driver }, { data: documents }] = await Promise.all([
        svc.from('users').select('is_active,is_verified').eq('id', user.id).maybeSingle(),
        svc.from('drivers').select('vehicle_type,is_approved,status').eq('id', user.id).maybeSingle(),
        svc.from('driver_documents').select('document_type,status,uploaded_at').eq('driver_id', user.id),
      ]);
      const evidenceComplete = driver && isDriverVerificationComplete(driver.vehicle_type, documents ?? []);
      if (!publicUser?.is_active || !publicUser.is_verified || !driver?.is_approved || driver.status !== 'active' || !evidenceComplete) {
        return ok({ orders: [], verification_required: true });
      }
    }
    let query = svc.from('orders').select(
      `id, order_number, status, total, tip, delivery_fee, fulfillment_type, created_at, accepted_at, picked_up_at, delivered_at,
       customer_latitude, customer_longitude, delivery_address, delivery_instructions,
       restaurant_id, customer_id, driver_id,
       restaurants:restaurants!orders_restaurant_id_fkey(name, address, phone, latitude, longitude),
       customer:users!orders_customer_id_fkey(name, phone)`,
    );

    if (status === 'available') {
      query = query
        .eq('fulfillment_type', 'delivery')
        .is('driver_id', null)
        .in('status', ['confirmed', 'preparing', 'ready'])
        .order('created_at', { ascending: true })
        .limit(limit);
    } else if (status === 'active') {
      query = query
        .eq('driver_id', user.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(limit);
    } else if (status === 'completed') {
      query = query
        .eq('driver_id', user.id)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(limit);
    } else {
      throw new ValidationError(`Invalid status: ${status}`);
    }

    const { data, error } = await query;
    if (error) {
      return fail(error);
    }

    let orders = data ?? [];
    if (status === 'available') {
      const { data: driverStatus } = await svc
        .from('driver_status')
        .select('latitude, longitude, updated_at')
        .eq('driver_id', user.id)
        .maybeSingle();
      orders = orders
        .map((order) => {
          const quote = createDriverOfferQuote({
            ...order,
            driver_latitude: driverStatus?.latitude,
            driver_longitude: driverStatus?.longitude,
          });
          return { ...order, driver_offer: quote };
        })
        .filter((order) => order.driver_offer.eligible)
        .sort((left, right) => left.driver_offer.score - right.driver_offer.score);
    }

    return ok({ orders });
  });
}
