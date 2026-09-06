/**
 * Loyalty API
 * ───────────
 * GET  /api/loyalty                       — Get balance + recent transactions
 * POST /api/loyalty/redeem                — Redeem points
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import type { ApiResponse } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { LoyaltyService } from '@/lib/services/loyalty-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await withSecurity(
    secureRoute('lenient', ['customer', 'driver', 'restaurant', 'manager', 'admin', 'super_admin']),
    async (ctx) => await getLoyalty(ctx.auth.user.id) as NextResponse<ApiResponse<unknown>>,
  )(req) as NextResponse;
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
