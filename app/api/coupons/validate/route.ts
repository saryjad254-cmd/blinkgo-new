/**
 * Validate a coupon code for a given order amount.
 * POST /api/coupons/validate
 * Body: { code, order_amount, restaurant_id? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { CouponService } from '@/lib/services/coupon-service';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const body = await req.json().catch(() => ({}));
    const { code, order_amount, restaurant_id } = body;
    if (!code) throw new ValidationError('code required');
    if (typeof order_amount !== 'number') throw new ValidationError('order_amount must be a number');
    const result = await CouponService.validate(code, order_amount, restaurant_id);
    return ok(result);
  });
}
