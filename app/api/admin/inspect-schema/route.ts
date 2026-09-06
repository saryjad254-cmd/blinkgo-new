import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdminOrDev } from '@/lib/admin-guard';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ok, withErrorHandling } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => inspectSchema() as any,
  )(req)) as unknown as NextResponse;
}

async function inspectSchema(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdminOrDev();
    if (!guard.ok) return guard.error!;

    const supabase = createServiceClient();
    const tables = ['orders', 'restaurants', 'users', 'order_items', 'notifications'];
    const results: Record<string, { fields?: string[]; error?: string }> = {};

    for (const t of tables) {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      if (!error && data && data[0]) {
        // Never expose row samples here: these tables can contain customer,
        // payment and notification data. Schema inspection only needs names.
        results[t] = { fields: Object.keys(data[0]) };
      } else {
        results[t] = { error: error?.message || 'no data' };
      }
    }
    return ok(results);
  });
}
