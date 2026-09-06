/**
 * Coupons Repository
 * ─────────────────
 * Canonical data access for the `coupons` and `coupon_usages` tables.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { NotFoundError } from '@/lib/foundation';

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order: number;
  max_uses: number | null;
  current_uses: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  restaurant_id: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

const COLUMNS = 'id, code, description, discount_type, discount_value, min_order, max_uses, current_uses, valid_from, valid_until, is_active, restaurant_id, created_at, updated_at, deleted_at';

export async function findByCode(code: string): Promise<CouponRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('coupons')
        .select(COLUMNS)
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle(),
    { label: 'coupons.findByCode' },
  );
  if (error) throw error;
  return data as CouponRow | null;
}

export async function isValid(code: string, orderTotal: number): Promise<CouponRow | null> {
  const coupon = await findByCode(code);
  if (!coupon) return null;
  if (coupon.min_order && orderTotal < coupon.min_order) return null;
  if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) return null;
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) return null;
  if (new Date(coupon.valid_from) > new Date()) return null;
  return coupon;
}

export function applyDiscount(coupon: CouponRow, orderTotal: number): number {
  if (coupon.discount_type === 'percentage') {
    return Math.round((orderTotal * coupon.discount_value) / 100) / 100;
  }
  return Math.min(coupon.discount_value, orderTotal);
}

export interface ListCouponsOptions {
  restaurantId?: string;
  isActive?: boolean;
  pagination?: Pagination;
  includeDeleted?: boolean;
}

export async function list(opts: ListCouponsOptions = {}): Promise<PaginatedResult<CouponRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<CouponRow>(svc.from('coupons'), { label: 'coupons.list' });
  q.select(COLUMNS, { count: 'exact' });
  if (opts.restaurantId !== undefined) q.eq('restaurant_id', opts.restaurantId);
  if (opts.isActive !== undefined) q.eq('is_active', opts.isActive);
  if (!opts.includeDeleted) q.excludeDeleted();
  q.orderBy('created_at', 'desc');
  if (opts.pagination) q.paginate(opts.pagination);
  else q.limit(50);
  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

export async function incrementUsage(id: string): Promise<CouponRow> {
  const svc = createServiceClient();
  // Read current count, then update atomically
  const { data: current, error: readErr } = await dbCall(
    () => svc.from('coupons').select('current_uses').eq('id', id).maybeSingle(),
    { label: 'coupons.incrementUsage.read' },
  );
  if (readErr) throw readErr;
  const currentUses = ((current as { current_uses: number } | null)?.current_uses ?? 0) + 1;
  const { data, error } = await dbCall(
    () =>
      svc
        .from('coupons')
        .update({ current_uses: currentUses })
        .eq('id', id)
        .select(COLUMNS)
        .single(),
    { label: 'coupons.incrementUsage' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Coupon');
  return data as CouponRow;
}

export interface CouponUsageRow {
  id: string;
  coupon_id: string;
  customer_id: string;
  order_id: string;
  discount_amount: number;
  created_at: string;
}

export async function recordUsage(input: { couponId: string; customerId: string; orderId: string; discountAmount: number }): Promise<CouponUsageRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('coupon_usages')
        .insert({
          coupon_id: input.couponId,
          customer_id: input.customerId,
          order_id: input.orderId,
          discount_amount: input.discountAmount,
          created_at: new Date().toISOString(),
        })
        .select('id, coupon_id, customer_id, order_id, discount_amount, created_at')
        .single(),
    { label: 'coupons.recordUsage' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Coupon usage');
  return data as CouponUsageRow;
}
