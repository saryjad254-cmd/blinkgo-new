/**
 * Admin: List all recent orders with full details (debug)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, driver_id, restaurant_id, customer_id, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });

    // Keep the response contract intentionally narrow even if an emulator or a
    // future database adapter returns more columns than requested. Order list
    // endpoints must never serialize joined user/auth records by accident.
    const orders = (data ?? []).map((order) => ({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      driver_id: order.driver_id,
      restaurant_id: order.restaurant_id,
      customer_id: order.customer_id,
      created_at: order.created_at,
      updated_at: order.updated_at,
    }));

    return NextResponse.json({ ok: true, orders });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}
