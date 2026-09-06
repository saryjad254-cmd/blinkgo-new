import { KitchenView, type KitchenOrder } from '@/components/restaurant/KitchenView';
import { requireRestaurantId } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { extractPreparationPlan } from '@/lib/restaurant/preparation-policy';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

type KitchenOrderRow = Omit<KitchenOrder, 'items' | 'customer_name' | 'customer_phone' | 'driver_name'> & {
  customer?: { name?: string | null; phone?: string | null } | Array<{ name?: string | null; phone?: string | null }> | null;
  driver?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type KitchenItemRow = {
  id: string;
  order_id: string;
  product_name?: string | null;
  quantity?: number | null;
  subtotal?: number | null;
  configuration?: {
    substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
    fulfillment_status?: 'substituted' | 'unavailable_refund';
    original_product_name?: string;
  } | null;
};

function relationOne<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export default async function RestaurantKitchenPage() {
  const { restaurantId } = await requireRestaurantId();
  const supabase = createServiceClient();

  const [{ data: restaurant }, { data: orderRows }] = await Promise.all([
    supabase.from('restaurants').select('id, name').eq('id', restaurantId).maybeSingle(),
    supabase
      .from('orders')
      .select(`
        id, order_number, status, created_at, accepted_at, prepared_at, total,
        delivery_instructions,
        customer:customer_id(name, phone),
        driver:driver_id(name)
      `)
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
      .order('created_at', { ascending: true }),
  ]);

  const rows = (orderRows ?? []) as KitchenOrderRow[];
  const orderIds = rows.map((order) => order.id);
  const { data: itemRows } = orderIds.length
    ? await supabase
        .from('order_items')
        .select('id, order_id, product_name, quantity, subtotal, configuration')
        .in('order_id', orderIds)
        .order('id', { ascending: true })
    : { data: [] as KitchenItemRow[] };

  const itemsByOrder = new Map<string, KitchenItemRow[]>();
  for (const item of (itemRows ?? []) as KitchenItemRow[]) {
    const items = itemsByOrder.get(item.order_id) ?? [];
    items.push(item);
    itemsByOrder.set(item.order_id, items);
  }
  const { data: preparationEvents } = orderIds.length
    ? await supabase
        .from('order_tracking_events')
        .select('order_id, metadata, created_at')
        .in('order_id', orderIds)
        .eq('event_type', 'status_change')
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ order_id: string; metadata?: unknown; created_at?: string }> };
  const preparationByOrder = new Map<string, ReturnType<typeof extractPreparationPlan>>();
  for (const orderId of orderIds) {
    preparationByOrder.set(orderId, extractPreparationPlan((preparationEvents ?? []).filter((event) => event.order_id === orderId)));
  }

  const orders: KitchenOrder[] = rows.map((order) => {
    const customer = relationOne(order.customer);
    const driver = relationOne(order.driver);
    const preparation = preparationByOrder.get(order.id);
    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      created_at: order.created_at,
      accepted_at: order.accepted_at,
      prepared_at: order.prepared_at,
      estimated_prep_minutes: preparation?.estimatedPrepMinutes ?? null,
      estimated_ready_at: preparation?.estimatedReadyAt ?? null,
      total: Number(order.total ?? 0),
      delivery_instructions: order.delivery_instructions,
      customer_name: customer?.name ?? '',
      customer_phone: customer?.phone ?? '',
      driver_name: driver?.name ?? '',
      items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
        id: item.id,
        product_name: item.product_name ?? '',
        quantity: Number(item.quantity ?? 0),
        subtotal: Number(item.subtotal ?? 0),
        configuration: item.configuration ?? undefined,
      })),
    };
  });

  return (
    <KitchenView
      key={orders.map((order) => `${order.id}:${order.status}`).join('|')}
      restaurantId={restaurantId}
      restaurantName={restaurant?.name ?? 'BlinkGo'}
      initialOrders={orders}
    />
  );
}
