/**
 * Driver Orders List
 * ───────────────────
 * GET /api/driver/orders?status=available|active|completed
 *
 * Returns orders relevant to the current driver:
 *  - available: orders with status in {pending, confirmed, preparing, ready} and no driver
 *  - active: orders assigned to this driver, not yet delivered
 *  - completed: orders assigned to this driver, status = delivered
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { AuthenticationError, AuthorizationError, ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['confirmed', 'preparing', 'ready', 'picked_up', 'delivering'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => listDriverOrders(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function listDriverOrders(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['driver', 'admin', 'super_admin', 'manager']);
    if (!user) throw new AuthenticationError();

    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? 'available';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);

    const svc = createServiceClient();
    let query = svc.from('orders').select(
      `id, order_number, status, total, tip, delivery_fee, created_at, accepted_at, picked_up_at, delivered_at,
       customer_latitude, customer_longitude, delivery_address, delivery_instructions,
       restaurant_id, customer_id, driver_id,
       restaurants:restaurants!orders_restaurant_id_fkey(name, address, phone, latitude, longitude),
       customer:users!orders_customer_id_fkey(name, phone)`,
    );

    if (status === 'available') {
      query = query
        .is('driver_id', null)
        .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
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
      return fail(error as any);
    }

    return ok({ orders: data ?? [] });
  });
}
