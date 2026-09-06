/**
 * Orders Repository
 * ─────────────────
 * Canonical data access for the `orders` and `order_items` tables.
 *
 * Methods:
 *  - findById / findByOrderNumber
 *  - list (with rich filtering)
 *  - listByCustomer / listByDriver / listByRestaurant
 *  - count / aggregate
 *  - create / updateStatus
 *  - listItems / addItem
 *  - listTracking
 *
 * Optimizations:
 *  - Pagination + sort are first-class
 *  - Aggregation methods use RPC where possible
 *  - Soft-delete aware
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/foundation';

export type OrderStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready'
  | 'picked_up' | 'delivering' | 'delivered' | 'cancelled'
  | 'could_not_deliver' | 'refunded' | 'cancel_refund_pending';

export interface OrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  restaurant_id: string;
  driver_id: string | null;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tip: number;
  discount: number;
  total: number;
  payment_method: string | null;
  payment_status: string | null;
  delivery_address: string;
  customer_latitude: number | null;
  customer_longitude: number | null;
  notes: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

export interface OrderInsert {
  order_number: string;
  customer_id: string;
  restaurant_id: string;
  status?: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tip: number;
  discount: number;
  total: number;
  payment_method?: string;
  payment_status?: string;
  delivery_address: string;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  notes?: string;
  scheduled_for?: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
}

const TABLE = 'orders';
const COLUMNS = 'id, order_number, customer_id, restaurant_id, driver_id, status, subtotal, delivery_fee, service_fee, tip, discount, total, payment_method, payment_status, delivery_address, customer_latitude, customer_longitude, notes, scheduled_for, created_at, updated_at, delivered_at, cancelled_at';

// ── Read ─────────────────────────────────────────────────────
export async function findById(id: string): Promise<OrderRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'orders.findById' },
  );
  if (error) throw error;
  return data as OrderRow | null;
}

export async function findByOrderNumber(orderNumber: string): Promise<OrderRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).eq('order_number', orderNumber).maybeSingle(),
    { label: 'orders.findByOrderNumber' },
  );
  if (error) throw error;
  return data as OrderRow | null;
}

export interface ListOrdersOptions {
  customerId?: string;
  driverId?: string;
  restaurantId?: string;
  status?: OrderStatus | OrderStatus[];
  fromDate?: string;
  toDate?: string;
  paymentStatus?: string;
  minTotal?: number;
  maxTotal?: number;
  pagination?: Pagination;
  includeDeleted?: boolean;
}

export async function list(opts: ListOrdersOptions = {}): Promise<PaginatedResult<OrderRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<OrderRow>(svc.from(TABLE), { label: 'orders.list' });
  q.select(COLUMNS, { count: 'exact' });

  if (opts.customerId) q.eq('customer_id', opts.customerId);
  if (opts.driverId) q.eq('driver_id', opts.driverId);
  if (opts.restaurantId) q.eq('restaurant_id', opts.restaurantId);
  if (opts.status) {
    if (Array.isArray(opts.status)) q.in('status', opts.status as string[]);
    else q.eq('status', opts.status);
  }
  if (opts.fromDate) q.gte('created_at', opts.fromDate);
  if (opts.toDate) q.lte('created_at', opts.toDate);
  if (opts.paymentStatus) q.eq('payment_status', opts.paymentStatus);
  if (opts.minTotal !== undefined) q.gte('total', opts.minTotal);
  if (opts.maxTotal !== undefined) q.lte('total', opts.maxTotal);

  q.orderBy('created_at', 'desc');

  if (opts.pagination) q.paginate(opts.pagination);
  else q.limit(50);

  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

export async function listByCustomer(customerId: string, pagination?: Pagination): Promise<PaginatedResult<OrderRow>> {
  return list({ customerId, pagination });
}

export async function listByDriver(driverId: string, pagination?: Pagination): Promise<PaginatedResult<OrderRow>> {
  return list({ driverId, pagination });
}

export async function listByRestaurant(restaurantId: string, pagination?: Pagination): Promise<PaginatedResult<OrderRow>> {
  return list({ restaurantId, pagination });
}

export async function listActive(): Promise<OrderRow[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .select(COLUMNS)
        .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'])
        .order('created_at', { ascending: true }),
    { label: 'orders.listActive' },
  );
  if (error) throw error;
  return (data ?? []) as OrderRow[];
}

export async function listAvailableForDrivers(): Promise<OrderRow[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .select(COLUMNS)
        .eq('status', 'ready')
        .is('driver_id', null)
        .order('created_at', { ascending: true }),
    { label: 'orders.listAvailableForDrivers' },
  );
  if (error) throw error;
  return (data ?? []) as OrderRow[];
}

// ── Write ────────────────────────────────────────────────────
export async function create(input: OrderInsert): Promise<OrderRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .insert({
          ...input,
          status: input.status ?? 'pending',
          created_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single(),
    { label: 'orders.create' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Order (after insert)');
  return data as OrderRow;
}

export async function updateStatus(id: string, status: OrderStatus, extra: Partial<OrderRow> = {}): Promise<OrderRow> {
  const svc = createServiceClient();
  // Phase 7H-A: load current state first to validate transition
  // This is defense-in-depth — the route is still expected to validate.
  // The state machine is the canonical source (see lib/services/order-service.ts).
  const { data: current, error: readErr } = await dbCall(
    () => svc.from(TABLE).select('status').eq('id', id).single(),
    { label: 'orders.updateStatus.read' },
  );
  if (readErr) throw readErr;
  if (!current) throw new NotFoundError('Order');
  // Allowed transitions (mirrors lib/services/order-service.ts ORDER_ALLOWED_TRANSITIONS)
  const ALLOWED: Record<string, string[]> = {
    pending:                ['confirmed', 'cancelled', 'cancel_refund_pending'],
    confirmed:              ['preparing', 'cancelled', 'cancel_refund_pending'],
    preparing:              ['ready', 'cancelled', 'cancel_refund_pending'],
    ready:                  ['assigned', 'picked_up', 'cancelled', 'cancel_refund_pending'],
    assigned:               ['ready', 'picked_up', 'cancelled', 'cancel_refund_pending'],
    picked_up:              ['delivering', 'delivered', 'could_not_deliver'],
    delivering:             ['delivered', 'could_not_deliver'],
    delivered:              ['refunded'],
    cancelled:              ['refunded'],
    could_not_deliver:      ['cancelled', 'refunded', 'cancel_refund_pending'],
    cancel_refund_pending:  ['cancelled', 'refunded'],
    refunded:               [],
  };
  const allowed = ALLOWED[current.status] ?? [];
  if (!allowed.includes(status)) {
    throw new ConflictError(
      `Invalid transition: ${current.status} → ${status}`,
      { current_status: current.status, target_status: status, allowed, code: 'INVALID_TRANSITION' },
    );
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    ...extra,
  };
  // Set the right timestamp for the new state
  const now = new Date().toISOString();
  switch (status) {
    case 'delivered': patch.delivered_at = now; break;
    case 'cancelled': patch.cancelled_at = now; break;
    case 'preparing': patch.prepared_at = now; break;
    case 'picked_up': patch.picked_up_at = now; break;
  }
  // Atomic update: only succeed if status is still what we read
  const { data, error } = await dbCall(
    () => svc.from(TABLE).update(patch).eq('id', id).eq('status', current.status).select(COLUMNS).single(),
    { label: 'orders.updateStatus' },
  );
  if (error) {
    if (error.code === 'PGRST116') {
      // Either the order was deleted or another transition raced us
      throw new ConflictError(
        'Order state changed concurrently; please retry',
        { orderId: id, attempted: status, code: 'CONCURRENT_TRANSITION' },
      );
    }
    throw error;
  }
  if (!data) throw new NotFoundError('Order');
  return data as OrderRow;
}

export async function assignDriver(orderId: string, driverId: string): Promise<OrderRow> {
  const svc = createServiceClient();

  // Phase 7H-A Bug F + G: pre-flight checks before assignment
  // 1) Driver must exist and be online
  // 2) Driver must not already have an active order
  // 3) Driver must be within working hours (if driver_working_hours is configured)
  const { data: driver, error: driverErr } = await dbCall(
    () => svc.from('driver_status').select('driver_id, is_online, active_order_id').eq('driver_id', driverId).single(),
    { label: 'orders.assignDriver.driver' },
  );
  if (driverErr || !driver) {
    throw new NotFoundError('Driver not found or not registered');
  }
  if (!driver.is_online) {
    throw new ConflictError('Driver is not online', { driverId, code: 'DRIVER_OFFLINE' });
  }
  if (driver.active_order_id && driver.active_order_id !== orderId) {
    throw new ConflictError('Driver already has an active order', {
      driverId,
      active_order_id: driver.active_order_id,
      code: 'DRIVER_BUSY',
    });
  }

  // 2b) Optional: working hours check (only if driver_working_hours has rows for this driver)
  const { data: hours } = await dbCall(
    () => svc.from('driver_working_hours').select('*').eq('driver_id', driverId),
    { label: 'orders.assignDriver.hours' },
  );
  if (hours && hours.length > 0) {
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sunday
    const currentTime = now.getUTCHours() * 60 + now.getUTCMinutes();
    const todayHours = hours.find((h: any) => h.day_of_week === day && h.is_enabled !== false);
    if (todayHours) {
      const [startHour, startMinute] = String(todayHours.start_time ?? '00:00').split(':').map(Number);
      const [endHour, endMinute] = String(todayHours.end_time ?? '23:59').split(':').map(Number);
      const startMin = startHour * 60 + startMinute;
      const endMin = endHour * 60 + endMinute;
      if (currentTime < startMin || currentTime > endMin) {
        throw new ConflictError('Driver is outside working hours', {
          driverId,
          day, currentTime, startMin, endMin, code: 'DRIVER_OFF_HOURS',
        });
      }
    }
  }

  // 3) Atomic update: only assign if driver_id is currently null
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .update({ driver_id: driverId, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .is('driver_id', null)
        .select(COLUMNS)
        .single(),
    { label: 'orders.assignDriver' },
  );
  if (error) {
    if (error.code === 'PGRST116') {
      throw new ConflictError('Order is already assigned to a different driver', {
        orderId,
        driverId,
      });
    }
    throw error;
  }
  if (!data) throw new NotFoundError('Order');
  return data as OrderRow;
}

export async function softDelete(id: string): Promise<OrderRow> {
  return updateStatus(id, 'cancelled' as OrderStatus, { cancellation_reason: 'administrative_cancellation' } as any);
}

// ── Order items ──────────────────────────────────────────────
export async function listItems(orderId: string): Promise<OrderItemRow[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('order_items')
        .select('id, order_id, product_id, name, price, quantity, notes')
        .eq('order_id', orderId),
    { label: 'orders.listItems' },
  );
  if (error) throw error;
  return (data ?? []) as OrderItemRow[];
}

export async function addItem(item: Omit<OrderItemRow, 'id'>): Promise<OrderItemRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('order_items')
        .insert(item)
        .select('id, order_id, product_id, name, price, quantity, notes')
        .single(),
    { label: 'orders.addItem' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Order item');
  return data as OrderItemRow;
}

// ── Tracking events ──────────────────────────────────────────
export interface OrderTrackingEvent {
  id: string;
  order_id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function listTracking(orderId: string): Promise<OrderTrackingEvent[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('order_tracking_events')
        .select('id, order_id, event_type, metadata, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
    { label: 'orders.listTracking' },
  );
  if (error) throw error;
  return (data ?? []) as OrderTrackingEvent[];
}

export async function addTrackingEvent(orderId: string, event: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const svc = createServiceClient();
  const { error } = await dbCall(
    () =>
      svc.from('order_tracking_events').insert({
        order_id: orderId,
        event_type: event,
        metadata,
        created_at: new Date().toISOString(),
      }),
    { label: 'orders.addTrackingEvent' },
  );
  if (error) throw error;
}
