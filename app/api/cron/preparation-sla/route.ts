import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { planPreparationAlerts, type PreparationAlertEvent, type PreparationAlertOrder } from '@/lib/restaurant/preparation-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest, expected: string): boolean {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return false;
  const provided = header.slice(7).trim();
  if (provided.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(provided), Buffer.from(expected)); }
  catch { return false; }
}

function markerId(orderId: string, level: string): string {
  const hex = createHash('sha256').update(`blinkgo:preparation-sla:${orderId}:${level}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function run(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  if (req.nextUrl.searchParams.size > 0) return NextResponse.json({ ok: false, error: 'query_parameters_not_allowed' }, { status: 400 });
  if (!authorized(req, secret)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const svc = createServiceClient();
  const { data: orderRows, error: ordersError } = await svc.from('orders')
    .select('id, order_number, status, restaurant_id, customer_id')
    .in('status', ['confirmed', 'preparing'])
    .limit(500);
  if (ordersError) return NextResponse.json({ ok: false, error: 'orders_unavailable' }, { status: 503 });
  const orders = (orderRows ?? []) as PreparationAlertOrder[];
  if (!orders.length) return NextResponse.json({ ok: true, scanned: 0, alerts: 0 });

  const orderIds = orders.map((order) => order.id);
  const [{ data: eventRows }, { data: restaurantRows }] = await Promise.all([
    svc.from('order_tracking_events').select('order_id, event_type, metadata, created_at').in('order_id', orderIds).in('event_type', ['status_change', 'restaurant_prep_sla_alert']).order('created_at', { ascending: false }).limit(2_000),
    svc.from('restaurants').select('id, owner_id, name').in('id', [...new Set(orders.map((order) => order.restaurant_id))]),
  ]);
  const candidates = planPreparationAlerts(orders, (eventRows ?? []) as PreparationAlertEvent[]);
  const restaurants = new Map((restaurantRows ?? []).map((restaurant) => [restaurant.id, restaurant]));
  let created = 0;

  for (const candidate of candidates) {
    const restaurant = restaurants.get(candidate.order.restaurant_id);
    const { error: markerError } = await svc.from('order_tracking_events').insert({
      id: markerId(candidate.order.id, candidate.level),
      order_id: candidate.order.id,
      event_type: 'restaurant_prep_sla_alert',
      status: candidate.order.status,
      metadata: {
        alert_level: candidate.level,
        estimated_ready_at: candidate.estimatedReadyAt,
        estimated_prep_minutes: candidate.estimatedPrepMinutes,
        overdue_minutes: candidate.overdueMinutes,
        source: 'preparation_sla_cron',
      },
    });
    if (markerError) {
      if (markerError.code !== '23505') logger.warn('Preparation SLA marker failed', { orderId: candidate.order.id, level: candidate.level, error: markerError.message });
      continue;
    }

    const number = candidate.order.order_number || candidate.order.id.slice(0, 8);
    if (restaurant?.owner_id) {
      const body = candidate.level === 'warning'
        ? `Bestellung #${number} erreicht in wenigen Minuten die zugesagte Abholzeit.`
        : `Bestellung #${number} ist ${Math.max(1, candidate.overdueMinutes)} Min. über der zugesagten Abholzeit.`;
      await svc.from('notifications').insert({ user_id: restaurant.owner_id, type: 'order', title: candidate.level === 'warning' ? 'Zubereitungszeit wird knapp' : 'Bestellung verspätet', body, data: { subtype: 'preparation_sla', order_id: candidate.order.id, alert_level: candidate.level }, is_read: false });
    }
    if (candidate.level !== 'warning') {
      await svc.from('admin_notifications').insert({ title: 'Restaurant preparation delay', body: `${restaurant?.name || 'Restaurant'} · #${number} · ${candidate.overdueMinutes} min late`, severity: candidate.level === 'critical' ? 'critical' : 'high', source: 'preparation_sla', order_id: candidate.order.id });
      if (candidate.order.customer_id) {
        await svc.from('notifications').insert({ user_id: candidate.order.customer_id, type: 'order', title: 'Deine Bestellung braucht etwas länger', body: 'Das Restaurant arbeitet noch an deiner Bestellung. Die Lieferzeit wurde aktualisiert.', data: { subtype: 'preparation_delay', order_id: candidate.order.id, alert_level: candidate.level }, is_read: false });
      }
    }
    created += 1;
  }

  logger.info('cron.preparation_sla.completed', { scanned: orders.length, alerts: created });
  return NextResponse.json({ ok: true, scanned: orders.length, alerts: created });
}

export async function GET(req: NextRequest): Promise<NextResponse> { return run(req); }
export async function POST(req: NextRequest): Promise<NextResponse> { return run(req); }
