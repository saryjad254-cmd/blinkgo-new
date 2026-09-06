/**
 * Driver order history.
 * Returns up to 500 most recent orders for the authenticated driver.
 * Includes both delivered and cancelled orders.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => driverHistory(ctx.auth.user.id) as any,
  )(req)) as unknown as NextResponse;
}

async function driverHistory(driverId: string): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const svc = createServiceClient();
    const { data: orders, error } = await svc
      .from('orders')
      .select('id, order_number, status, total, tip, delivery_fee, created_at, delivered_at, cancelled_at, customer_id, customer_latitude, customer_longitude, restaurant_latitude, restaurant_longitude, restaurants(id, name, latitude, longitude)')
      .eq('driver_id', driverId)
      .in('status', ['delivered', 'cancelled', 'picked_up', 'ready'])
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) {
      return fail(safeErrorMessage(error));
    }
    return ok({
      orders: (orders ?? []).map((order) => ({
        ...order,
        restaurants: Array.isArray(order.restaurants) ? order.restaurants[0] ?? null : order.restaurants,
      })),
    });
  });
}
