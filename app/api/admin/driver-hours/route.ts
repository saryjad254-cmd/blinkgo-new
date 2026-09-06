/**
 * Admin: Manage Driver Working Hours
 * GET: list drivers with their hours (admin only)
 * POST: set working hours for a specific driver (admin only)
 *   - Writes to BOTH driver_working_hours table AND user_metadata.working_hours
 *   - Auto-forces driver offline if they were online and now outside hours
 *   - Sends a notification to the driver
 */
import { NextResponse, type NextRequest } from 'next/server';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdminRole } from '@/lib/rbac';
import { isDriverWithinWorkingHours, normalizeDriverWorkingHours } from '@/lib/driver/working-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdminRole(req, 'admin');
    if (guard instanceof NextResponse) return guard;

    const supabase = createServiceClient();
    const url = new URL(req.url);
    const driverId = url.searchParams.get('driver_id');

    if (driverId) {
      const { data, error } = await supabase
        .from('driver_working_hours')
        .select('*')
        .eq('driver_id', driverId)
        .order('day_of_week', { ascending: true });

      if (error) {
        return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
      }
      return NextResponse.json({ ok: true, hours: data || [] });
    }

    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    const drivers = (users?.users || [])
      .filter((u) => u.app_metadata?.app_role === 'driver')
      .map((u) => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.user_metadata?.name || 'Driver',
        phone: u.user_metadata?.phone || '',
        is_online: !!u.user_metadata?.is_online,
        last_location_at: u.user_metadata?.last_location_at || null,
      }));

    const { data: allHours } = await supabase.from('driver_working_hours').select('*');

    return NextResponse.json({ ok: true, drivers, hours: allHours || [] });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminRole(req, 'admin');
    if (guard instanceof NextResponse) return guard;

    const supabase = createServiceClient();
    const rawBody: unknown = await req.json();
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
      ? rawBody as Record<string, unknown>
      : {};
    const driverId = typeof body.driver_id === 'string' ? body.driver_id : '';
    const hours = normalizeDriverWorkingHours(body.hours);

    if (!driverId || !hours) {
      return NextResponse.json({ ok: false, error: 'A driver_id and a valid seven-day hours schedule are required' }, { status: 400 });
    }

    // Save to table AND metadata
    let tableSuccess = false;
    let tableError: unknown = null;
    try {
      await supabase.from('driver_working_hours').delete().eq('driver_id', driverId);
      const rows = hours.map((h) => ({
        driver_id: driverId,
        day_of_week: h.day_of_week,
        start_time: h.start_time,
        end_time: h.end_time,
        is_enabled: h.is_enabled !== false,
      }));
      const { error } = await supabase.from('driver_working_hours').insert(rows);
      if (error) throw error;
      tableSuccess = true;
    } catch (e: unknown) {
      tableError = e;
    }

    // Get current state
    const { data: userData } = await supabase.auth.admin.getUserById(driverId);
    const existingMeta = (userData?.user?.user_metadata || {}) as Record<string, unknown>;
    const wasOnline = !!existingMeta.is_online;

    // Check if new hours put driver out of range
    const inHours = isDriverWithinWorkingHours(hours);

    // Update metadata
    const newMeta: Record<string, unknown> = {
      ...existingMeta,
      working_hours: hours,
      working_hours_updated_at: new Date().toISOString(),
    };

    let forceOffline = false;
    if (wasOnline && !inHours) {
      newMeta.is_online = false;
      newMeta.online_changed_at = new Date().toISOString();
      newMeta.online_changed_by = 'admin_changed_hours';
      forceOffline = true;
    }

    await supabase.auth.admin.updateUserById(driverId, {
      user_metadata: newMeta,
    });

    // Send notification if forced offline
    if (forceOffline) {
      try {
        await supabase.from('notifications').insert({
          user_id: driverId,
          type: 'driver',
          title: 'Schicht beendet',
          body: 'Der Administrator hat deine Arbeitszeiten geändert. Du wurdest offline geschaltet.',
          data: { subtype: 'admin_closed_shift', source: 'admin_dashboard' },
          is_read: false,
        });
      } catch {
        // ignore - table may not exist
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Working hours updated',
      count: hours.length,
      storage: tableSuccess ? 'database+metadata' : 'metadata_only',
      table_error: tableError ? safeErrorMessage(tableError) : null,
      force_offline: forceOffline,
    });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(err) }, { status: 500 });
  }
}
