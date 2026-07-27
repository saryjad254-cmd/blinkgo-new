/**
 * Coupons API
 * ───────────
 * GET  /api/coupons?restaurant_id=xxx   — List available coupons
 * POST /api/coupons/validate             — Validate a code and get discount
 * POST /api/coupons                      — Create coupon (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { CouponService } from '@/lib/services/coupon-service';
import { ValidationError, AuthenticationError, AuthorizationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('open'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => listCoupons(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function listCoupons(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const restaurantId = url.searchParams.get('restaurant_id') ?? undefined;
    const coupons = await CouponService.listAvailable(restaurantId);
    return ok({ coupons });
  });
}
