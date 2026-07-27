/**
 * Redeem loyalty points for a discount.
 * POST /api/loyalty/redeem
 * Body: { points, order_id? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { LoyaltyService } from '@/lib/services/loyalty-service';
import { ValidationError, AuthenticationError, ConflictError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // F11 (qa-1): rate-limit loyalty redemptions (10 / 15 min per user)
    const limited = rateLimit({ limit: 10, windowSec: 15 * 60, name: 'loyalty-redeem' }, req);
    if (limited) return limited;

    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const body = await req.json().catch(() => ({}));
    const { points, order_id } = body;
    if (typeof points !== 'number' || points < 100) {
      throw new ValidationError('points must be at least 100');
    }
    const result = await LoyaltyService.redeem(user.id, points, order_id);
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
