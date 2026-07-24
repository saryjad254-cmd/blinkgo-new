import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';

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
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    // Get earnings per driver
    const { data: earnings } = await svc
      .from('orders')
      .select('driver_id, delivery_fee, tip, total')
      .eq('status', 'delivered')
      .not('driver_id', 'is', null);

    const earningsByDriver: Record<string, { earnings: number; count: number }> = {};
    for (const o of earnings ?? []) {
      const id = o.driver_id as string;
      if (!earningsByDriver[id]) earningsByDriver[id] = { earnings: 0, count: 0 };
      earningsByDriver[id].earnings += Number(o.delivery_fee ?? 0) * 0.8 + Number(o.tip ?? 0);
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
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
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
    const { name, email, phone, password } = body;
    if (!name || !email || !password) {
      return NextResponse.json(
        { ok: false, error: 'name, email, password required' },
        { status: 400 },
      );
    }

    const svc = createServiceClient();

    // Create auth user
    const { data: authData, error: authErr } = await svc.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { name, phone: phone || null, role: 'driver' },
    });
    if (authErr) {
      return NextResponse.json(
        { ok: false, error: authErr.message },
        { status: 400 },
      );
    }

    // Create public.users record
    const { data: user, error: userErr } = await svc
      .from('users')
      .upsert(
        {
          id: authData.user.id,
          email: email.toLowerCase().trim(),
          name,
          phone: phone || null,
          role: 'driver',
          is_active: true,
          is_verified: true,
        },
        { onConflict: 'id' },
      )
      .select()
      .single();
    if (userErr) throw userErr;

    return NextResponse.json({ ok: true, driver: user });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
