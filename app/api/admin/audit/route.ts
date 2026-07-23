import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { toSafeInt } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AuditEvent {
  id: string;
  type: string;
  description?: string;
  actor?: string;
  created_at: string;
}

/**
 * Build a unified audit feed from existing tables.
 * Since we don't have a dedicated audit_log table, we synthesize events from
 * rate-limit hits, notifications, orders, and user changes.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const svc = createServiceClient();
    const url = new URL(request.url);
    const limit = toSafeInt(url.searchParams.get('limit'), 1, 200, 50);

    const events: AuditEvent[] = [];

    // Recent user changes (role, is_active)
    const { data: users } = await svc
      .from('users')
      .select('id, name, email, role, is_active, updated_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    for (const u of users ?? []) {
      events.push({
        id: `user-create-${u.id}`,
        type: 'register',
        description: `${u.name ?? u.email} (${u.role})`,
        actor: u.email,
        created_at: u.created_at,
      });
    }

    // Recent orders as activity
    const { data: orders } = await svc
      .from('orders')
      .select('id, order_number, status, total, created_at, customer_id, driver_id, restaurant_id, restaurants(name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    for (const o of orders ?? []) {
      events.push({
        id: `order-${o.id}`,
        type: o.status === 'delivered' ? 'login' : o.status === 'cancelled' ? 'blocked' : 'register',
        description: `Bestellung #${o.order_number} — ${o.status} — ${Number(o.total).toFixed(2)} € — ${(o as any).restaurants?.name ?? ''}`,
        created_at: o.created_at,
      });
    }

    // Recent notifications (admin broadcasts)
    const { data: notifications } = await svc
      .from('notifications')
      .select('id, type, title, body, created_at, data')
      .order('created_at', { ascending: false })
      .limit(limit);
    for (const n of notifications ?? []) {
      events.push({
        id: `notif-${n.id}`,
        type: n.type === 'admin_announcement' ? 'role_change' : 'register',
        description: `${n.title}: ${n.body}`,
        created_at: n.created_at,
      });
    }

    // Sort by created_at desc, take top N
    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ ok: true, events: events.slice(0, limit) });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
