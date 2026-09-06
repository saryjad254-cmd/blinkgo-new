import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { buildFinanceReconciliation, type FinanceOrder } from '@/lib/finance/reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RestaurantRelation = { name?: string | null } | Array<{ name?: string | null }> | null;
type FinanceOrderRow = FinanceOrder & { restaurants?: RestaurantRelation };
type DriverPayoutRow = { total_payout?: number | string | null } & Record<string, unknown>;

function restaurantName(relation: RestaurantRelation | undefined) {
  return Array.isArray(relation) ? relation[0]?.name : relation?.name;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;

  try {
    const svc = createServiceClient();
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - 30);

    const [ordersResult, refundsResult, payoutsResult, merchantPayoutsResult, ledgerResult] = await Promise.all([
      svc.from('orders')
        .select('id,order_number,total,subtotal,delivery_fee,service_fee,tip,discount,status,payment_status,payment_method,created_at,delivered_at,customer_id,driver_id,restaurant_id,restaurant_latitude,restaurant_longitude,customer_latitude,customer_longitude,restaurants(name)')
        .gte('created_at', periodStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000),
      svc.from('payment_refunds')
        .select('order_id,refunded_amount_cents,requested_amount_cents,status,completed_at')
        .gte('created_at', periodStart.toISOString())
        .limit(5000),
      svc.from('driver_payouts')
        .select('total_payout,status,period_start,period_end')
        .gte('period_end', periodStart.toISOString().slice(0, 10))
        .limit(5000),
      svc.from('merchant_payouts')
        .select('id,restaurant_id,net_payout_cents,status,period_start,period_end,payment_reference,paid_at,restaurants(name)')
        .gte('period_end', periodStart.toISOString().slice(0, 10))
        .limit(5000),
      svc.from('financial_journal_reconciliation')
        .select('source_type,source_id,balanced,occurred_at')
        .gte('occurred_at', periodStart.toISOString())
        .limit(10000),
    ]);

    if (ordersResult.error) throw ordersResult.error;
    const orders = (ordersResult.data ?? []) as FinanceOrderRow[];
    const refunds = refundsResult.error ? [] : (refundsResult.data ?? []);
    const payouts = payoutsResult.error
      ? []
      : ((payoutsResult.data ?? []) as DriverPayoutRow[]).map((payout) => ({ ...payout, net_payout: payout.total_payout }));
    const merchantPayouts = merchantPayoutsResult.error ? [] : (merchantPayoutsResult.data ?? []);
    const ledgerRows = ledgerResult.error ? [] : (ledgerResult.data ?? []);
    const reconciliation = buildFinanceReconciliation(orders, refunds, payouts, merchantPayouts);

    const series: Array<{ date: string; revenue_cents: number; orders: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const start = new Date(periodEnd);
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - i);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      const dayOrders = orders.filter((order) => {
        const createdAt = new Date(order.created_at);
        return createdAt >= start && createdAt < end && ['delivered', 'refunded'].includes(String(order.status));
      });
      series.push({
        date: start.toISOString().slice(0, 10),
        revenue_cents: dayOrders.reduce((sum, order) => sum + Math.round((Number(order.total) || 0) * 100), 0),
        orders: dayOrders.length,
      });
    }

    const restaurantTotals = new Map<string, { name: string; gross_sales_cents: number; orders: number }>();
    for (const order of orders) {
      if (!order.restaurant_id || !['delivered', 'refunded'].includes(String(order.status))) continue;
      const current = restaurantTotals.get(order.restaurant_id) ?? {
        name: restaurantName(order.restaurants) ?? '—', gross_sales_cents: 0, orders: 0,
      };
      current.gross_sales_cents += Math.round((Number(order.total) || 0) * 100);
      current.orders += 1;
      restaurantTotals.set(order.restaurant_id, current);
    }

    const eligibleOrderIds = new Set(orders.filter((order) => ['delivered', 'refunded'].includes(String(order.status))).map((order) => order.id));
    const postedOrderIds = new Set(ledgerRows.filter((row) => row.source_type === 'order').map((row) => row.source_id));
    const postedOrders = [...eligibleOrderIds].filter((id) => postedOrderIds.has(id)).length;
    const unbalancedJournals = ledgerRows.filter((row) => row.balanced === false).length;
    const coveragePercent = ledgerResult.error
      ? 0
      : eligibleOrderIds.size === 0
        ? 100
        : Math.round((postedOrders / eligibleOrderIds.size) * 100);

    return NextResponse.json({
      ok: true,
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString(), timezone: 'Europe/Berlin' },
      reconciliation,
      ledger: {
        available: !ledgerResult.error,
        posted_orders: postedOrders,
        expected_orders: eligibleOrderIds.size,
        coverage_percent: coveragePercent,
        unbalanced_journals: unbalancedJournals,
        status: ledgerResult.error || coveragePercent < 100 || unbalancedJournals > 0 ? 'attention' : 'reconciled',
      },
      data_quality: {
        refunds_available: !refundsResult.error,
        payouts_available: !payoutsResult.error,
        merchant_payouts_available: !merchantPayoutsResult.error,
        notes: [
          ...(refundsResult.error ? ['refund_source_unavailable'] : []),
          ...(payoutsResult.error ? ['payout_source_unavailable'] : []),
          ...(merchantPayoutsResult.error ? ['merchant_payout_source_unavailable'] : []),
          ...(ledgerResult.error ? ['ledger_migration_not_applied'] : []),
        ],
      },
      series,
      top_restaurants: [...restaurantTotals.entries()]
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.gross_sales_cents - a.gross_sales_cents)
        .slice(0, 10),
      merchant_payouts: merchantPayouts,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 },
    );
  }
}
