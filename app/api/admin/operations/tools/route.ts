import { NextRequest, NextResponse } from 'next/server';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { requireAdminRole } from '@/lib/rbac';
import { reassignOrderToDriver, emergencyCancelOrder } from '@/lib/services/order-operations';
import { setRestaurantPaused } from '@/lib/services/restaurant-operations';
import { logAuditEvent } from '@/lib/services/audit-service';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

type OperationBody = Record<string, unknown>;
type DriverStatusRow = {
  driver_id: string;
  is_on_delivery: boolean;
  current_order_id: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string;
  users: { name?: string; email?: string; phone?: string } | Array<{ name?: string; email?: string; phone?: string }> | null;
};
type PendingOrderRow = {
  id: string;
  order_number: string;
  status: string;
  total: number | string;
  created_at: string;
  driver_id: string | null;
  customers: { name?: string } | Array<{ name?: string }> | null;
  restaurants: { name?: string } | Array<{ name?: string }> | null;
};

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function requiredString(body: OperationBody, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * POST /api/admin/operations/tools
 * Body: { action, ...params }
 * Actions: 'reassign_order' | 'emergency_cancel' | 'pause_restaurant' | 'resume_restaurant' | 'broadcast'
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const rawBody: unknown = await request.json().catch(() => null);
    const body: OperationBody = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
      ? rawBody as OperationBody
      : {};
    const action = requiredString(body, 'action');
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    if (action === 'reassign_order') {
      const orderId = requiredString(body, 'orderId');
      const driverId = requiredString(body, 'driverId');
      if (!orderId || !driverId) {
        return NextResponse.json({ ok: false, error: 'orderId and driverId required' }, { status: 400 });
      }
      if (reason.length < 5) return NextResponse.json({ ok: false, error: 'Reason required (min 5 chars)' }, { status: 400 });
      const data = await reassignOrderToDriver(orderId, driverId, auth.user.id, reason);
      if (!data.ok) return NextResponse.json({ ok: false, error: data.error }, { status: 409 });
      return NextResponse.json({ ok: true, data });
    }

    if (action === 'emergency_cancel') {
      const orderId = requiredString(body, 'orderId');
      if (!orderId) {
        return NextResponse.json({ ok: false, error: 'orderId required' }, { status: 400 });
      }
      if (reason.length < 5) return NextResponse.json({ ok: false, error: 'Reason required (min 5 chars)' }, { status: 400 });
      const data = await emergencyCancelOrder(orderId, auth.user.id, reason);
      if (!data.ok) return NextResponse.json({ ok: false, error: data.error }, { status: 409 });
      return NextResponse.json({ ok: true, data });
    }

    if (action === 'pause_restaurant' || action === 'resume_restaurant') {
      const restaurantId = requiredString(body, 'restaurantId');
      if (!restaurantId) {
        return NextResponse.json({ ok: false, error: 'restaurantId required' }, { status: 400 });
      }
      if (reason.length < 5) return NextResponse.json({ ok: false, error: 'Reason required (min 5 chars)' }, { status: 400 });
      const paused = action === 'pause_restaurant';
      const data = await setRestaurantPaused(restaurantId, paused, auth.user.id, reason);
      if (!data.ok) return NextResponse.json({ ok: false, error: data.error }, { status: 409 });
      return NextResponse.json({ ok: true, data });
    }

    if (action === 'broadcast') {
      const title = requiredString(body, 'title')?.slice(0, 120);
      const message = requiredString(body, 'body')?.slice(0, 1000);
      if (!title || !message) {
        return NextResponse.json({ ok: false, error: 'title and body required' }, { status: 400 });
      }
      const svc = createServiceClient();
      const requestedAudience = requiredString(body, 'audience') ?? 'all';
      const audience = ['all', 'customers', 'drivers', 'restaurants', 'admins'].includes(requestedAudience)
        ? requestedAudience
        : 'all';
      let query = svc.from('users').select('id').eq('is_active', true);
      if (audience === 'customers') query = query.eq('role', 'customer');
      else if (audience === 'drivers') query = query.eq('role', 'driver');
      else if (audience === 'restaurants') query = query.eq('role', 'restaurant');
      else if (audience === 'admins') query = query.in('role', ['admin', 'super_admin', 'manager']);
      const { data: users, error: userErr } = await query;
      if (userErr) throw new Error(userErr.message);
      if (!users || users.length === 0) {
        return NextResponse.json({ ok: true, count: 0 });
      }
      const notifications = users.map((u) => ({
        user_id: u.id,
        type: 'admin_broadcast',
        title,
        body: message,
        data: { broadcast_by: auth.user.id, audience },
        is_read: false,
      }));
      // Insert in chunks of 100 to avoid payload limits
      let inserted = 0;
      for (let i = 0; i < notifications.length; i += 100) {
        const chunk = notifications.slice(i, i + 100);
        const { error } = await svc.from('notifications').insert(chunk);
        if (!error) inserted += chunk.length;
      }
      await logAuditEvent({
        actorId: auth.user.id,
        actorName: auth.user.name,
        action: 'admin.broadcast',
        metadata: { audience, count: inserted, title },
      });
      return NextResponse.json({ ok: true, count: inserted });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/admin/operations/tools
 * Query params:
 *   - list=online_drivers   → returns online drivers for reassignment
 *   - list=pending_orders   → returns orders awaiting driver
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(request.url);
    const list = url.searchParams.get('list');
    const svc = createServiceClient();

    if (list === 'online_drivers') {
      const { data, error } = await svc
        .from('driver_status')
        .select(`
          driver_id,
          is_online,
          is_on_delivery,
          current_order_id,
          latitude,
          longitude,
          updated_at,
          users!driver_status_driver_id_fkey(name, email, phone)
        `)
        .eq('is_online', true);
      if (error) throw new Error(error.message);
      const drivers = (data as DriverStatusRow[] | null ?? []).map((d) => ({
        id: d.driver_id,
        name: relation(d.users)?.name ?? '—',
        email: relation(d.users)?.email,
        phone: relation(d.users)?.phone,
        is_on_delivery: d.is_on_delivery,
        current_order_id: d.current_order_id,
        latitude: d.latitude,
        longitude: d.longitude,
        last_seen: d.updated_at,
      }));
      return NextResponse.json({ ok: true, drivers });
    }

    if (list === 'pending_orders') {
      const { data, error } = await svc
        .from('orders')
        .select(`
          id, order_number, status, total, created_at, customer_id, restaurant_id, driver_id,
          customers:users!orders_customer_id_fkey(name),
          restaurants:restaurants!orders_restaurant_id_fkey(name)
        `)
        .in('status', ['pending', 'confirmed'])
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      const orders = (data as PendingOrderRow[] | null ?? []).map((o) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        total: Number(o.total),
        created_at: o.created_at,
        customer_name: relation(o.customers)?.name,
        restaurant_name: relation(o.restaurants)?.name,
        driver_id: o.driver_id,
      }));
      return NextResponse.json({ ok: true, orders });
    }

    return NextResponse.json({ ok: false, error: 'list param required' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}
