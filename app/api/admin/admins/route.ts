import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidEmail, sanitizeText } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const svc = createServiceClient();
    const url = new URL(request.url);
    const search = url.searchParams.get('q')?.toLowerCase() || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

    let query = svc
      .from('users')
      .select('id, email, name, role, is_active, created_at, last_login_at', {
        count: 'exact',
      })
      .in('role', ['admin', 'super_admin', 'manager'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      admins: data ?? [],
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
  // Only super_admin can create new admins
  const auth = await requireAdminRole(request, 'super_admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { name, email, password, role } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { ok: false, error: 'name, email, password required' },
        { status: 400 },
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 });
    }
    if (!['admin', 'super_admin', 'manager'].includes(role)) {
      return NextResponse.json(
        { ok: false, error: 'role must be admin, super_admin, or manager' },
        { status: 400 },
      );
    }

    const svc = createServiceClient();

    // Create auth user
    const { data: authData, error: authErr } = await svc.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { name: sanitizeText(name, 100), role },
    });
    if (authErr) {
      return NextResponse.json({ ok: false, error: authErr.message }, { status: 400 });
    }

    // Create public.users record
    const { data: user, error: userErr } = await svc
      .from('users')
      .upsert(
        {
          id: authData.user.id,
          email: email.toLowerCase().trim(),
          name: sanitizeText(name, 100),
          role,
          is_active: true,
          is_verified: true,
        },
        { onConflict: 'id' },
      )
      .select()
      .single();
    if (userErr) throw userErr;

    return NextResponse.json({ ok: true, admin: user });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { id, role, is_active } = body;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }

    // Only super_admin can change another admin's role to super_admin
    if (role === 'super_admin' && auth.user.role !== 'super_admin') {
      return NextResponse.json(
        { ok: false, error: 'Only super_admin can assign super_admin role' },
        { status: 403 },
      );
    }

    const update: any = {};
    if (role && ['admin', 'super_admin', 'manager'].includes(role)) update.role = role;
    if (typeof is_active === 'boolean') update.is_active = is_active;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: 'no fields to update' }, { status: 400 });
    }

    const svc = createServiceClient();
    const { data, error } = await svc
      .from('users')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, admin: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminRole(request, 'super_admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }
    if (id === auth.user.id) {
      return NextResponse.json(
        { ok: false, error: 'Cannot delete yourself' },
        { status: 400 },
      );
    }

    const svc = createServiceClient();
    // Demote to customer first (don't actually delete auth user)
    const { error } = await svc
      .from('users')
      .update({ role: 'customer', is_active: false })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
