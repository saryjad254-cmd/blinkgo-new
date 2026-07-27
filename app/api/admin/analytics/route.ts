import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;

  try {
    const svc = createServiceClient();

    // Last 14 days order activity
    const { data: orders } = await svc
      .from('orders')
      .select('id, status, total, created_at, driver_id, customer_id, restaurant_id')
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });

    // Hourly distribution (when do customers order most?)
    const hourly = new Array(24).fill(0);
    const dayOfWeek = new Array(7).fill(0);
    for (const o of orders ?? []) {
      const d = new Date(o.created_at);
      hourly[d.getHours()]++;
      dayOfWeek[d.getDay()]++;
    }

    // Status distribution
    const statusDist: Record<string, number> = {};
    for (const o of orders ?? []) {
      statusDist[o.status] = (statusDist[o.status] ?? 0) + 1;
    }

    // Daily series
    const series: { date: string; orders: number; revenue: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      let dayOrders = 0;
      let dayRevenue = 0;
      for (const o of orders ?? []) {
        const od = new Date(o.created_at);
        if (od >= d && od < end) {
          dayOrders++;
          if (o.status === 'delivered') dayRevenue += Number(o.total) || 0;
        }
      }
      series.push({
        date: d.toISOString().slice(5, 10),
        orders: dayOrders,
        revenue: Number(dayRevenue.toFixed(2)),
      });
    }

    // Average order value
    const delivered = (orders ?? []).filter((o) => o.status === 'delivered');
    const aov = delivered.length > 0
      ? delivered.reduce((s, o) => s + Number(o.total || 0), 0) / delivered.length
      : 0;

    // Customer retention
    const { data: users } = await svc
      .from('users')
      .select('id, last_login_at, created_at, role')
      .eq('role', 'customer');
    const activeCustomers = (users ?? []).filter(
      (u) => u.last_login_at && new Date(u.last_login_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).length;

    return NextResponse.json({
      ok: true,
      hourly,
      dayOfWeek,
      statusDist,
      series,
      aov: Number(aov.toFixed(2)),
      activeCustomers,
      totalCustomers: users?.length ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
