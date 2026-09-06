/**
 * Coupons API
 * ───────────
 * GET  /api/coupons?restaurant_id=xxx   — List available coupons
 * POST /api/coupons/validate             — Validate a code and get discount
 * POST /api/coupons                      — Create coupon (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { CouponService } from '@/lib/services/coupon-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await withSecurity(
    secureRoute('open'),
    async (_ctx, request) => listCoupons(request),
  )(req) as NextResponse;
}

async function listCoupons(req: NextRequest) {
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get('restaurant_id') ?? undefined;
  const coupons = await CouponService.listAvailable(restaurantId);
  return ok({ coupons });
}
