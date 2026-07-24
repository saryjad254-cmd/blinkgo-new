import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
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
    if (search) q = q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, users: [] }, { status: 200 });
    }
    return NextResponse.json({ ok: true, users: data || [] });
  } catch (e) {
    console.error('[admin/users]', e);
    return NextResponse.json({ ok: false, error: 'Failed', users: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const db = createServiceClient();
    const { data, error } = await db.from('users').insert({
      email: body.email,
      full_name: body.full_name,
      role: body.role,
      phone: body.phone,
      is_verified: false,
    }).select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    await recordAudit({
      actor_id: auth.id,
      action: 'user.create',
      target_type: 'user',
      target_id: data.id,
      metadata: { email: body.email, role: body.role },
    });

    return NextResponse.json({ ok: true, user: data });
  } catch (e) {
    console.error('[admin/users POST]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (body.bulkAction && Array.isArray(body.userIds)) {
      const db = createServiceClient();
      const update = body.bulkAction === 'suspend' ? { is_active: false } : { is_active: true };
      const { data, error } = await db.from('users').update(update).in('id', body.userIds).select('id');
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
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
