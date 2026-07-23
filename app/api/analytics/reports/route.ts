import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { computeExecutiveKPIs, computeGrowth, type OrderRow } from '@/lib/analytics/executive-kpis';
import {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  type ExecutiveReport,
} from '@/lib/analytics/executive-reports';
import { computeDriverMetrics, type DriverRow, type DriverOrderRow } from '@/lib/analytics/driver-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const period = (url.searchParams.get('period') || 'daily') as 'daily' | 'weekly' | 'monthly';

  try {
    const db = createServiceClient();
    const now = new Date();
    let start: Date, end: Date, prevStart: Date, prevEnd: Date;
    if (period === 'daily') {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      end = now;
      prevStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      prevEnd = start;
    } else if (period === 'weekly') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end = now;
      prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      prevEnd = start;
    } else {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = now;
      prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      prevEnd = start;
    }

    const { data: orders } = await db.from('orders').select('*')
      .gte('created_at', prevStart.toISOString())
      .lte('created_at', end.toISOString());
    const { data: customers } = await db.from('users').select('id, created_at').eq('role', 'customer');
    const { data: drivers } = await db.from('drivers').select('*');
    const { data: restaurants } = await db.from('restaurants').select('id, is_active');

    const allOrders = (orders || []) as OrderRow[];
    const currentOrders = allOrders.filter((o) => new Date(o.created_at) >= start);
    const previousOrders = allOrders.filter(
      (o) => new Date(o.created_at) >= prevStart && new Date(o.created_at) < start
    );

    const current = computeExecutiveKPIs(currentOrders, customers || [], drivers || [], restaurants || [], { start, end });
    const previous = computeExecutiveKPIs(previousOrders, customers || [], drivers || [], restaurants || [], { start: prevStart, end: prevEnd });
    const growth = computeGrowth(current, previous);

    let report: ExecutiveReport;
    if (period === 'weekly') {
      const driverRows: DriverRow[] = (drivers || []).map((d) => ({
        id: d.id, is_active: d.is_active ?? true, is_online: d.is_online ?? false,
        total_earnings: d.total_earnings ?? 0, total_trips: d.total_trips ?? 0, rating: d.rating ?? 0,
      }));
      const orderRows: DriverOrderRow[] = currentOrders.map((o) => ({
        driver_id: o.driver_id || '', status: o.status, delivery_fee: o.delivery_fee ?? 0,
        tip: o.tip ?? 0, created_at: o.created_at, delivered_at: o.delivered_at,
        accepted_at: o.accepted_at, rejected_at: o.rejected_at,
      }));
      const driverMetrics = computeDriverMetrics(driverRows, orderRows, { start, end });
      report = generateWeeklyReport(current, previous, driverMetrics);
    } else if (period === 'monthly') {
      report = generateMonthlyReport(current, previous);
    } else {
      report = generateDailyReport(current, previous);
    }

    return NextResponse.json({ ok: true, growth, ...report });
  } catch (e) {
    console.error('[analytics/reports]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
