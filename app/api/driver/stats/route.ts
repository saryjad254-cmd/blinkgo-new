import { createServiceClient } from '@/lib/supabase/service';
import { fail, ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { AuthenticationError } from '@/lib/errors';
import { computeEarnings, type EarningsInput } from '@/lib/services/driver-earnings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DeliveredOrder extends EarningsInput {
  id: string;
  total: number | string | null;
  delivered_at: string | null;
  created_at: string;
}

async function driverStats() {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['driver', 'admin', 'super_admin', 'manager']);
    if (!user) throw new AuthenticationError();

    const supa = createServiceClient();
    const driverId = user.id;

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startISO = startOfDay.toISOString();

    const { data: todaysOrders, error } = await supa
      .from('orders')
      .select('id, total, delivery_fee, tip, delivered_at, created_at, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', startISO)
      .order('delivered_at', { ascending: false });

    if (error) {
      return fail(error);
    }

    const deliveredOrders = (todaysOrders ?? []) as DeliveredOrder[];
    const todayCount = deliveredOrders.length;
    const todayEarnings = deliveredOrders.reduce(
      (sum, order) => sum + computeEarnings(order).total,
      0,
    );
    const todayTotalRevenue = deliveredOrders.reduce(
      (sum, order) => sum + Number(order.total ?? 0),
      0,
    );
    const roundedEarnings = Math.round(todayEarnings * 100) / 100;
    const roundedRevenue = Math.round(todayTotalRevenue * 100) / 100;

    const { count: totalCount } = await supa
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .eq('status', 'delivered');

    return ok({
      today_count: todayCount,
      today_earnings: roundedEarnings,
      today_total_revenue: roundedRevenue,
      total_deliveries: totalCount || 0,
      // Current clients use camelCase; retain snake_case above for legacy callers.
      todayDeliveries: todayCount,
      todayEarnings: roundedEarnings,
    });
  });
}

export const GET = withSecurity(
  secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
  async () => driverStats(),
);
