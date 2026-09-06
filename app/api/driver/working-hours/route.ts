/**
 * Driver Working Hours (self-service view)
 * Returns the current driver's working schedule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import type { ApiResponse } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await withSecurity(
    secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
    async (ctx) => await driverWorkingHours(ctx.auth.user.id) as NextResponse<ApiResponse<unknown>>,
  )(req) as NextResponse;
}

async function driverWorkingHours(userId: string): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('driver_working_hours')
      .select('*')
      .eq('driver_id', userId)
      .order('day_of_week', { ascending: true });

    if (!error && data && data.length > 0) {
      return ok({ hours: data, using_defaults: false });
    }

    const meta = (await supabase.auth.getUser()).data.user?.user_metadata;
    const hours = meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>).working_hours
      : undefined;
    if (Array.isArray(hours) && hours.length === 7) {
      return ok({ hours, using_defaults: false, source: 'metadata' });
    }

    return ok({ hours: getDefaultHours(), using_defaults: true });
  });
}

function getDefaultHours() {
  return [
    { day_of_week: 0, start_time: '08:00:00', end_time: '23:00:00', is_enabled: true },
    { day_of_week: 1, start_time: '08:00:00', end_time: '23:00:00', is_enabled: true },
    { day_of_week: 2, start_time: '08:00:00', end_time: '23:00:00', is_enabled: true },
    { day_of_week: 3, start_time: '08:00:00', end_time: '23:00:00', is_enabled: true },
    { day_of_week: 4, start_time: '08:00:00', end_time: '23:00:00', is_enabled: true },
    { day_of_week: 5, start_time: '08:00:00', end_time: '23:00:00', is_enabled: true },
    { day_of_week: 6, start_time: '08:00:00', end_time: '23:00:00', is_enabled: true },
  ];
}
