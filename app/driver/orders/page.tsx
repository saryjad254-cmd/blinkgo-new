/**
 * Driver Orders page — list of my orders (active + completed)
 */
import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { DriverOrdersClient } from '@/components/driver/DriverOrdersClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadDriverOrders(driverId: string) {
  const supabase = createServiceClient();

  const [active, completed] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, order_number, status, total, tip, delivery_fee, payment_method,
        delivery_address, created_at, accepted_at, customer_latitude, customer_longitude, restaurant_latitude, restaurant_longitude,
        customer:customer_id(name, phone),
        restaurants:restaurant_id(name, address, phone, latitude, longitude)
      `)
      .eq('driver_id', driverId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
      .order('accepted_at', { ascending: false }),
    supabase
      .from('orders')
      .select(`
        id, order_number, status, total, tip, delivery_fee, created_at, delivered_at, customer_latitude, customer_longitude, restaurant_latitude, restaurant_longitude,
        customer:customer_id(name),
        restaurants:restaurant_id(name, latitude, longitude)
      `)
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .order('delivered_at', { ascending: false })
      .limit(50),
  ]);

  if (active.error || completed.error) {
    console.error('[DriverOrders] Failed to load orders', {
      active: active.error?.message,
      completed: completed.error?.message,
    });
    throw new Error('DRIVER_ORDERS_LOAD_FAILED');
  }

  return {
    active: active.data || [],
    completed: completed.data || [],
  };
}

export default async function DriverOrdersPage() {
  const user = await requireRole(['driver', 'admin', 'super_admin']);
  const data = await loadDriverOrders(user.id);
  return <DriverOrdersClient activeOrders={data.active} completedOrders={data.completed} userName={user.name || user.email || 'Driver'} />;
}
