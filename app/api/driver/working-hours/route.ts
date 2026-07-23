/**
 * Driver Working Hours (self-service view)
 * Returns the current driver's working schedule.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    // First try the dedicated table
    const { data, error } = await supabase
      .from('driver_working_hours')
      .select('*')
      .eq('driver_id', user.id)
      .order('day_of_week', { ascending: true });

    if (!error && data && data.length > 0) {
      return NextResponse.json({ ok: true, hours: data, using_defaults: false });
    }

    // Fallback: check user_metadata (for before migration is applied)
    const meta = user.user_metadata || {};
    if (meta.working_hours && Array.isArray(meta.working_hours) && meta.working_hours.length === 7) {
      return NextResponse.json({
        ok: true,
        hours: meta.working_hours,
        using_defaults: false,
        source: 'metadata',
      });
    }

    // Final fallback: default hours
    return NextResponse.json({
      ok: true,
      hours: getDefaultHours(),
      using_defaults: true,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
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
