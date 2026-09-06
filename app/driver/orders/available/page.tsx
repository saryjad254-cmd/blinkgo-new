/**
 * Available Orders for Driver
 * ──────────────────────────
 */
import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AvailableOrdersClient } from '@/components/driver/AvailableOrdersClient';
import { createDriverOfferQuote } from '@/lib/driver/offer-policy';
import { formatAddressArea } from '@/lib/format-address';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadAvailableOrders(driverId: string) {
  const supabase = createServiceClient();
  const [ordersResult, activeOrderResult, driverStatusResult] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, order_number, status, total, delivery_fee, tip, payment_method,
        delivery_address, created_at,
        customer_latitude, customer_longitude,
        restaurant_latitude, restaurant_longitude,
        restaurants:restaurant_id(name, address, phone, latitude, longitude),
        customer:customer_id(name)
      `)
      .is('driver_id', null)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
      .limit(50),
    supabase
      .from('orders')
      .select('id, order_number, status')
      .eq('driver_id', driverId)
      .in('status', ['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('driver_status')
      .select('is_online, latitude, longitude, updated_at')
      .eq('driver_id', driverId)
      .maybeSingle(),
  ]);

  if (ordersResult.error || activeOrderResult.error || driverStatusResult.error) {
    console.error('[AvailableOrders] Failed to load offers', {
      orders: ordersResult.error?.message,
      activeOrder: activeOrderResult.error?.message,
      driverStatus: driverStatusResult.error?.message,
    });
    throw new Error('DRIVER_OFFERS_LOAD_FAILED');
  }

  const orders = ordersResult.data;
  const activeOrder = activeOrderResult.data;
  const driverStatus = driverStatusResult.data;

  const rankedOrders = (orders || [])
    .map((order) => {
      const { delivery_address: privateDeliveryAddress, ...safeOrder } = order;
      return {
        ...safeOrder,
        delivery_area: formatAddressArea(privateDeliveryAddress, ''),
        driver_offer: createDriverOfferQuote({ ...order, driver_latitude: driverStatus?.latitude, driver_longitude: driverStatus?.longitude }),
      };
    })
    .filter((order) => order.driver_offer.eligible)
    .sort((left, right) => left.driver_offer.score - right.driver_offer.score);

  return { orders: rankedOrders, activeOrder, isOnline: Boolean(driverStatus?.is_online) };
}

export default async function AvailableOrdersPage() {
  const user = await requireRole(['driver', 'admin', 'super_admin']);
  const data = await loadAvailableOrders(user.id);
  return <AvailableOrdersClient initialOrders={data.orders} activeOrder={data.activeOrder} isOnline={data.isOnline} userName={user.name || user.email || 'Driver'} />;
}
