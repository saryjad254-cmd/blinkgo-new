import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidEmail, sanitizeText } from '@/lib/validation';
import { InvitationRateLimitError, inviteAuthUser } from '@/lib/auth/admin-invitations';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminRole = 'admin' | 'super_admin' | 'manager';
type AdminUpdate = { role?: AdminRole; is_active?: boolean };

function requestObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === 'admin' || value === 'super_admin' || value === 'manager';
}

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
      // v80 audit fix: escape user input (PostgREST filter injection)
      const { escapeIlike } = await import('@/lib/api/escape-ilike');
      const safe = escapeIlike(search);
      query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      admins: data ?? [],
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
  // Only super_admin can create new admins
  const auth = await requireAdminRole(request, 'super_admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = requestObject(await request.json().catch(() => null));
    const { name, email, role } = body;

    if (typeof name !== 'string' || typeof email !== 'string' || !name.trim() || !email.trim()) {
      return NextResponse.json(
        { ok: false, error: 'name and email required' },
        { status: 400 },
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 });
    }
    if (!isAdminRole(role)) {
      return NextResponse.json(
        { ok: false, error: 'role must be admin, super_admin, or manager' },
        { status: 400 },
      );
    }

    const svc = createServiceClient();

    // Create auth user
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = sanitizeText(name, 100);
    let authUser;
    try {
      authUser = await inviteAuthUser({ client: svc, email: cleanEmail, name: cleanName, role, requestOrigin: request.nextUrl.origin });
    } catch (authErr) {
      if (authErr instanceof InvitationRateLimitError) {
        return NextResponse.json(
          { ok: false, error: safeErrorMessage(authErr) },
          { status: 429, headers: { 'Retry-After': String(authErr.retryAfterSeconds) } },
        );
      }
      return NextResponse.json({ ok: false, error: safeErrorMessage(authErr) }, { status: 400 });
    }

    // Create public.users record
    const { data: user, error: userErr } = await svc
      .from('users')
      .upsert(
        {
          id: authUser.id,
          email: cleanEmail,
          name: cleanName,
          role,
          is_active: true,
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

    return NextResponse.json({ ok: true, activation: 'invite_sent', admin: user }, { status: 201 });
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
    const body = requestObject(await request.json().catch(() => null));
    const { id, role, is_active } = body;
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }

    // Only super_admin can change another admin's role to super_admin
    if (role === 'super_admin' && auth.user.role !== 'super_admin') {
      return NextResponse.json(
        { ok: false, error: 'Only super_admin can assign super_admin role' },
        { status: 403 },
      );
    }

    const update: AdminUpdate = {};
    if (isAdminRole(role)) update.role = role;
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
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: safeErrorMessage(error) },
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
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}
