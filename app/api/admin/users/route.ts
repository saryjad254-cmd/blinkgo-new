import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin', 'super_admin', 'manager']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const role = url.searchParams.get('role');
  const search = url.searchParams.get('search');

  try {
    const db = createServiceClient();
    let q = db.from('users').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (role) q = q.eq('role', role);
    if (search) {
      // v80 audit fix: escape user input (PostgREST filter injection)
      const { escapeIlike } = await import('@/lib/api/escape-ilike');
      const safe = escapeIlike(search);
      q = q.or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`);
    }
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: safeErrorMessage(error), users: [] }, { status: 200 });
    }
    return NextResponse.json({ ok: true, users: data || [] });
  } catch (e) {
    console.error('[admin/users]', e);
    return NextResponse.json({ ok: false, error: 'Failed', users: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin', 'super_admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const db = createServiceClient();

    // v81 SECURITY: privilege-escalation hardening on user create.
    //  - Only `super_admin` may create `admin`, `super_admin`, or `manager`
    //    accounts. A regular `admin` can only create `customer` / `driver`
    //    / `restaurant` accounts.
    //  - `is_verified` is always `false` (let the user verify their own
    //    email) — the previous code overrode this with `is_verified: false`
    //    but a future contributor could relax it. Make it explicit.
    //  - Whitelist fields rather than spreading the body.
    const ALLOWED_CREATE_ROLES = ['customer', 'driver', 'restaurant'] as const;
    const SUPER_ONLY_ROLES = ['admin', 'super_admin', 'manager'] as const;
    const requestedRole: string = typeof body.role === 'string' ? body.role : 'customer';
    const isSuperAdmin = auth.role === 'super_admin';
    let role: string;
    if (SUPER_ONLY_ROLES.includes(requestedRole as any)) {
      if (!isSuperAdmin) {
        return NextResponse.json(
          { ok: false, error: 'Only super_admin can create admin/manager accounts' },
          { status: 403 },
        );
      }
      role = requestedRole;
    } else if (ALLOWED_CREATE_ROLES.includes(requestedRole as any)) {
      role = requestedRole;
    } else {
      return NextResponse.json({ ok: false, error: 'Invalid role' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
    if (!email) {
      return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });
    }

    const { data, error } = await db
      .from('users')
      .insert({
        email,
        full_name: typeof body.full_name === 'string' ? body.full_name.slice(0, 100) : null,
        role,
        phone: typeof body.phone === 'string' ? body.phone.slice(0, 20) : null,
        is_verified: false,
        is_active: true,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });

    await recordAudit({
      actor_id: auth.id,
      action: 'user.create',
      target_type: 'user',
      target_id: data.id,
      metadata: { email, role, actor_role: auth.role, was_super_admin: isSuperAdmin },
    });

    return NextResponse.json({ ok: true, user: data });
  } catch (e) {
    console.error('[admin/users POST]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiRole(['admin', 'super_admin', 'manager']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (body.bulkAction && Array.isArray(body.userIds)) {
      const db = createServiceClient();
      const update = body.bulkAction === 'suspend' ? { is_active: false } : { is_active: true };
      const { data, error } = await db.from('users').update(update).in('id', body.userIds).select('id');
      if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
      for (const u of data || []) {
        await recordAudit({
          actor_id: auth.id,
          action: `user.${body.bulkAction}`,
          target_type: 'user',
          target_id: u.id,
        });
      }
      return NextResponse.json({ ok: true, count: (data || []).length });
    }
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
