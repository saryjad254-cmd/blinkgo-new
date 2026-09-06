import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { computeEarnings } from '@/lib/services/driver-earnings';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { InvitationRateLimitError, inviteAuthUser } from '@/lib/auth/admin-invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;

  try {
    const svc = createServiceClient();
    const url = new URL(request.url);
    const search = url.searchParams.get('q')?.toLowerCase() || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

    let query = svc
      .from('users')
      .select(
        'id, email, name, phone, is_active, is_verified, last_login_at, created_at',
        { count: 'exact' },
      )
      .eq('role', 'driver')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) {
      // v80 audit fix: escape user input (PostgREST filter injection)
      const { escapeIlike } = await import('@/lib/api/escape-ilike');
      const safe = escapeIlike(search);
      query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    // Get earnings per driver
    const { data: earnings } = await svc
      .from('orders')
      .select('driver_id, delivery_fee, tip, total, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('status', 'delivered')
      .not('driver_id', 'is', null);

    const earningsByDriver: Record<string, { earnings: number; count: number }> = {};
    for (const o of earnings ?? []) {
      const id = o.driver_id as string;
      if (!earningsByDriver[id]) earningsByDriver[id] = { earnings: 0, count: 0 };
      earningsByDriver[id].earnings += computeEarnings(o).total;
      earningsByDriver[id].count += 1;
    }

    const drivers = (data ?? []).map((d) => ({
      ...d,
      total_earnings: Number((earningsByDriver[d.id]?.earnings ?? 0).toFixed(2)),
      completed_deliveries: earningsByDriver[d.id]?.count ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      drivers,
      total: count ?? 0,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  // Only admin can create drivers
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : null;
    const allowedVehicles = new Set(['bicycle', 'ebike', 'scooter', 'motorcycle', 'car', 'walking']);
    const vehicleType = allowedVehicles.has(body.vehicle_type) ? body.vehicle_type : 'bicycle';
    const vehiclePlate = typeof body.vehicle_plate === 'string' ? body.vehicle_plate.trim().slice(0, 30) : null;
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 100) : null;
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'Valid name and email required' },
        { status: 400 },
      );
    }

    const svc = createServiceClient();

    // Create auth user
    let authUser;
    try {
      authUser = await inviteAuthUser({ client: svc, email, name, phone, role: 'driver', requestOrigin: request.nextUrl.origin });
    } catch (authErr) {
      if (authErr instanceof InvitationRateLimitError) {
        return NextResponse.json(
          { ok: false, error: safeErrorMessage(authErr) },
          { status: 429, headers: { 'Retry-After': String(authErr.retryAfterSeconds) } },
        );
      }
      return NextResponse.json(
        { ok: false, error: safeErrorMessage(authErr) },
        { status: 400 },
      );
    }

    // Create public.users record
    const { data: user, error: userErr } = await svc
      .from('users')
      .upsert(
        {
          id: authUser.id,
          email,
          name,
          phone,
          role: 'driver',
          is_active: false,
          is_verified: false,
        },
        { onConflict: 'id' },
      )
      .select()
      .single();
    if (userErr) {
      await svc.auth.admin.deleteUser(authUser.id).catch(() => undefined);
      throw userErr;
    }

    const { error: profileError } = await svc.from('drivers').upsert({
      id: authUser.id,
      user_id: authUser.id,
      vehicle_type: vehicleType,
      vehicle_plate: vehiclePlate,
      city,
      is_online: false,
      is_available: false,
      is_approved: false,
      status: 'pending',
    }, { onConflict: 'id' });
    if (profileError) {
      await svc.from('users').delete().eq('id', authUser.id);
      await svc.auth.admin.deleteUser(authUser.id).catch(() => undefined);
      throw profileError;
    }

    await recordAudit({ actor_id: auth.user.id, action: 'driver.create', target_type: 'driver', target_id: authUser.id, metadata: { email, vehicle_type: vehicleType, verification: 'pending', dispatch_enabled: false, activation: 'invite_sent' } });
    return NextResponse.json({ ok: true, activation: 'invite_sent', driver: { ...user, vehicle_type: vehicleType, vehicle_plate: vehiclePlate, city } }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : null;
    const allowedVehicles = new Set(['bicycle', 'ebike', 'scooter', 'motorcycle', 'car', 'walking']);
    const vehicleType = allowedVehicles.has(body.vehicle_type) ? body.vehicle_type : null;
    const vehiclePlate = typeof body.vehicle_plate === 'string' ? body.vehicle_plate.trim().slice(0, 30) : null;
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 100) : null;
    if (!id || name.length < 2 || !vehicleType) return NextResponse.json({ ok: false, error: 'Valid driver, name and vehicle type required' }, { status: 400 });

    const svc = createServiceClient();
    const { data: target, error: targetError } = await svc.from('users').select('id,role').eq('id', id).maybeSingle();
    if (targetError) return NextResponse.json({ ok: false, error: safeErrorMessage(targetError) }, { status: 400 });
    if (!target || target.role !== 'driver') return NextResponse.json({ ok: false, error: 'Driver not found' }, { status: 404 });

    const { data: userData, error: userError } = await svc.from('users').update({ name, phone }).eq('id', id).select().single();
    if (userError) return NextResponse.json({ ok: false, error: safeErrorMessage(userError) }, { status: 400 });
    let { data: profileRef, error: profileReadError } = await svc.from('drivers').select('id').eq('user_id', id).maybeSingle();
    if (!profileRef && !profileReadError) ({ data: profileRef, error: profileReadError } = await svc.from('drivers').select('id').eq('id', id).maybeSingle());
    if (profileReadError || !profileRef) return NextResponse.json({ ok: false, error: profileReadError ? safeErrorMessage(profileReadError) : 'Driver profile not found' }, { status: 404 });
    const { data: profileData, error: profileError } = await svc.from('drivers').update({ vehicle_type: vehicleType, vehicle_plate: vehiclePlate, city }).eq('id', profileRef.id).select().single();
    if (profileError) return NextResponse.json({ ok: false, error: safeErrorMessage(profileError) }, { status: 400 });

    const user = Array.isArray(userData) ? userData[0] : userData;
    const profile = Array.isArray(profileData) ? profileData[0] : profileData;
    await recordAudit({ actor_id: auth.user.id, action: 'driver.update', target_type: 'driver', target_id: id, metadata: { changes: ['name', 'phone', 'vehicle_type', 'vehicle_plate', 'city'] } });
    return NextResponse.json({ ok: true, driver: { ...user, ...profile, id } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(e) }, { status: 500 });
  }
}
