import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { computeDriverMetrics, recommendDriverImprovements } from '@/lib/analytics/driver-intelligence';
import type { DriverRow, DriverOrderRow } from '@/lib/analytics/driver-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServiceClient();
    const days = 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const end = new Date();

    const { data: drivers } = await db.from('drivers').select('*');
    const { data: orders } = await db.from('orders').select('*')
      .gte('created_at', start.toISOString());

    const driverRows: DriverRow[] = (drivers || []).map((d) => ({
      id: d.id,
      is_active: d.is_active ?? true,
      is_online: d.is_online ?? false,
      total_earnings: d.total_earnings ?? 0,
      total_trips: d.total_trips ?? 0,
      rating: d.rating ?? 0,
    }));

    const orderRows: DriverOrderRow[] = (orders || [])
      .filter((o) => o.driver_id)
      .map((o) => ({
        driver_id: o.driver_id,
        status: o.status,
        delivery_fee: o.delivery_fee ?? 0,
        tip: o.tip ?? 0,
        created_at: o.created_at,
        delivered_at: o.delivered_at,
        accepted_at: o.accepted_at,
        rejected_at: o.rejected_at,
      }));

    const metrics = computeDriverMetrics(driverRows, orderRows, { start, end });
    const improvements = recommendDriverImprovements(metrics);

    const activeDrivers = metrics.filter((m) => m.total_offers > 0);
    const avgAcceptance = activeDrivers.length > 0
      ? activeDrivers.reduce((s, m) => s + m.acceptance_rate, 0) / activeDrivers.length
      : 0;
    const avgEarningsPerHour = activeDrivers.length > 0
      ? activeDrivers.reduce((s, m) => s + m.earnings_per_hour, 0) / activeDrivers.length
      : 0;
    const avgUtilization = activeDrivers.length > 0
      ? activeDrivers.reduce((s, m) => s + m.utilization, 0) / activeDrivers.length
      : 0;
    const totalEarnings = metrics.reduce((s, m) => s + m.total_earnings, 0);
    const totalCompleted = metrics.reduce((s, m) => s + m.completed_deliveries, 0);

    return NextResponse.json({
      ok: true,
      period: { start, end, days },
      totals: {
        active_drivers: activeDrivers.length,
        total_earnings: totalEarnings,
        total_completed: totalCompleted,
      },
      averages: {
        acceptance_rate: avgAcceptance,
        earnings_per_hour: avgEarningsPerHour,
        utilization: avgUtilization,
      },
      top_earners: metrics
        .sort((a, b) => b.total_earnings - a.total_earnings)
        .slice(0, 10)
        .map((m) => ({
          driver_id: m.driver_id,
          earnings: m.total_earnings,
          deliveries: m.completed_deliveries,
          rating: m.rating,
        })),
      improvements: improvements.slice(0, 20),
    });
  } catch (e) {
    console.error('[analytics/driver]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
