import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { AuthorizationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => getHistory() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function getHistory(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin', 'manager']);
    if (!user) throw new AuthorizationError('Admin access required');

    const supabase = createServiceClient();
    const { data: history } = await supabase
      .from('daily_stats')
      .select('*')
      .order('date', { ascending: false })
      .limit(30);
    return ok({ history: history || [] });
  });
}
