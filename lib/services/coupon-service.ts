/**
 * CouponService
 * ─────────────
 * Business logic for coupons. Validates codes against rules and applies discounts.
 * Uses the existing public.coupons table schema:
 *   id, code, type ('percentage' | 'fixed'), value, min_order_amount,
 *   max_discount, usage_limit, usage_count, start_date, end_date, is_active,
 *   restaurant_id
 */

import { createServiceClient } from '@/lib/supabase/service';
import { AppError, NotFoundError, ValidationError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_delivery';
  value: number;
  description?: string;
  min_order_amount: number;
  max_discount: number | null;
  usage_limit: number | null;
  usage_count: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  restaurant_id: string | null;
}

export interface CouponValidation {
  valid: boolean;
  coupon?: Coupon;
  discount?: number;
  error?: string;
}

export class CouponService {
  /**
   * Validate a coupon code and compute the discount for a given order amount.
   * Does NOT increment use count (that's done in recordUse()).
   */
  static async validate(code: string, orderAmount: number, restaurantId?: string): Promise<CouponValidation> {
    if (!code || code.length < 2) {
      return { valid: false, error: 'INVALID_CODE' };
    }
    const svc = createServiceClient();
    const { data: coupon, error } = await svc
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      logger.error('Coupon lookup failed', { code }, error);
      return { valid: false, error: 'LOOKUP_FAILED' };
    }
    if (!coupon) {
      return { valid: false, error: 'NOT_FOUND' };
    }
    // Check dates
    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) return { valid: false, error: 'NOT_STARTED' };
    if (coupon.end_date && new Date(coupon.end_date) < now) return { valid: false, error: 'EXPIRED' };
    // Check usage limit
    if (coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit) {
      return { valid: false, error: 'USAGE_LIMIT_REACHED' };
    }
    // Check min order
    if (coupon.min_order_amount > orderAmount) {
      return { valid: false, error: 'MIN_ORDER_NOT_MET' };
    }
    // Check restaurant scope
    if (coupon.restaurant_id && restaurantId && coupon.restaurant_id !== restaurantId) {
      return { valid: false, error: 'NOT_FOR_RESTAURANT' };
    }
    // Compute discount
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = (orderAmount * Number(coupon.value)) / 100;
      if (coupon.max_discount != null) {
        discount = Math.min(discount, Number(coupon.max_discount));
      }
    } else if (coupon.type === 'fixed') {
      discount = Number(coupon.value);
    } else if (coupon.type === 'free_delivery') {
      discount = 3.99; // standard delivery fee
    }
    discount = Math.min(discount, orderAmount);
    return { valid: true, coupon, discount: Number(discount.toFixed(2)) };
  }

  /**
   * List available coupons for a given restaurant (or all site-wide).
   */
  static async listAvailable(restaurantId?: string): Promise<Coupon[]> {
    const svc = createServiceClient();
    const now = new Date().toISOString();
    let q = svc
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now);
    if (restaurantId) {
      q = q.or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId}`);
    } else {
      q = q.is('restaurant_id', null);
    }
    const { data } = await q.order('created_at', { ascending: false }).limit(20);
    return (data ?? []) as unknown as Coupon[];
  }

  /**
   * List all coupons (admin only).
   */
  static async listAll(): Promise<Coupon[]> {
    const svc = createServiceClient();
    const { data } = await svc
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    return (data ?? []) as unknown as Coupon[];
  }

  /**
   * Create a new coupon (admin only).
   * Maps our service-layer input to the existing schema column names.
   */
  static async create(input: {
    code: string;
    type?: 'percentage' | 'fixed' | 'free_delivery';
    value?: number;
    min_order_amount?: number;
    max_discount?: number;
    usage_limit?: number | null;
    description?: string;
    starts_at?: string;
    ends_at?: string;
    is_active?: boolean;
    restaurant_id?: string | null;
  }): Promise<Coupon> {
    if (!input.code || input.code.length < 2) throw new ValidationError('Code is required');
    if (!input.value && input.value !== 0) throw new ValidationError('Discount value is required');
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('coupons')
      .insert({
        code: input.code.toUpperCase(),
        type: input.type ?? 'percentage',
        value: input.value,
        min_order_amount: input.min_order_amount ?? 0,
        max_discount: input.max_discount ?? null,
        usage_limit: input.usage_limit ?? null,
        restaurant_id: input.restaurant_id ?? null,
        start_date: input.starts_at ?? new Date().toISOString(),
        end_date: input.ends_at ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: input.is_active ?? true,
      })
      .select('*')
      .single();
    if (error || !data) {
      if (error?.code === '23505') throw new ConflictError('Coupon code already exists');
      logger.error('Coupon create failed', { code: input.code }, error);
      throw new AppError('Failed to create coupon', { statusCode: 500, cause: error });
    }
    return data as unknown as Coupon;
  }

  /**
   * Delete a coupon (admin only).
   */
  static async delete(couponId: string): Promise<boolean> {
    const svc = createServiceClient();
    const { error } = await svc.from('coupons').delete().eq('id', couponId);
    return !error;
  }
}
