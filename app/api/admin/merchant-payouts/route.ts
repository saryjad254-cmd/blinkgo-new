import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { buildFinanceReconciliation, type FinanceOrder } from '@/lib/finance/reconciliation';
import { postMerchantPayoutFinancialJournal } from '@/lib/finance/ledger';
import { audit } from '@/lib/services/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAYOUT_STATUSES = new Set(['pending', 'processing', 'paid', 'failed', 'cancelled']);

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;
  const db = createServiceClient();
  const { data, error } = await db.from('merchant_payouts')
    .select('*,restaurants(name)')
    .order('period_end', { ascending: false })
    .limit(250);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, payouts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = createServiceClient();
  const payoutId = new URL(request.url).searchParams.get('id');

  if (payoutId) {
    const status = String(body.status ?? '');
    if (!PAYOUT_STATUSES.has(status)) return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 });
    const reference = String(body.payment_reference ?? '').trim();
    if (status === 'paid' && !reference) return NextResponse.json({ ok: false, error: 'payment_reference_required' }, { status: 400 });
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (reference) updates.payment_reference = reference;
    if (status === 'paid') updates.paid_at = new Date().toISOString();
    if (body.failure_reason) updates.failure_reason = String(body.failure_reason).slice(0, 500);
    const { data, error } = await db.from('merchant_payouts').update(updates).eq('id', payoutId).select().maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? 'payout_not_found' }, { status: error ? 500 : 404 });
    const ledger = status === 'paid' ? await postMerchantPayoutFinancialJournal({
      id: data.id, restaurant_id: data.restaurant_id, net_payout_cents: Number(data.net_payout_cents),
      payment_reference: data.payment_reference, paid_at: data.paid_at,
    }) : { posted: false, reason: 'not_paid' as const };
    await audit('ADMIN_CONFIG_CHANGED', { severity: 'warn', userId: auth.user.id, userRole: auth.user.role, resource: 'merchant_payout', resourceId: data.id, metadata: { status, payment_reference: reference || null } });
    return NextResponse.json({ ok: true, payout: data, ledger });
  }

  const restaurantId = String(body.restaurant_id ?? '');
  const periodStart = String(body.period_start ?? '');
  const periodEnd = String(body.period_end ?? '');
  if (!restaurantId || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) {
    return NextResponse.json({ ok: false, error: 'invalid_payout_period' }, { status: 400 });
  }
  const { data: orders, error: orderError } = await db.from('orders')
    .select('id,order_number,restaurant_id,driver_id,subtotal,delivery_fee,service_fee,tip,discount,total,status,payment_status,payment_method,created_at,restaurant_latitude,restaurant_longitude,customer_latitude,customer_longitude')
    .eq('restaurant_id', restaurantId)
    .in('status', ['delivered', 'refunded'])
    .gte('created_at', `${periodStart}T00:00:00.000Z`)
    .lte('created_at', `${periodEnd}T23:59:59.999Z`)
    .limit(10000);
  if (orderError) return NextResponse.json({ ok: false, error: orderError.message }, { status: 500 });
  const orderIds = (orders ?? []).map((order) => order.id);
  const refundsResult = orderIds.length
    ? await db.from('payment_refunds').select('order_id,refunded_amount_cents,requested_amount_cents,status').in('order_id', orderIds).limit(10000)
    : { data: [], error: null };
  if (refundsResult.error) return NextResponse.json({ ok: false, error: refundsResult.error.message }, { status: 500 });
  const reconciliation = buildFinanceReconciliation((orders ?? []) as FinanceOrder[], refundsResult.data ?? [], []);
  const { data, error } = await db.from('merchant_payouts').insert({
    restaurant_id: restaurantId, period_start: periodStart, period_end: periodEnd,
    gross_sales_cents: reconciliation.gross_sales_cents, refunds_cents: reconciliation.refunds_cents,
    commission_cents: reconciliation.commission_cents, adjustments_cents: 0,
    net_payout_cents: reconciliation.restaurant_payable_cents, order_count: reconciliation.order_count,
    status: 'pending', created_by: auth.user.id,
  }).select().maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? 'payout_create_failed' }, { status: 500 });
  await audit('ADMIN_CONFIG_CHANGED', { severity: 'info', userId: auth.user.id, userRole: auth.user.role, resource: 'merchant_payout', resourceId: data.id, metadata: { restaurant_id: restaurantId, period_start: periodStart, period_end: periodEnd, net_payout_cents: reconciliation.restaurant_payable_cents } });
  return NextResponse.json({ ok: true, payout: data }, { status: 201 });
}
