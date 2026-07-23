import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { forecastTomorrow, forecastWeek, forecastMonth, type TimeSeriesPoint } from '@/lib/analytics/forecasting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const horizon = (url.searchParams.get('horizon') || 'week') as 'tomorrow' | 'week' | 'month';

  try {
    const db = createServiceClient();
    // Last 30 days hourly
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { data: orders } = await db.from('orders').select('created_at, total, status')
      .gte('created_at', start.toISOString())
      .eq('status', 'delivered');

    // Build hourly timeseries
    const buckets = new Map<number, number>();
    for (const o of orders || []) {
      const t = Math.floor(new Date(o.created_at).getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000;
      buckets.set(t, (buckets.get(t) || 0) + 1);
    }
    const series: TimeSeriesPoint[] = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ timestamp: new Date(t).toISOString(), value: v }));

    let result;
    if (horizon === 'tomorrow') {
      result = forecastTomorrow(series);
    } else if (horizon === 'month') {
      result = forecastMonth(series);
    } else {
      result = forecastWeek(series);
    }

    return NextResponse.json({ ok: true, ...result, history_points: series.length });
  } catch (e) {
    console.error('[analytics/forecast]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
