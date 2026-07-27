import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { computeHeatmap, computeSupplyDemandTimeseries } from '@/lib/analytics/marketplace-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServiceClient();
    const days = 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data: orders } = await db.from('orders').select('*')
      .gte('created_at', start.toISOString());

    const { data: restaurants } = await db.from('restaurants').select('id, is_active, lat, lng');
    const { data: drivers } = await db.from('drivers').select('id, is_active, is_online');

    // Compute heatmap from order delivery coordinates (fall back to 0,0 if missing)
    const orderPoints = (orders || []).map((o) => ({
      lat: o.delivery_lat ?? 50.83, // Bonn area default
      lng: o.delivery_lng ?? 6.97,
      total: o.total ?? 0,
      created_at: o.created_at,
    }));

    const heatmap = computeHeatmap(orderPoints);
    const supplyDemand = computeSupplyDemandTimeseries(
      orderPoints.map((o) => ({ created_at: o.created_at, restaurant_id: o.lat.toString() })),
      (drivers || [])
        .filter((d) => d.is_online)
        .map((d) => ({ id: d.id, online_at: new Date().toISOString() })),
      60
    );

    const totalSupply = (drivers || []).filter((d) => d.is_online).length;
    const totalDemand = (orders || []).length;
    const ratio = totalSupply > 0 ? totalDemand / totalSupply : 0;

    return NextResponse.json({
      ok: true,
      period: { start, days },
      supply_demand: {
        total_demand: totalDemand,
        total_supply: totalSupply,
        ratio,
        status: ratio > 2 ? 'undersupply' : ratio < 0.5 ? 'oversupply' : 'balanced',
      },
      heatmap: heatmap.slice(0, 100),
      timeseries: supplyDemand.slice(-48), // last 48 hours
      recommendations: ratio > 2
        ? ['Activate surge pricing', 'Send push notification to inactive drivers', 'Recruit drivers in this zone']
        : ratio < 0.5
        ? ['Reduce driver shifts', 'Boost marketing to drive demand', 'Pause new driver recruitment']
        : ['Maintain current supply', 'Monitor hourly trends'],
    });
  } catch (e) {
    console.error('[analytics/marketplace]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
