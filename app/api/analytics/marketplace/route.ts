import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { computeHeatmap, computeSupplyDemandTimeseries } from '@/lib/analytics/marketplace-health';
import { validateLocation } from '@/lib/driver/dispatch-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServiceClient();
    const days = 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [orderResult, driverResult] = await Promise.all([
      db.from('orders')
        .select('restaurant_id, customer_latitude, customer_longitude, total, created_at')
        .gte('created_at', start.toISOString()),
      db.from('driver_status').select('driver_id, is_online, updated_at').eq('is_online', true),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (driverResult.error) throw driverResult.error;
    const orders = orderResult.data ?? [];
    const onlineDrivers = driverResult.data ?? [];

    // Missing coordinates are excluded; analytics must never invent demand locations.
    const orderPoints = orders.flatMap((order) => {
      const location = validateLocation(order.customer_latitude, order.customer_longitude);
      return location.ok ? [{
        lat: location.lat,
        lng: location.lng,
        total: Number(order.total) || 0,
        created_at: order.created_at,
        restaurant_id: order.restaurant_id,
      }] : [];
    });

    const heatmap = computeHeatmap(orderPoints);
    const supplyDemand = computeSupplyDemandTimeseries(
      orders.map((order) => ({ created_at: order.created_at, restaurant_id: order.restaurant_id })),
      onlineDrivers.map((driver) => ({ id: driver.driver_id, online_at: driver.updated_at })),
      60
    );

    const totalSupply = onlineDrivers.length;
    const totalDemand = orders.length;
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
      geolocated_orders: orderPoints.length,
      ungeolocated_orders: Math.max(0, orders.length - orderPoints.length),
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
