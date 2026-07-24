/**
 * Driver Payouts API
 * ──────────────────
 * GET  /api/driver/payouts   - List driver's payouts
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('driver_payouts')
      .select('*')
      .eq('driver_id', user.id)
      .order('period_end', { ascending: false });

    if (error) {
      logger.warn('payouts fetch failed', { userId: user.id }, error);
      return ok({ payouts: [] });
    }
    return ok({ payouts: data ?? [] });
  });
}
