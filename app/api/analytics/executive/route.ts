import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { computeExecutiveKPIs, computeGrowth } from '@/lib/analytics/executive-kpis';
import type { OrderRow } from '@/lib/analytics/executive-kpis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const period = url.searchParams.get('period') || '30d';
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const end = new Date();
  const prevStart = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000);
  const prevEnd = start;

  try {
    const db = createServiceClient();

    const { data: orders } = await db.from('orders').select('*')
      .gte('created_at', prevStart.toISOString())
      .lte('created_at', end.toISOString());

    const { data: customers } = await db.from('users').select('id, created_at')
      .eq('role', 'customer');

    const { data: drivers } = await db.from('drivers').select('id, is_active');

    const { data: restaurants } = await db.from('restaurants').select('id, is_active');

    const allOrders = (orders || []) as OrderRow[];
    const currentOrders = allOrders.filter((o) => new Date(o.created_at) >= start);
    const previousOrders = allOrders.filter(
      (o) => new Date(o.created_at) >= prevStart && new Date(o.created_at) < start
    );

    const current = computeExecutiveKPIs(currentOrders, customers || [], drivers || [], restaurants || [], {
      start,
      end,
    });
    const previous = computeExecutiveKPIs(previousOrders, customers || [], drivers || [], restaurants || [], {
      start: prevStart,
      end: prevEnd,
    });

    const growth = computeGrowth(current, previous);

    return NextResponse.json({
      ok: true,
      period: { start, end, days },
      current,
      previous,
      growth,
    });
  } catch (e) {
    console.error('[analytics/executive]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
