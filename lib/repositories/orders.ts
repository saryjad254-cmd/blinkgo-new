/**
 * Order Repository
 * ───────────────
 * Centralized data access for the `orders` table.
 * Used by services for complex business operations.
 */

import { createServiceClient } from '@/lib/supabase/service';

export interface OrderQuery {
  customerId?: string;
  driverId?: string;
  restaurantId?: string;
  status?: string | string[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'delivered_at' | 'total';
  ascending?: boolean;
}

export interface OrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  restaurant_id: string;
  driver_id: string | null;
  status: string;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tip: number;
  discount: number;
  total: number;
  delivery_address: string;
  customer_lat: number | null;
  customer_lng: number | null;
  created_at: string;
  delivered_at: string | null;
  cancelled_at: string | null;
}

/**
 * Find orders matching a query. Returns up to `limit` rows.
 */
export async function findOrders(query: OrderQuery = {}): Promise<OrderRow[]> {
  const svc = createServiceClient();
  let q = svc
    .from('orders')
    .select('id, order_number, customer_id, restaurant_id, driver_id, status, subtotal, delivery_fee, service_fee, tip, discount, total, delivery_address, customer_lat, customer_lng, created_at, delivered_at, cancelled_at');

  if (query.customerId) q = q.eq('customer_id', query.customerId);
  if (query.driverId) q = q.eq('driver_id', query.driverId);
  if (query.restaurantId) q = q.eq('restaurant_id', query.restaurantId);
  if (query.status) {
    if (Array.isArray(query.status)) q = q.in('status', query.status);
    else q = q.eq('status', query.status);
  }
  if (query.fromDate) q = q.gte('created_at', query.fromDate);
  if (query.toDate) q = q.lte('created_at', query.toDate);
  if (query.limit) q = q.limit(query.limit);
  if (query.offset) q = q.range(query.offset, query.offset + (query.limit ?? 20) - 1);

  const orderBy = query.orderBy ?? 'created_at';
  q = q.order(orderBy, { ascending: query.ascending ?? false });

  const { data, error } = await q;
  if (error) {
    console.error('findOrders error:', error);
    return [];
  }
  return (data ?? []) as OrderRow[];
}

/**
 * Count orders matching a query.
 */
export async function countOrders(query: Omit<OrderQuery, 'limit' | 'offset' | 'orderBy' | 'ascending'> = {}): Promise<number> {
  const svc = createServiceClient();
  let q = svc
    .from('orders')
    .select('id', { count: 'exact', head: true });

  if (query.customerId) q = q.eq('customer_id', query.customerId);
  if (query.driverId) q = q.eq('driver_id', query.driverId);
  if (query.restaurantId) q = q.eq('restaurant_id', query.restaurantId);
  if (query.status) {
    if (Array.isArray(query.status)) q = q.in('status', query.status);
    else q = q.eq('status', query.status);
  }
  if (query.fromDate) q = q.gte('created_at', query.fromDate);
  if (query.toDate) q = q.lte('created_at', query.toDate);

  const { count } = await q;
  return count ?? 0;
}

/**
 * Update an order's status with proper validation.
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  updates: Record<string, unknown> = {}
): Promise<{ ok: boolean; error?: string }> {
  const svc = createServiceClient();
  const { error } = await svc
    .from('orders')
    .update({ status, updated_at: new Date().toISOString(), ...updates })
    .eq('id', orderId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
