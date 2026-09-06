import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { sanitizeText } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_AUDIENCES = new Set(['all', 'customer', 'driver', 'restaurant', 'admin', 'manager']);

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
    if (error) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
      const localMock = url.includes('localhost') || url.includes('127.0.0.1');
      if (localMock) {
        return NextResponse.json({ ok: true, notifications: [], total: 0 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, notifications: data ?? [], total: count ?? 0 });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Server error' },
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
    const { title, message, audience, type } = body as Record<string, unknown>;
    if (typeof title !== 'string' || typeof message !== 'string' || !title.trim() || !message.trim()) {
      return NextResponse.json({ ok: false, error: 'title and message required' }, { status: 400 });
    }
    const normalizedAudience = typeof audience === 'string' ? audience : 'all';
    if (!ALLOWED_AUDIENCES.has(normalizedAudience)) {
      return NextResponse.json({ ok: false, error: 'Invalid audience' }, { status: 400 });
    }

    const svc = createServiceClient();

    // Resolve audience
    let userIds: string[] = [];
    if (normalizedAudience === 'all') {
      const { data } = await svc.from('users').select('id').eq('is_active', true);
      userIds = (data ?? []).map((u) => u.id);
    } else {
      const { data } = await svc.from('users').select('id').eq('role', normalizedAudience).eq('is_active', true);
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
      type: typeof type === 'string' ? sanitizeText(type, 64) : 'admin_announcement',
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
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 },
    );
  }
}
