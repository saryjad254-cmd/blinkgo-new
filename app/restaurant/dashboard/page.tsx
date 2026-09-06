/**
 * Restaurant Dashboard — Production rebuild
 * ─────────────────────────────────────────
 * Modern restaurant dashboard inspired by Wolt / Uber Eats merchant.
 * Shows:
 *   - Open/Closed toggle (big, primary action)
 *   - Busy mode control
 *   - Today's revenue + week
 *   - Active + pending orders
 *   - Menu item count + rating
 *   - Recent orders
 */
import { requireRestaurantId } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { RestaurantDashboardClient } from '@/components/restaurant/RestaurantDashboardClient';
import { extractPreparationPlan } from '@/lib/restaurant/preparation-policy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RevenueOrder = {
  status?: string | null;
  total?: number | null;
  accepted_at?: string | null;
  prepared_at?: string | null;
};

type OrderItem = {
  order_id: string;
  product_name?: string | null;
  quantity?: number | null;
  subtotal?: number | null;
};

type ActiveOrderRow = {
  id: string;
  order_number?: string | null;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready';
  total?: number | null;
  created_at: string;
  accepted_at?: string | null;
  prepared_at?: string | null;
  delivery_address?: unknown;
  customer?: { name?: string | null; phone?: string | null } | Array<{ name?: string | null; phone?: string | null }> | null;
};

async function loadRestaurantData(restaurantId: string) {
  const supabase = createServiceClient();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const [
    restaurant,
    todayOrders,
    weekOrders,
    activeOrders,
    pendingCount,
    menuCount,
    recentOrders,
  ] = await Promise.all([
    supabase
      .from('restaurants')
      .select('id, name, is_active, is_paused, busy_mode, busy_mode_until, rating, review_count, address, phone, opening_hours, delivery_fee, min_order')
      .eq('id', restaurantId)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id, total, status, created_at, accepted_at, prepared_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('orders')
      .select('id, total, status, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startOfWeek.toISOString()),
    supabase
      .from('orders')
      .select(`
        id, order_number, status, total, created_at, accepted_at, prepared_at,
        delivery_address, customer:customer_id(name, phone)
      `)
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
      .limit(20),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('status', 'pending'),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId),
    supabase
      .from('orders')
      .select(`
        id, order_number, status, total, created_at, delivered_at,
        customer:customer_id(name)
      `)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const activeRows = (activeOrders.data ?? []) as ActiveOrderRow[];
  const activeIds = activeRows.map((order) => order.id);
  const itemsResult = activeIds.length > 0
    ? await supabase.from('order_items').select('order_id, product_name, quantity, subtotal').in('order_id', activeIds)
    : { data: [] as OrderItem[] };
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of (itemsResult.data ?? []) as OrderItem[]) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }
  const { data: preparationEvents } = activeIds.length > 0
    ? await supabase.from('order_tracking_events').select('order_id, metadata, created_at').in('order_id', activeIds).eq('event_type', 'status_change').order('created_at', { ascending: false })
    : { data: [] as Array<{ order_id: string; metadata?: unknown; created_at?: string }> };
  const preparationByOrder = new Map(activeIds.map((orderId) => [orderId, extractPreparationPlan((preparationEvents ?? []).filter((event) => event.order_id === orderId))]));

  const sumRevenue = (orders: RevenueOrder[] | null) => {
    if (!orders) return 0;
    return orders
      .filter((order) => order.status === 'delivered')
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
  };

  const prepSamples = (todayOrders.data ?? [])
    .filter((order: RevenueOrder) => order.accepted_at && order.prepared_at)
    .map((order: RevenueOrder) => (new Date(order.prepared_at as string).getTime() - new Date(order.accepted_at as string).getTime()) / 60_000)
    .filter((minutes: number) => Number.isFinite(minutes) && minutes >= 0 && minutes <= 180);

  return {
    restaurant: restaurant.data,
    today: {
      orders: todayOrders.data?.length || 0,
      revenue: sumRevenue(todayOrders.data),
      averagePrepMinutes: prepSamples.length > 0 ? prepSamples.reduce((sum: number, minutes: number) => sum + minutes, 0) / prepSamples.length : null,
    },
    week: {
      orders: weekOrders.data?.length || 0,
      revenue: sumRevenue(weekOrders.data),
    },
    activeOrders: activeRows.map((order) => {
      const preparation = preparationByOrder.get(order.id);
      return { ...order, items: itemsByOrder.get(order.id) ?? [], estimated_prep_minutes: preparation?.estimatedPrepMinutes ?? null, estimated_ready_at: preparation?.estimatedReadyAt ?? null };
    }),
    pendingCount: pendingCount.count || 0,
    menuCount: menuCount.count || 0,
    recentOrders: recentOrders.data || [],
  };
}

export default async function RestaurantDashboardPage() {
  const { restaurantId } = await requireRestaurantId();
  const data = await loadRestaurantData(restaurantId);

  return (
    <RestaurantDashboardClient
      key={`${data.restaurant?.is_active}-${data.restaurant?.is_paused}-${data.restaurant?.busy_mode}-${data.today.orders}-${data.today.revenue}-${data.activeOrders.map((order) => `${order.id}:${order.status}`).join('|')}`}
      initialData={data}
    />
  );
}
