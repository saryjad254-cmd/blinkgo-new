import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { toSafeInt } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;

  try {
    const svc = createServiceClient();
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('q')?.toLowerCase() || '';
    const limit = toSafeInt(url.searchParams.get('limit'), 1, 200, 50);
    const offset = toSafeInt(url.searchParams.get('offset'), 0, 100000, 0);

    let query = svc
      .from('orders')
      .select(
        `
        id, order_number, status, total, delivery_fee, tip, created_at, customer_id, driver_id, restaurant_id, delivery_address, customer_latitude, customer_longitude, restaurant_latitude, restaurant_longitude,
        restaurants:restaurants!orders_restaurant_id_fkey(name, address),
        customer:users!orders_customer_id_fkey(name, email, phone)
      `,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,restaurants.name.ilike.%${search}%`,
      );
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      orders: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
