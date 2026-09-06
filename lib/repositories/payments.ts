/**
 * Payments Repository
 * ──────────────────
 * Canonical data access for the `payments` and `refunds` tables.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { NotFoundError } from '@/lib/foundation';

export interface PaymentRow {
  id: string;
  order_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  method: 'cash' | 'card' | 'stripe' | 'paypal' | 'sepa';
  status: 'pending' | 'processing' | 'completed' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  paid_at: string | null;
  failed_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

const COLUMNS = 'id, order_id, customer_id, amount, currency, method, stripe_payment_intent_id, stripe_charge_id, status, paid_at, failed_reason, metadata, created_at';

export async function findById(id: string): Promise<PaymentRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from('payments').select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'payments.findById' },
  );
  if (error) throw error;
  return data as PaymentRow | null;
}

export async function findByOrderId(orderId: string): Promise<PaymentRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from('payments').select(COLUMNS).eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    { label: 'payments.findByOrderId' },
  );
  if (error) throw error;
  return data as PaymentRow | null;
}

export async function findByProviderId(providerPaymentId: string): Promise<PaymentRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from('payments').select(COLUMNS).or(`stripe_payment_intent_id.eq.${providerPaymentId},stripe_charge_id.eq.${providerPaymentId}`).maybeSingle(),
    { label: 'payments.findByProviderId' },
  );
  if (error) throw error;
  return data as PaymentRow | null;
}

export async function create(input: Partial<PaymentRow>): Promise<PaymentRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('payments')
        .insert({
          ...input,
          status: input.status ?? 'pending',
          created_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single(),
    { label: 'payments.create' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Payment (after insert)');
  return data as PaymentRow;
}

export async function updateStatus(id: string, status: PaymentRow['status'], extra: Partial<PaymentRow> = {}): Promise<PaymentRow> {
  const svc = createServiceClient();
  const patch: Record<string, unknown> = { status, ...extra };
  if (status === 'completed' || status === 'succeeded') patch.paid_at = new Date().toISOString();
  const { data, error } = await dbCall(
    () => svc.from('payments').update(patch).eq('id', id).select(COLUMNS).single(),
    { label: 'payments.updateStatus' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Payment');
  return data as PaymentRow;
}

export async function list(opts: { orderId?: string; status?: PaymentRow['status']; pagination?: Pagination } = {}): Promise<PaginatedResult<PaymentRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<PaymentRow>(svc.from('payments'), { label: 'payments.list' });
  q.select(COLUMNS, { count: 'exact' });
  if (opts.orderId) q.eq('order_id', opts.orderId);
  if (opts.status) q.eq('status', opts.status);
  q.orderBy('created_at', 'desc');
  if (opts.pagination) q.paginate(opts.pagination);
  else q.limit(20);
  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

// ── Refunds ──────────────────────────────────────────────────
export interface RefundRow {
  id: string;
  order_id: string;
  customer_id: string;
  requested_by: string;
  payment_intent_id: string;
  stripe_refund_id: string | null;
  requested_amount_cents: number;
  refunded_amount_cents: number;
  currency: string;
  reason: string;
  status: 'requested' | 'validating' | 'submitted' | 'pending' | 'succeeded' | 'failed' | 'canceled' | 'requires_review';
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export async function createRefund(input: Partial<RefundRow>): Promise<RefundRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('payment_refunds')
        .insert({
          ...input,
          status: input.status ?? 'requested',
          created_at: new Date().toISOString(),
        })
        .select('id, order_id, customer_id, requested_by, payment_intent_id, stripe_refund_id, requested_amount_cents, refunded_amount_cents, currency, reason, status, idempotency_key, metadata, created_at, updated_at, completed_at')
        .single(),
    { label: 'payments.createRefund' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Refund');
  return data as RefundRow;
}
