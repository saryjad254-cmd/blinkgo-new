import { COMMISSION_RATE } from '@/lib/config/fees';
import { computeEarnings } from '@/lib/services/driver-earnings';
import { logger } from '@/lib/logging';
import { createServiceClient } from '@/lib/supabase/service';

type OrderJournalInput = {
  id: string; order_number?: string | null; customer_id?: string | null; restaurant_id?: string | null; driver_id?: string | null;
  subtotal?: string | number | null; delivery_fee?: string | number | null; service_fee?: string | number | null;
  tip?: string | number | null; discount?: string | number | null; total?: string | number | null;
  payment_method?: string | null; payment_status?: string | null; created_at?: string | null;
  restaurant_latitude?: string | number | null; restaurant_longitude?: string | number | null;
  customer_latitude?: string | number | null; customer_longitude?: string | number | null;
};

export type JournalLine = { account_code: string; debit_cents: number; credit_cents: number; owner_type?: 'customer' | 'restaurant' | 'driver' | 'platform'; owner_id?: string; memo: string };
const cents = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));

export function buildOrderJournalLines(order: OrderJournalInput): JournalLine[] {
  const total = cents(order.total);
  const subtotal = cents(order.subtotal);
  const discount = Math.min(subtotal, cents(order.discount));
  const merchantBase = Math.max(0, subtotal - discount);
  const commission = Math.min(merchantBase, Math.round(subtotal * COMMISSION_RATE));
  const merchantPayable = merchantBase - commission;
  const serviceFee = cents(order.service_fee);
  const driverPayable = cents(computeEarnings(order).total);
  const knownCredits = merchantPayable + commission + serviceFee + driverPayable;
  const platformRemainder = total - knownCredits;
  const cashAccount = order.payment_method === 'cash' && order.payment_status === 'paid'
    ? 'cash_cod'
    : ['paid', 'succeeded'].includes(String(order.payment_status))
      ? 'cash_stripe'
      : 'customer_receivable';

  const lines: JournalLine[] = [{ account_code: cashAccount, debit_cents: total, credit_cents: 0, ...(order.customer_id ? { owner_type: 'customer' as const, owner_id: order.customer_id } : {}), memo: 'Customer order value' }];
  if (platformRemainder < 0) lines.push({ account_code: 'promotions_expense', debit_cents: Math.abs(platformRemainder), credit_cents: 0, memo: 'Courier or promotion subsidy' });
  if (merchantPayable > 0) lines.push({ account_code: 'merchant_payable', debit_cents: 0, credit_cents: merchantPayable, ...(order.restaurant_id ? { owner_type: 'restaurant' as const, owner_id: order.restaurant_id } : {}), memo: 'Merchant net payable' });
  if (driverPayable > 0) lines.push({ account_code: 'driver_payable', debit_cents: 0, credit_cents: driverPayable, ...(order.driver_id ? { owner_type: 'driver' as const, owner_id: order.driver_id } : {}), memo: 'Courier delivery and tip payable' });
  if (commission > 0) lines.push({ account_code: 'platform_commission_revenue', debit_cents: 0, credit_cents: commission, memo: 'Platform commission' });
  if (serviceFee > 0) lines.push({ account_code: 'service_fee_revenue', debit_cents: 0, credit_cents: serviceFee, memo: 'Customer service fee' });
  if (platformRemainder > 0) lines.push({ account_code: 'delivery_fee_revenue', debit_cents: 0, credit_cents: platformRemainder, memo: 'Delivery fee remainder' });
  return lines;
}

export async function postOrderFinancialJournal(orderId: string, overrides?: { paymentStatus?: string; paymentMethod?: string }) {
  const db = createServiceClient();
  const { data: order, error } = await db.from('orders')
    .select('id,order_number,customer_id,restaurant_id,driver_id,subtotal,delivery_fee,service_fee,tip,discount,total,payment_method,payment_status,created_at,restaurant_latitude,restaurant_longitude,customer_latitude,customer_longitude')
    .eq('id', orderId).maybeSingle();
  if (error || !order) {
    logger.warn('finance.order_journal_order_unavailable', { orderId, error: error?.message });
    return { posted: false, reason: 'order_unavailable' } as const;
  }
  const journalOrder = {
    ...order,
    payment_status: overrides?.paymentStatus ?? order.payment_status,
    payment_method: overrides?.paymentMethod ?? order.payment_method,
  };
  const lines = buildOrderJournalLines(journalOrder);
  const debitCents = lines.reduce((sum, line) => sum + line.debit_cents, 0);
  const creditCents = lines.reduce((sum, line) => sum + line.credit_cents, 0);
  if (debitCents !== creditCents || debitCents <= 0) {
    logger.error('finance.order_journal_unbalanced', { orderId, debitCents, creditCents });
    return { posted: false, reason: 'unbalanced' } as const;
  }
  const { data, error: postError } = await db.rpc('post_financial_journal', {
    p_source_type: 'order', p_source_id: order.id, p_idempotency_key: `order:${order.id}:v1`,
    p_description: `Order ${order.order_number ?? order.id}`, p_occurred_at: order.created_at ?? new Date().toISOString(),
    p_lines: lines, p_metadata: { schema_version: 1, order_number: order.order_number ?? null, payment_status: journalOrder.payment_status }, p_created_by: null,
  });
  if (postError) {
    logger.warn('finance.order_journal_post_failed', { orderId, error: postError.message });
    return { posted: false, reason: 'post_failed' } as const;
  }
  return { posted: true, journal_id: String(data) } as const;
}

export function buildDriverPayoutJournalLines(payout: { driver_id: string; net_payout: string | number }): JournalLine[] {
  const amount = cents(payout.net_payout);
  return [
    { account_code: 'driver_payable', debit_cents: amount, credit_cents: 0, owner_type: 'driver', owner_id: payout.driver_id, memo: 'Settle courier payable' },
    { account_code: 'cash_bank', debit_cents: 0, credit_cents: amount, memo: 'Courier bank payout' },
  ];
}

export async function postDriverPayoutFinancialJournal(payout: {
  id: string; driver_id: string; net_payout: string | number; payment_reference?: string | null; paid_at?: string | null;
}) {
  const lines = buildDriverPayoutJournalLines(payout);
  if (lines[0].debit_cents <= 0) return { posted: false, reason: 'zero_amount' } as const;
  const db = createServiceClient();
  const { data, error } = await db.rpc('post_financial_journal', {
    p_source_type: 'driver_payout', p_source_id: payout.id, p_idempotency_key: `driver_payout:${payout.id}:v1`,
    p_description: `Driver payout ${payout.payment_reference ?? payout.id}`,
    p_occurred_at: payout.paid_at ?? new Date().toISOString(), p_lines: lines,
    p_metadata: { schema_version: 1, payment_reference: payout.payment_reference ?? null }, p_created_by: null,
  });
  if (error) {
    logger.warn('finance.driver_payout_journal_post_failed', { payoutId: payout.id, error: error.message });
    return { posted: false, reason: 'post_failed' } as const;
  }
  return { posted: true, journal_id: String(data) } as const;
}

export function buildRefundJournalLines(order: OrderJournalInput, refundAmountCents: number): JournalLine[] {
  const total = cents(order.total);
  const amount = Math.min(total, Math.max(0, Math.round(refundAmountCents)));
  if (amount <= 0 || total <= 0) return [];
  const originalCredits = buildOrderJournalLines(order).filter((line) => line.credit_cents > 0 && line.account_code !== 'driver_payable');
  const debitLines: JournalLine[] = [];
  let allocated = 0;
  for (const line of originalCredits) {
    const debit = Math.min(amount - allocated, Math.floor(line.credit_cents * amount / total));
    if (debit <= 0) continue;
    debitLines.push({ ...line, debit_cents: debit, credit_cents: 0, memo: `Refund reversal: ${line.memo}` });
    allocated += debit;
  }
  if (allocated < amount) {
    debitLines.push({ account_code: 'promotions_expense', debit_cents: amount - allocated, credit_cents: 0, memo: 'Refund cost including protected courier compensation' });
  }
  return [...debitLines, { account_code: 'cash_stripe', debit_cents: 0, credit_cents: amount, memo: 'Customer refund paid' }];
}

export async function postRefundFinancialJournal(refund: { id: string; order_id: string; refunded_amount_cents: number; completed_at?: string | null }) {
  const db = createServiceClient();
  const { data: order, error: orderError } = await db.from('orders')
    .select('id,order_number,customer_id,restaurant_id,driver_id,subtotal,delivery_fee,service_fee,tip,discount,total,payment_method,payment_status,created_at,restaurant_latitude,restaurant_longitude,customer_latitude,customer_longitude')
    .eq('id', refund.order_id).maybeSingle();
  if (orderError || !order) {
    logger.warn('finance.refund_journal_order_unavailable', { refundId: refund.id, orderId: refund.order_id, error: orderError?.message });
    return { posted: false, reason: 'order_unavailable' } as const;
  }
  const lines = buildRefundJournalLines(order, refund.refunded_amount_cents);
  if (lines.length < 2) return { posted: false, reason: 'zero_amount' } as const;
  const { data, error } = await db.rpc('post_financial_journal', {
    p_source_type: 'refund', p_source_id: refund.id, p_idempotency_key: `refund:${refund.id}:v1`,
    p_description: `Refund for order ${order.order_number ?? order.id}`,
    p_occurred_at: refund.completed_at ?? new Date().toISOString(), p_lines: lines,
    p_metadata: { schema_version: 1, order_id: order.id, refunded_amount_cents: refund.refunded_amount_cents }, p_created_by: null,
  });
  if (error) {
    logger.warn('finance.refund_journal_post_failed', { refundId: refund.id, error: error.message });
    return { posted: false, reason: 'post_failed' } as const;
  }
  return { posted: true, journal_id: String(data) } as const;
}

export function buildMerchantPayoutJournalLines(payout: { restaurant_id: string; net_payout_cents: number }): JournalLine[] {
  const amount = Math.max(0, Math.round(Number(payout.net_payout_cents) || 0));
  return [
    { account_code: 'merchant_payable', debit_cents: amount, credit_cents: 0, owner_type: 'restaurant', owner_id: payout.restaurant_id, memo: 'Settle merchant payable' },
    { account_code: 'cash_bank', debit_cents: 0, credit_cents: amount, memo: 'Merchant bank payout' },
  ];
}

export async function postMerchantPayoutFinancialJournal(payout: { id: string; restaurant_id: string; net_payout_cents: number; payment_reference: string; paid_at: string }) {
  const lines = buildMerchantPayoutJournalLines(payout);
  if (lines[0].debit_cents <= 0) return { posted: false, reason: 'zero_amount' } as const;
  const db = createServiceClient();
  const { data, error } = await db.rpc('post_financial_journal', {
    p_source_type: 'merchant_payout', p_source_id: payout.id, p_idempotency_key: `merchant_payout:${payout.id}:v1`,
    p_description: `Merchant payout ${payout.payment_reference}`, p_occurred_at: payout.paid_at,
    p_lines: lines, p_metadata: { schema_version: 1, payment_reference: payout.payment_reference }, p_created_by: null,
  });
  if (error) {
    logger.warn('finance.merchant_payout_journal_post_failed', { payoutId: payout.id, error: error.message });
    return { posted: false, reason: 'post_failed' } as const;
  }
  return { posted: true, journal_id: String(data) } as const;
}
