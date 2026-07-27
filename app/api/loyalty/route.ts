/**
 * Loyalty API
 * ───────────
 * GET  /api/loyalty                       — Get balance + recent transactions
 * POST /api/loyalty/redeem                — Redeem points
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { LoyaltyService } from '@/lib/services/loyalty-service';
import { AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => getLoyalty(ctx.auth.user.id) as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function getLoyalty(userId: string): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const [balance, transactions] = await Promise.all([
      LoyaltyService.getBalance(userId),
      LoyaltyService.listTransactions(userId, 20),
    ]);
    return ok({ balance, transactions });
  });
}
