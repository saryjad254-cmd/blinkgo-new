import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import {
  computeRestaurantMetrics,
  computeProductPerformance,
  type RestaurantOrderRow,
  type RestaurantItemRow,
} from '@/lib/analytics/restaurant-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServiceClient();
    const days = 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [orderResult, itemResult] = await Promise.all([
      db.from('orders')
        .select('id, restaurant_id, total, status, created_at, accepted_at, prepared_at, picked_up_at, delivered_at, cancelled_at, cancellation_reason')
        .gte('created_at', start.toISOString()),
      db.from('order_items')
        .select('product_id, product_name, quantity, unit_price, subtotal, product_price, price, order_id, created_at')
        .gte('created_at', start.toISOString()),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (itemResult.error) throw itemResult.error;
    const orders = orderResult.data ?? [];
    const items = itemResult.data ?? [];

    const orderRows: RestaurantOrderRow[] = orders.map((o) => ({
      id: o.id,
      restaurant_id: o.restaurant_id,
      total: o.total ?? 0,
      status: o.status,
      created_at: o.created_at,
      accepted_at: o.accepted_at,
      ready_at: o.prepared_at,
      picked_up_at: o.picked_up_at,
      delivered_at: o.delivered_at,
      cancelled_at: o.cancelled_at,
      cancellation_reason: o.cancellation_reason,
    }));

    const restaurantByOrder = new Map(orders.map((order) => [order.id, order.restaurant_id]));
    const itemRows: RestaurantItemRow[] = items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name || 'Unknown',
      quantity: i.quantity ?? 1,
      unit_price: i.unit_price ?? 0,
      total: i.subtotal ?? (Number(i.unit_price ?? i.product_price ?? i.price ?? 0) * Number(i.quantity ?? 1)),
      order_id: i.order_id,
      restaurant_id: restaurantByOrder.get(i.order_id) ?? '',
      created_at: i.created_at,
    }));

    const metrics = computeRestaurantMetrics(orderRows, itemRows);
    const products = computeProductPerformance(itemRows, orderRows.length);

    // Top performers
    const allMetrics = Array.from(metrics.values());
    const topRevenue = allMetrics
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10);
    const topRated = [...allMetrics]
      .sort((a, b) => b.sla_compliance - a.sla_compliance)
      .slice(0, 10);

    const averages = {
      avg_prep_minutes: average(allMetrics.map((m) => m.avg_prep_minutes)),
      sla_compliance: average(allMetrics.map((m) => m.sla_compliance)),
      cancel_rate: average(allMetrics.map((m) => m.cancel_rate)),
    };

    return NextResponse.json({
      ok: true,
      period: { start, days },
      total_restaurants: allMetrics.length,
      averages,
      top_revenue: topRevenue.map((m) => ({
        restaurant_id: m.restaurant_id,
        revenue: m.total_revenue,
        orders: m.completed_orders,
        cancel_rate: m.cancel_rate,
      })),
      top_sla: topRated.map((m) => ({
        restaurant_id: m.restaurant_id,
        sla_compliance: m.sla_compliance,
        avg_prep: m.avg_prep_minutes,
        orders: m.completed_orders,
      })),
      top_products: products.slice(0, 10).map((p) => ({
        product_id: p.product_id,
        product_name: p.product_name,
        restaurant_id: p.restaurant_id,
        units_sold: p.units_sold,
        revenue: p.revenue,
      })),
    });
  } catch (e) {
    console.error('[analytics/restaurant]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
