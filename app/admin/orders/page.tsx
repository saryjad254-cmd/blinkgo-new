/**
 * Admin Orders List
 * ─────────────────
 * Modern orders list with filtering, search, and quick actions.
 */
import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminOrdersClient } from '@/components/admin/AdminOrdersClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadOrders() {
  const supabase = createServiceClient();
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, total, tip, delivery_fee, payment_method,
      created_at, accepted_at, prepared_at, picked_up_at, delivered_at,
      delivery_address, customer:customer_id(name, phone),
      restaurants:restaurant_id(name, phone),
      driver:driver_id(name, phone)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  const { count: totalCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true });

  return {
    orders: orders || [],
    totalCount: totalCount && totalCount > 0 ? totalCount : (orders?.length || 0),
  };
}

export default async function AdminOrdersPage() {
  const user = await requireRole('admin');
  const data = await loadOrders();

  return <AdminOrdersClient initialOrders={data.orders} totalCount={data.totalCount} userName={user.name || user.email || 'Admin'} />;
}
