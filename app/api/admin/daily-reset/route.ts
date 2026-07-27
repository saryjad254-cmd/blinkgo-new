/**
 * Daily Reset Endpoint
 * ────────────────────
 * Clears today's orders + order_items + daily stats.
 * SAFE: does NOT delete users, restaurants, drivers, products, coupons.
 * Requires admin authentication + confirmation string.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ok, withErrorHandling } from '@/lib/api/response';
import { audit } from '@/lib/services/audit-log';
import { AuthorizationError, ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getServiceClient() {
  return createServiceClient();
}

export async function POST(req: NextRequest) {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => postReset(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function postReset(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin(req);
    if (guard) return guard;
    const auth = await getApiUserWithRole();
    if (!auth) throw new AuthorizationError('Not authenticated');
    const { user, profile } = auth;

    const body = await req.json().catch(() => ({}));
    const { confirmation, scope } = body;

    if (confirmation !== 'RESET TODAY') {
      throw new ValidationError('Bestätigung muss genau "RESET TODAY" lauten');
    }

    const supabase = getServiceClient();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startIso = startOfDay.toISOString();

    const { data: todaysOrders } = await supabase
      .from('orders')
      .select('id, total, status, delivery_fee')
      .gte('created_at', startIso);

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

    const todaysIds = (todaysOrders || []).map(o => o.id);
    let deletedItems = 0;
    if (todaysIds.length > 0) {
      const { count: ic } = await supabase
        .from('order_items')
        .delete({ count: 'exact' })
        .in('order_id', todaysIds);
      deletedItems = ic ?? 0;
    }

    const { count: deletedOrders } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .gte('created_at', startIso);

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

    await audit('ADMIN_CONFIG_CHANGED', {
      severity: 'warn',
      userId: user.id,
      userRole: user.role,
      resource: 'daily_reset',
      metadata: { deleted_orders: deletedOrders ?? 0, deleted_items: deletedItems },
    });

    return ok({
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
  });
}

export async function GET() {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => getReset() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function getReset(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const auth = await getApiUserWithRole();
    if (!auth) throw new AuthorizationError('Not authenticated');
    if (auth.profile.role !== 'admin' && auth.profile.role !== 'super_admin' && auth.profile.role !== 'manager') {
      throw new AuthorizationError('Admin only');
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

    return ok({
      preview: {
        orders_today: (todaysOrders || []).length,
        pending,
        delivered,
        revenue_today: total,
      },
      message: 'POST mit { confirmation: "RESET TODAY" } zum Zurücksetzen',
    });
  });
}
