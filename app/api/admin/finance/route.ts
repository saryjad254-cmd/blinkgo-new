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

    // Get all delivered orders
    const { data: orders, error } = await svc
      .from('orders')
      .select('id, order_number, total, delivery_fee, tip, status, created_at, customer_id, driver_id, restaurant_id, restaurants(name)')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw error;

    const now = new Date();
    const days = 30;
    const series: { date: string; revenue: number; orders: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);

      let dayRevenue = 0;
      let dayOrders = 0;
      for (const o of orders ?? []) {
        const od = new Date(o.created_at);
        if (od >= d && od < end) {
          if (o.status === 'delivered') {
            dayRevenue += Number(o.total) || 0;
            dayOrders++;
          }
        }
      }
      series.push({
        date: d.toISOString().slice(0, 10),
        revenue: Number(dayRevenue.toFixed(2)),
        orders: dayOrders,
      });
    }

    // Driver earnings breakdown
    const driverEarnings: Record<string, { name?: string; earnings: number; deliveries: number }> = {};
    for (const o of orders ?? []) {
      if (o.status === 'delivered' && o.driver_id) {
        const id = o.driver_id;
        if (!driverEarnings[id]) driverEarnings[id] = { earnings: 0, deliveries: 0 };
        driverEarnings[id].earnings += Number(o.delivery_fee ?? 0) * 0.8 + Number(o.tip ?? 0);
        driverEarnings[id].deliveries += 1;
      }
    }

    // Restaurant earnings breakdown
    const restaurantEarnings: Record<string, { name?: string; revenue: number; orders: number }> = {};
    for (const o of orders ?? []) {
      if (o.status === 'delivered' && o.restaurant_id) {
        const id = o.restaurant_id;
        if (!restaurantEarnings[id]) restaurantEarnings[id] = { revenue: 0, orders: 0 };
        restaurantEarnings[id].revenue += Number(o.total) || 0;
        restaurantEarnings[id].orders += 1;
        restaurantEarnings[id].name = (o as any).restaurants?.name;
      }
    }

    // Top restaurants by revenue
    const topRestaurants = Object.entries(restaurantEarnings)
      .map(([id, v]) => ({ id, ...v, revenue: Number(v.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Commission
    const COMMISSION_RATE = 0.15;
    const totalRevenue = series.reduce((s, d) => s + d.revenue, 0);
    const platformCommission = totalRevenue * COMMISSION_RATE;

    return NextResponse.json({
      ok: true,
      series,
      topRestaurants,
      platformCommission: Number(platformCommission.toFixed(2)),
      commissionRate: COMMISSION_RATE,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      driverCount: Object.keys(driverEarnings).length,
      restaurantCount: Object.keys(restaurantEarnings).length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
