/**
 * Loyalty API
 * ───────────
 * GET  /api/loyalty                       — Get balance + recent transactions
 * POST /api/loyalty/redeem                — Redeem points
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { LoyaltyService } from '@/lib/services/loyalty-service';
import { ValidationError, AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();
    const [balance, transactions] = await Promise.all([
      LoyaltyService.getBalance(user.id),
      LoyaltyService.listTransactions(user.id, 20),
    ]);
    return ok({ balance, transactions });
  });
}
