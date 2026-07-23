import { COMMISSION_RATE, STANDARD_DELIVERY_FEE, SERVICE_FEE_RATE } from '@/lib/config/fees';
/**
 * AnalyticsService
 * ────────────────
 * All dashboard analytics live here. Both admin and other dashboards
 * call into this. Computes revenue, top restaurants, driver stats, etc.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { cached } from '@/lib/cache';



export interface DashboardStats {
  users: {
    totalCustomers: number;
    totalDrivers: number;
    totalRestaurants: number;
    onlineDrivers: number;
  };
  orders: {
    total: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  revenue: {
    total: number;
    today: number;
    week: number;
    month: number;
    commission: number;
    commissionRate: number;
  };
  recent: Array<{
    id: string;
    order_number: string;
    status: string;
    total: number;
    created_at: string;
  }>;
}

export class AnalyticsService {
  /**
   * Main dashboard stats — 30-second cache (dashboard polls every 30s).
   */
  static async getDashboardStats(): Promise<DashboardStats> {
    return cached('analytics:dashboard', 30, async () => {
      const svc = createServiceClient();
      const [
        { count: totalCustomers },
        { count: totalDrivers },
        { count: totalRestaurants },
        { count: activeOrders },
        { count: cancelledOrders },
        { count: completedOrders },
        { count: totalOrders },
        { data: onlineDrivers },
        { data: deliveredOrders },
        { data: recentOrders },
      ] = await Promise.all([
        svc.from('users').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
        svc.from('users').select('id', { count: 'exact', head: true }).eq('role', 'driver'),
        svc.from('restaurants').select('id', { count: 'exact', head: true }).eq('is_active', true),
        svc.from('orders').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'picked_up']),
        svc.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
        svc.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
        svc.from('orders').select('id', { count: 'exact', head: true }),
        svc.from('users').select('id, last_location_at').eq('role', 'driver').eq('is_active', true),
        svc.from('orders').select('total, delivery_fee, tip, created_at')
          .eq('status', 'delivered')
          .order('created_at', { ascending: false })
          .limit(1000),
        svc.from('orders')
          .select('id, order_number, status, total, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      // Revenue windows
      const now = new Date();
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - 7); startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      let total = 0, today = 0, week = 0, month = 0;
      for (const o of deliveredOrders ?? []) {
        const totalVal = Number(o.total ?? 0);
        total += totalVal;
        const d = new Date(o.created_at);
        if (d >= startOfDay) today += totalVal;
        if (d >= startOfWeek) week += totalVal;
        if (d >= startOfMonth) month += totalVal;
      }

      // Online drivers (last location within 5 min)
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const onlineCount = (onlineDrivers ?? []).filter(
        (d) => d.last_location_at && new Date(d.last_location_at).getTime() > fiveMinAgo,
      ).length;

      return {
        users: {
          totalCustomers: totalCustomers ?? 0,
          totalDrivers: totalDrivers ?? 0,
          totalRestaurants: totalRestaurants ?? 0,
          onlineDrivers: onlineCount,
        },
        orders: {
          total: totalOrders ?? 0,
          active: activeOrders ?? 0,
          completed: completedOrders ?? 0,
          cancelled: cancelledOrders ?? 0,
        },
        revenue: {
          total: Number(total.toFixed(2)),
          today: Number(today.toFixed(2)),
          week: Number(week.toFixed(2)),
          month: Number(month.toFixed(2)),
          commission: Number((total * COMMISSION_RATE).toFixed(2)),
          commissionRate: COMMISSION_RATE,
        },
        recent: (recentOrders ?? []) as DashboardStats['recent'],
      };
    }, ['analytics', 'orders', 'users']);
  }

  /**
   * Top N restaurants by revenue.
   */
  static async topRestaurants(limit = 10): Promise<Array<{ id: string; name: string; revenue: number; orders: number }>> {
    return cached(`analytics:top-restaurants:${limit}`, 60, async () => {
      const svc = createServiceClient();
      const { data: orders } = await svc
        .from('orders')
        .select('restaurant_id, total, restaurants(name)')
        .eq('status', 'delivered');
      if (!orders) return [];
      const byRestaurant = new Map<string, { id: string; name: string; revenue: number; orders: number }>();
      for (const o of orders) {
        const id = o.restaurant_id as string;
        if (!id) continue;
        const existing = byRestaurant.get(id);
        if (existing) {
          existing.revenue += Number(o.total ?? 0);
          existing.orders += 1;
        } else {
          byRestaurant.set(id, {
            id,
            name: (o as any).restaurants?.name ?? '—',
            revenue: Number(o.total ?? 0),
            orders: 1,
          });
        }
      }
      return Array.from(byRestaurant.values())
        .map((r) => ({ ...r, revenue: Number(r.revenue.toFixed(2)) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
    }, ['analytics', 'orders', 'restaurants']);
  }
}
