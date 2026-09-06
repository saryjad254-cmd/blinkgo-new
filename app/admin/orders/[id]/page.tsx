import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminOrderDetailClient, type AdminOrderDetailData } from '@/components/admin/AdminOrderDetailClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getOrderDetail(id: string): Promise<AdminOrderDetailData | null> {
  const admin = createServiceClient();
  const { data: order, error } = await admin
    .from('orders')
    .select(`
      id, order_number, status, payment_status, payment_method,
      subtotal, delivery_fee, service_fee, tax, tip, discount, total,
      delivery_address, delivery_instructions, customer_latitude, customer_longitude,
      customer_id, restaurant_id, driver_id, created_at, updated_at,
      accepted_at, prepared_at, picked_up_at, delivered_at, cancelled_at
    `)
    .eq('id', id)
    .single();

  if (error || !order) return null;

  const [customerResult, restaurantResult, driverResult, itemsResult, driversResult, onlineResult] = await Promise.all([
    admin.from('users').select('id, name, email, phone').eq('id', order.customer_id).single(),
    admin.from('restaurants').select('id, name, phone').eq('id', order.restaurant_id).single(),
    order.driver_id
      ? admin.from('users').select('id, name, email, phone').eq('id', order.driver_id).single()
      : Promise.resolve({ data: null }),
    admin.from('order_items').select('id, product_name, quantity, product_price, unit_price, subtotal').eq('order_id', id),
    admin.from('users').select('id, name').eq('role', 'driver').eq('is_active', true),
    admin.from('driver_status').select('driver_id, is_online').eq('is_online', true),
  ]);

  const onlineIds = new Set((onlineResult.data || []).map((entry) => entry.driver_id));
  const drivers = (driversResult.data || [])
    .filter((entry) => onlineIds.has(entry.id))
    .map((entry) => ({ id: entry.id, name: entry.name || entry.id.slice(0, 8), is_online: true }));

  return {
    order,
    customer: customerResult.data,
    restaurant: restaurantResult.data,
    driver: driverResult.data,
    items: itemsResult.data || [],
    drivers,
  };
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole('admin');
  const data = await getOrderDetail(id);

  return <AdminOrderDetailClient data={data} userName={user.name || user.email || 'Admin'} />;
}
