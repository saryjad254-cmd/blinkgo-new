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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
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
