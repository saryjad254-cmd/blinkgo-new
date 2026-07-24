import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    // SECURITY: read role from public.users (authoritative) not user_metadata (mutable)
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    const role = profile?.role || 'customer';
    if (role !== 'driver' && role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const supa = createServiceClient();
    const driverId = user.id;

    // Today = midnight local
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startISO = startOfDay.toISOString();

    const { data: todaysOrders, error } = await supa
      .from('orders')
      .select('id, total, delivery_fee, tip, delivered_at, created_at')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', startISO)
      .order('delivered_at', { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const todayCount = todaysOrders?.length || 0;
    const todayEarnings = (todaysOrders || []).reduce(
      (s, o: any) => s + Number(o.delivery_fee || 0) + Number(o.tip || 0),
      0
    );

    const { count: totalCount } = await supa
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .eq('status', 'delivered');

    return NextResponse.json({
      ok: true,
      today_count: todayCount,
      today_earnings: Math.round(todayEarnings * 100) / 100,
      today_total_revenue: Math.round((todaysOrders || []).reduce((s, o: any) => s + Number(o.total || 0), 0) * 100) / 100,
      total_deliveries: totalCount || 0,
    });
  } catch (err: any) {
    console.error('[driver-stats] error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
