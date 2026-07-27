import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdminOrDev } from '@/lib/admin-guard';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ok, withErrorHandling } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => dbState() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function dbState(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdminOrDev();
    if (!guard.ok) return guard.error!;

    const supabase = createServiceClient();
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
    const summary = (users?.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      role: u.user_metadata?.role || 'unknown',
      is_active: u.user_metadata?.is_active !== false,
    }));
    return ok({ users: summary, count: summary.length });
  });
}
