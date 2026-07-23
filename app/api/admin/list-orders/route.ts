/**
 * Admin: List all recent orders with full details (debug)
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getApiUserWithRole } from '@/lib/auth-helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await getApiUserWithRole();
    if (!auth || auth.profile?.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, driver_id, restaurant_id, customer_id, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, orders: data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
