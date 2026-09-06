import { requireRestaurantId } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { RestaurantOrdersClient, type RestaurantOrderListItem } from '@/components/restaurant/RestaurantOrdersClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OrderItemCount = { order_id: string; quantity?: number | null };

async function loadOrders(restaurantId: string) {
  const supabase = createServiceClient();
  const [{ data: restaurant }, { data: rows }] = await Promise.all([
    supabase.from('restaurants').select('id, name').eq('id', restaurantId).maybeSingle(),
    supabase
      .from('orders')
      .select(`
        id, order_number, status, total, tip, payment_method, payment_status, fulfillment_type, pickup_code,
        created_at, accepted_at, prepared_at, picked_up_at, delivered_at,
        delivery_address, delivery_instructions,
        customer:customer_id(name, phone), driver:driver_id(name, phone)
      `)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const orders = (rows ?? []) as RestaurantOrderListItem[];
  const ids = orders.map((order) => order.id);
  const { data: itemRows } = ids.length
    ? await supabase.from('order_items').select('order_id, quantity').in('order_id', ids)
    : { data: [] as OrderItemCount[] };
  const itemCounts = new Map<string, number>();
  for (const item of (itemRows ?? []) as OrderItemCount[]) {
    itemCounts.set(item.order_id, (itemCounts.get(item.order_id) ?? 0) + Number(item.quantity ?? 0));
  }

  return {
    restaurantName: restaurant?.name ?? 'BlinkGo',
    orders: orders.map((order) => ({ ...order, item_count: itemCounts.get(order.id) ?? 0 })),
  };
}

export default async function RestaurantOrdersPage() {
  const { restaurantId } = await requireRestaurantId();
  const data = await loadOrders(restaurantId);
  return (
    <RestaurantOrdersClient
      key={data.orders.map((order) => `${order.id}:${order.status}`).join('|')}
      restaurantId={restaurantId}
      restaurantName={data.restaurantName}
      initialOrders={data.orders}
    />
  );
}
