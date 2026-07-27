/**
 * Scheduled Orders Worker (HTTP Cron Fallback)
 * ─────────────────────────────────────────────
 * v82 workflow integrity fix: orders with a `scheduled_for` value
 * were created but never auto-dispatched. This route invokes the
 * SQL `dispatch_scheduled_orders()` RPC and fires notifications.
 *
 * Trigger:
 *   - Vercel Cron (vercel.json `crons` array) — every minute
 *   - Any external scheduler (curl + bearer token)
 *   - The pg_cron job in deploy/supabase/52-scheduled-orders-cron.sql
 *     (preferred when available)
 *
 * Auth: CRON_SECRET bearer token. Returns 401 otherwise.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const provided =
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      req.nextUrl.searchParams.get('secret');
    if (provided !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const svc = createServiceClient();
  let dispatched: Array<{ order_id: string; order_number: string; restaurant_id: string; customer_id: string; dispatch_lag_sec: number }> = [];
  try {
    const { data, error } = await svc.rpc('dispatch_scheduled_orders');
    if (error) {
      logger.error('dispatch_scheduled_orders RPC failed', { error });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    dispatched = (data ?? []) as typeof dispatched;
  } catch (e: any) {
    logger.error('dispatch_scheduled_orders RPC threw', { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message ?? 'RPC failed' }, { status: 500 });
  }

  // Fire notifications + tracking events for each dispatched order.
  for (const row of dispatched) {
    try {
      await svc.from('order_tracking_events').insert({
        order_id: row.order_id,
        event_type: 'scheduled_dispatched',
        status: 'confirmed',
        metadata: {
          dispatch_lag_sec: row.dispatch_lag_sec,
          triggered_by: 'cron',
        },
      });
    } catch {}
    try {
      // Notify the customer
      await svc.from('notifications').insert({
        user_id: row.customer_id,
        type: 'order_confirmed',
        title: 'Your scheduled order is on its way',
        body: `Order #${row.order_number} has been dispatched to the restaurant.`,
        data: { order_id: row.order_id, order_number: row.order_number },
        is_read: false,
      });
    } catch {}
    try {
      // Notify the restaurant
      const { data: restaurant } = await svc
        .from('restaurants')
        .select('owner_id')
        .eq('id', row.restaurant_id)
        .maybeSingle();
      if (restaurant?.owner_id) {
        await svc.from('notifications').insert({
          user_id: restaurant.owner_id,
          type: 'order_confirmed',
          title: 'Scheduled order dispatched',
          body: `Order #${row.order_number} just hit its scheduled time and is now confirmed.`,
          data: { order_id: row.order_id, order_number: row.order_number },
          is_read: false,
        });
      }
    } catch {}
  }

  return NextResponse.json({ ok: true, dispatched: dispatched.length, orders: dispatched });
}

// Vercel Cron sends GET, so accept it as well.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
