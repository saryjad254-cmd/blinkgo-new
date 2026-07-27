/**
 * Validate a coupon code for a given order amount.
 * POST /api/coupons/validate
 * Body: { code, order_amount, restaurant_id? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { CouponService } from '@/lib/services/coupon-service';
import { ValidationError } from '@/lib/errors';
import { requireApiRole } from '@/lib/auth-helper';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // F8 (qa-1): require auth + rate limit to prevent coupon enumeration.
    const auth = await requireApiRole(['customer']);
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const rl = rateLimit({ limit: 10, windowSec: 60, name: 'coupons-validate' }, req);
    if (rl) return rl;

    const body = await req.json().catch(() => ({}));
    const { code, order_amount, restaurant_id } = body;
    if (!code) throw new ValidationError('code required');
    if (typeof order_amount !== 'number') throw new ValidationError('order_amount must be a number');
    const result = await CouponService.validate(code, order_amount, restaurant_id);
    return ok(result);
  });
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
