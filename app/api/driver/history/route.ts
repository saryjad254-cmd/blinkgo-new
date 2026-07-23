/**
 * Driver order history.
 * Returns up to 500 most recent orders for the authenticated driver.
 * Includes both delivered and cancelled orders.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const svc = createServiceClient();
    const { data: orders, error } = await svc
      .from('orders')
      .select('id, order_number, status, total, tip, delivery_fee, created_at, delivered_at, cancelled_at, customer_id, restaurants(id, name)')
      .eq('driver_id', user.id)
      .in('status', ['delivered', 'cancelled', 'picked_up', 'ready'])
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) {
      return fail(error.message);
    }
    return ok({ orders: orders ?? [] });
  });
}
