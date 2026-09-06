import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import {
  computeCustomerStats,
  computeLTV,
  computeCohortRetention,
  segmentCustomers,
  predictChurn,
  computeRepeatRate,
} from '@/lib/analytics/customer-analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServiceClient();

    const [orderResult, customerResult] = await Promise.all([
      db.from('orders').select('customer_id, total, created_at'),
      db.from('users').select('id, created_at, last_order_at').eq('role', 'customer'),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (customerResult.error) throw customerResult.error;
    const orders = orderResult.data ?? [];
    const customers = customerResult.data ?? [];

    const orderRows = orders.map((o) => ({
      customer_id: o.customer_id,
      total: o.total || 0,
      created_at: o.created_at,
    }));

    const stats = computeCustomerStats(orderRows);
    const ltv = computeLTV(stats);
    const cohorts = computeCohortRetention(orderRows);
    const segments = segmentCustomers(stats);
    const churnPredictions = predictChurn(stats);
    const repeatRate = computeRepeatRate(stats);

    // Top 10 VIP customers
    const vip = stats
      .filter((s) => s.total_spent >= 200)
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10);

    const segmentCounts = {
      vip: segments.vip.length,
      active: segments.active.length,
      at_risk: segments.at_risk.length,
      lapsed: segments.lapsed.length,
      new: segments.new.length,
    };

    return NextResponse.json({
      ok: true,
      total_customers: customers.length,
      repeat_rate: repeatRate,
      avg_ltv: ltv.avg_ltv,
      total_ltv: ltv.total_ltv,
      segments: segmentCounts,
      cohorts: cohorts.slice(-6), // last 6 cohorts
      top_vip: vip.map((v) => ({
        customer_id: v.customer_id,
        total_spent: v.total_spent,
        order_count: v.order_count,
        avg_basket: v.avg_basket,
      })),
      at_risk_count: segments.at_risk.length,
      high_churn_count: Array.from(churnPredictions.values()).filter((p) => p > 0.7).length,
    });
  } catch (e) {
    console.error('[analytics/customer]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
