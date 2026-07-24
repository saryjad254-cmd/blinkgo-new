/**
 * Admin: Manage Driver Working Hours
 * GET: list drivers with their hours (admin only)
 * POST: set working hours for a specific driver (admin only)
 *   - Writes to BOTH driver_working_hours table AND user_metadata.working_hours
 *   - Auto-forces driver offline if they were online and now outside hours
 *   - Sends a notification to the driver
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdminRole } from '@/lib/rbac';

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
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, hours: data || [] });
    }

    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    const drivers = (users?.users || [])
      .filter((u) => u.user_metadata?.role === 'driver')
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
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminRole(req, 'admin');
    if (guard instanceof NextResponse) return guard;

    const supabase = createServiceClient();
    const body = await req.json();
    const { driver_id, hours } = body;

    if (!driver_id || !Array.isArray(hours)) {
      return NextResponse.json({ ok: false, error: 'driver_id and hours array required' }, { status: 400 });
    }

    // Save to table AND metadata
    let tableSuccess = false;
    let tableError: any = null;
    try {
      await supabase.from('driver_working_hours').delete().eq('driver_id', driver_id);
      const rows = hours.map((h: any) => ({
        driver_id,
        day_of_week: h.day_of_week,
        start_time: h.start_time,
        end_time: h.end_time,
        is_enabled: h.is_enabled !== false,
      }));
      const { error } = await supabase.from('driver_working_hours').insert(rows);
      if (error) throw error;
      tableSuccess = true;
    } catch (e: any) {
      tableError = e;
    }

    // Get current state
    const { data: userData } = await supabase.auth.admin.getUserById(driver_id);
    const existingMeta = userData?.user?.user_metadata || {};
    const wasOnline = !!existingMeta.is_online;

    // Check if new hours put driver out of range
    const now = new Date();
    const day = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayHours = hours.find((h: any) => h.day_of_week === day);
    let inHours = false;
    if (todayHours && todayHours.is_enabled) {
      const [sh, sm] = todayHours.start_time.split(':').map(Number);
      const [eh, em] = todayHours.end_time.split(':').map(Number);
      inHours = currentMinutes >= sh * 60 + sm && currentMinutes <= eh * 60 + em;
    }

    // Update metadata
    const newMeta: any = {
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

    await supabase.auth.admin.updateUserById(driver_id, {
      user_metadata: newMeta,
    });

    // Send notification if forced offline
    if (forceOffline) {
      try {
        await supabase.from('notifications').insert({
          user_id: driver_id,
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
      table_error: tableError?.message || null,
      force_offline: forceOffline,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
