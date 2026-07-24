/**
 * Daily Reset Endpoint
 * ────────────────────
 * Clears today's orders + order_items + daily stats.
 * SAFE: does NOT delete users, restaurants, drivers, products, coupons.
 * Requires admin authentication + confirmation string.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

function getServiceClient() {
  return createServiceClient();
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getApiUserWithRole();
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    const { user, profile } = auth;

    if (profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }

    // Get confirmation
    const body = await req.json().catch(() => ({}));
    const { confirmation, scope } = body;

    if (confirmation !== 'RESET TODAY') {
      return NextResponse.json(
        { ok: false, error: 'Bestätigung muss genau "RESET TODAY" lauten' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Snapshot today's stats before deleting
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startIso = startOfDay.toISOString();

    const { data: todaysOrders } = await supabase
      .from('orders')
      .select('id, total, status, delivery_fee')
      .gte('created_at', startIso);

    // Archive today's stats (graceful if table doesn't exist)
    const totalRevenue = (todaysOrders || []).reduce((s, o) => s + Number(o.total || 0), 0);
    const totalDelivery = (todaysOrders || []).reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
    const delivered = (todaysOrders || []).filter(o => o.status === 'delivered').length;
    const cancelled = (todaysOrders || []).filter(o => o.status === 'cancelled').length;

    const todayDate = new Date().toISOString().slice(0, 10);

    await supabase.from('daily_stats').upsert({
      date: todayDate,
      total_orders: (todaysOrders || []).length,
      delivered_orders: delivered,
      cancelled_orders: cancelled,
      total_revenue: totalRevenue,
      total_delivery_fees: totalDelivery,
    }, { onConflict: 'date' });

    // Delete order_items for today's orders first
    const todaysIds = (todaysOrders || []).map(o => o.id);
    let deletedItems = 0;
    if (todaysIds.length > 0) {
      const { count: ic } = await supabase
        .from('order_items')
        .delete({ count: 'exact' })
        .in('order_id', todaysIds);
      deletedItems = ic ?? 0;
    }

    // Delete today's orders
    const { count: deletedOrders } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .gte('created_at', startIso);

    // Audit log (graceful if table doesn't exist)
    await supabase.from('activity_log').insert({
      actor_id: user.id,
      actor_email: profile.email,
      action: 'daily_reset',
      details: {
        deleted_orders: deletedOrders ?? 0,
        deleted_items: deletedItems,
        archived_revenue: totalRevenue,
        scope: 'today',
      },
    });

    return NextResponse.json({
      ok: true,
      deleted_orders: deletedOrders ?? 0,
      deleted_items: deletedItems,
      archived: {
        date: todayDate,
        total_orders: (todaysOrders || []).length,
        delivered,
        cancelled,
        revenue: totalRevenue,
      },
      message: `✅ Reset erfolgreich — ${deletedOrders ?? 0} Bestellungen gelöscht, ${totalRevenue.toFixed(2)} € archiviert`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    // SECURITY: require admin auth - this endpoint leaks today's revenue
    const auth = await getApiUserWithRole();
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (auth.profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    const supabase = getServiceClient();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: todaysOrders } = await supabase
      .from('orders')
      .select('id, total, status, delivery_fee')
      .gte('created_at', startOfDay.toISOString());

    const total = (todaysOrders || []).reduce((s, o) => s + Number(o.total || 0), 0);
    const delivered = (todaysOrders || []).filter(o => o.status === 'delivered').length;
    const pending = (todaysOrders || []).filter(o => ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'].includes(o.status)).length;

    return NextResponse.json({
      ok: true,
      preview: {
        orders_today: (todaysOrders || []).length,
        pending,
        delivered,
        revenue_today: total,
      },
      message: 'POST mit { confirmation: "RESET TODAY" } zum Zurücksetzen',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}