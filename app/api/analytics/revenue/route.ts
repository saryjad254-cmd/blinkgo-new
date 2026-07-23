import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import {
  detectSurgeOpportunities,
  recommendDeliveryFees,
  detectCouponAbuse,
  recommendCommissions,
  type CouponUsageRow,
} from '@/lib/analytics/revenue-optimization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServiceClient();
    const days = 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Zones - supply/demand by restaurant cluster
    const { data: restaurants } = await db.from('restaurants').select('id, is_active, monthly_revenue, monthly_orders, rating, zone_id');
    const { data: orders } = await db.from('orders').select('restaurant_id, delivery_fee, total, created_at')
      .gte('created_at', start.toISOString());

    // Aggregate by zone
    const zones = new Map<string, { demand: number; supply: number; revenue: number; avg_distance_km: number }>();
    for (const r of restaurants || []) {
      const zid = r.zone_id || 'default';
      if (!zones.has(zid)) zones.set(zid, { demand: 0, supply: 0, revenue: 0, avg_distance_km: 3 });
      zones.get(zid)!.supply += r.is_active ? 1 : 0;
    }
    for (const o of orders || []) {
      const zid = (restaurants || []).find((r) => r.id === o.restaurant_id)?.zone_id || 'default';
      if (!zones.has(zid)) zones.set(zid, { demand: 0, supply: 0, revenue: 0, avg_distance_km: 3 });
      zones.get(zid)!.demand += 1;
      zones.get(zid)!.revenue += o.total ?? 0;
    }

    const zoneArr = Array.from(zones.entries()).map(([zone_id, v]) => ({
      zone_id,
      demand: v.demand,
      supply: v.supply,
      avg_distance_km: v.avg_distance_km,
    }));

    const surgeOpportunities = detectSurgeOpportunities(zoneArr);
    const feeRecommendations = recommendDeliveryFees(zoneArr);

    // Coupon abuse (only if coupon tables exist)
    let couponAbuse: Array<{ coupon_code: string; customer_id: string; reason: string; severity: string }> = [];
    try {
      const { data: usages } = await db.from('coupon_usages').select('*').limit(500);
      if (usages) {
        const rows: CouponUsageRow[] = (usages as any[]).map((u) => ({
          coupon_code: u.coupon_code,
          customer_id: u.customer_id,
          order_id: u.order_id,
          discount_amount: u.discount_amount ?? 0,
          order_total: u.order_total ?? 0,
          created_at: u.created_at,
        }));
        couponAbuse = detectCouponAbuse(rows).map((s) => ({
          coupon_code: s.coupon_code,
          customer_id: s.customer_id,
          reason: s.reason,
          severity: s.severity,
        }));
      }
    } catch {
      // table missing
    }

    // Commission recommendations
    const commissionRecs = recommendCommissions(
      (restaurants || []).map((r) => ({
        restaurant_id: r.id,
        monthly_revenue: r.monthly_revenue ?? 0,
        monthly_orders: r.monthly_orders ?? 0,
        rating: r.rating ?? 0,
      }))
    ).slice(0, 10);

    const totalRevenue = (orders || []).reduce((s, o) => s + (o.total ?? 0), 0);
    const totalDeliveryFees = (orders || []).reduce((s, o) => s + (o.delivery_fee ?? 0), 0);

    return NextResponse.json({
      ok: true,
      period: { start, days },
      totals: {
        revenue: totalRevenue,
        delivery_fees: totalDeliveryFees,
        fee_margin: totalRevenue > 0 ? totalDeliveryFees / totalRevenue : 0,
      },
      surge_opportunities: surgeOpportunities,
      delivery_fees: feeRecommendations,
      coupon_abuse: couponAbuse.slice(0, 20),
      commission_recommendations: commissionRecs,
    });
  } catch (e) {
    console.error('[analytics/revenue]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
