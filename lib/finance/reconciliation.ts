import { COMMISSION_RATE } from '@/lib/config/fees';
import { computeEarnings } from '@/lib/services/driver-earnings';

export type FinanceOrder = {
  id: string;
  order_number?: string | null;
  restaurant_id?: string | null;
  driver_id?: string | null;
  subtotal?: string | number | null;
  delivery_fee?: string | number | null;
  service_fee?: string | number | null;
  tip?: string | number | null;
  discount?: string | number | null;
  total?: string | number | null;
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  created_at: string;
  restaurant_latitude?: string | number | null;
  restaurant_longitude?: string | number | null;
  customer_latitude?: string | number | null;
  customer_longitude?: string | number | null;
};

export type FinanceRefund = { order_id?: string | null; refunded_amount_cents?: unknown; requested_amount_cents?: unknown; status?: string | null };
export type FinancePayout = { net_payout?: unknown; status?: string | null };
export type FinanceMerchantPayout = { net_payout_cents?: unknown; status?: string | null };

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);
const integer = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

export function buildFinanceReconciliation(
  orders: FinanceOrder[],
  refunds: FinanceRefund[],
  driverPayouts: FinancePayout[],
  merchantPayouts: FinanceMerchantPayout[] = [],
) {
  const eligible = orders.filter((order) => order.status === 'delivered' || order.status === 'refunded');
  const refundByOrder = new Map<string, number>();
  for (const refund of refunds) {
    if (refund.status !== 'succeeded' || !refund.order_id) continue;
    refundByOrder.set(refund.order_id, (refundByOrder.get(refund.order_id) ?? 0) + integer(refund.refunded_amount_cents ?? refund.requested_amount_cents));
  }

  let grossSalesCents = 0;
  let refundsCents = 0;
  let restaurantPayableCents = 0;
  let driverPayableCents = 0;
  let commissionCents = 0;
  let serviceFeeCents = 0;
  let tipsCents = 0;
  const exceptions: Array<{ code: string; order_id: string; order_number: string; amount_cents: number }> = [];

  for (const order of eligible) {
    const total = cents(order.total);
    const subtotal = cents(order.subtotal);
    const discount = cents(order.discount);
    const refund = Math.min(total, refundByOrder.get(order.id) ?? (order.status === 'refunded' ? total : 0));
    const refundRatio = total > 0 ? refund / total : 0;
    const commission = Math.round(subtotal * COMMISSION_RATE * (1 - refundRatio));
    const merchantBase = Math.max(0, subtotal - discount);
    const merchantPayable = Math.max(0, Math.round(merchantBase * (1 - refundRatio)) - commission);
    const driverPayable = order.status === 'delivered' ? cents(computeEarnings(order).total) : 0;

    grossSalesCents += total;
    refundsCents += refund;
    restaurantPayableCents += merchantPayable;
    driverPayableCents += driverPayable;
    commissionCents += commission;
    serviceFeeCents += Math.round(cents(order.service_fee) * (1 - refundRatio));
    tipsCents += Math.round(cents(order.tip) * (1 - refundRatio));

    if (!['paid', 'succeeded', 'refunded', 'partially_refunded'].includes(String(order.payment_status)) && order.payment_method !== 'cash') {
      exceptions.push({ code: 'unconfirmed_payment', order_id: order.id, order_number: order.order_number ?? order.id.slice(0, 8), amount_cents: total });
    }
    if (refundByOrder.has(order.id) && refundByOrder.get(order.id)! > total) {
      exceptions.push({ code: 'refund_exceeds_order', order_id: order.id, order_number: order.order_number ?? order.id.slice(0, 8), amount_cents: refundByOrder.get(order.id)! - total });
    }
  }

  const netCollectedCents = grossSalesCents - refundsCents;
  const platformMarginCents = netCollectedCents - restaurantPayableCents - driverPayableCents;
  const driverPaidCents = driverPayouts
    .filter((payout) => payout.status === 'paid')
    .reduce((sum, payout) => sum + cents(payout.net_payout), 0);
  const driverOutstandingCents = Math.max(0, driverPayableCents - driverPaidCents);
  const restaurantPaidCents = merchantPayouts
    .filter((payout) => payout.status === 'paid')
    .reduce((sum, payout) => sum + integer(payout.net_payout_cents), 0);
  const restaurantOutstandingCents = Math.max(0, restaurantPayableCents - restaurantPaidCents);
  const allocationCents = restaurantPayableCents + driverPayableCents + platformMarginCents;

  return {
    currency: 'EUR' as const,
    order_count: eligible.length,
    gross_sales_cents: grossSalesCents,
    refunds_cents: refundsCents,
    net_collected_cents: netCollectedCents,
    restaurant_payable_cents: restaurantPayableCents,
    restaurant_paid_cents: restaurantPaidCents,
    restaurant_outstanding_cents: restaurantOutstandingCents,
    driver_payable_cents: driverPayableCents,
    driver_paid_cents: driverPaidCents,
    driver_outstanding_cents: driverOutstandingCents,
    platform_margin_cents: platformMarginCents,
    commission_cents: commissionCents,
    service_fee_cents: serviceFeeCents,
    tips_cents: tipsCents,
    allocation_cents: allocationCents,
    mismatch_cents: netCollectedCents - allocationCents,
    exceptions: exceptions.slice(0, 25),
  };
}
