import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { sanitizeText } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;

  try {
    const svc = createServiceClient();
    const { data, error, count } = await svc
      .from('notifications')
      .select('id, user_id, title, body, type, data, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    return NextResponse.json({ ok: true, notifications: data ?? [], total: count ?? 0 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  const limited = rateLimit({ limit: 60, windowSec: 60, name: 'admin-notif' }, request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const { title, message, audience, type } = body;
    if (!title || !message) {
      return NextResponse.json({ ok: false, error: 'title and message required' }, { status: 400 });
    }

    const svc = createServiceClient();

    // Resolve audience
    let userIds: string[] = [];
    if (audience === 'all' || !audience) {
      const { data } = await svc.from('users').select('id').eq('is_active', true);
      userIds = (data ?? []).map((u) => u.id);
    } else {
      const { data } = await svc.from('users').select('id').eq('role', audience).eq('is_active', true);
      userIds = (data ?? []).map((u) => u.id);
    }

    if (userIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'No recipients' }, { status: 400 });
    }

    const cleanTitle = sanitizeText(title, 200);
    const cleanBody = sanitizeText(message, 1000);

    const rows = userIds.map((uid) => ({
      user_id: uid,
      title: cleanTitle,
      body: cleanBody,
      type: type || 'admin_announcement',
      data: { admin_broadcast: true, sent_by: auth.user.id },
    }));

    // Insert in chunks of 100
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await svc.from('notifications').insert(rows.slice(i, i + 100));
      if (error) throw error;
      inserted += Math.min(100, rows.length - i);
    }

    return NextResponse.json({ ok: true, sent: inserted, recipients: userIds.length });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
