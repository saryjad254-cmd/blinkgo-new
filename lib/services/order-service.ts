import { COMMISSION_RATE, STANDARD_DELIVERY_FEE, SERVICE_FEE_RATE } from '@/lib/config/fees';
/**
 * OrderService
 * ────────────
 * All business logic for orders lives here. API routes and server
 * components call into this service — they should NOT touch Supabase
 * directly for order operations.
 *
 * Responsibilities:
 *   - Create order (validate inputs, compute totals, persist).
 *   - Status transitions (with allowed-flow validation).
 *   - Driver assignment (atomic).
 *   - Cancellation & refund rules.
 *   - Listing & filtering.
 */

import { createServiceClient } from '@/lib/supabase/service';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError,
} from '@/lib/errors';
import { logger } from '@/lib/logging';



export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivering'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

export interface CreateOrderInput {
  customerId: string;
  restaurantId: string;
  items: OrderItem[];
  deliveryAddress: string;
  customerLat?: number;
  customerLng?: number;
  notes?: string;
  paymentMethod?: 'cash' | 'card' | 'online';
  tip?: number;
  scheduledFor?: string;
  couponId?: string;
  discount?: number;
  pointsRedeemed?: number;
  referralCode?: string;
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  customer_id: string;
  restaurant_id: string;
  driver_id: string | null;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tax: number;
  tip: number;
  discount: number;
  total: number;
  commission: number;
  delivery_address: string;
  customer_lat?: number;
  customer_lng?: number;
  created_at: string;
}

// Status transition graph — what flows are allowed
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['picked_up', 'cancelled'],
  picked_up: ['delivering', 'delivered', 'cancelled'],
  delivering: ['delivered', 'cancelled'],
  delivered: [], // terminal
  cancelled: [], // terminal
};

export class OrderService {
  /**
   * Create a new order with proper validation + total calculation.
   * Returns the inserted row.
   */
  static async create(input: CreateOrderInput): Promise<Order> {
    if (!input.items?.length) {
      throw new ValidationError('Order must have at least one item');
    }
    if (!input.deliveryAddress) {
      throw new ValidationError('Delivery address is required');
    }
    if (!input.restaurantId) {
      throw new ValidationError('Restaurant is required');
    }

    const subtotal = input.items.reduce((s, it) => s + it.price * it.quantity, 0);
    if (subtotal <= 0) {
      throw new ValidationError('Order subtotal must be positive');
    }
    const deliveryFee = 3.99;
    const serviceFee = Number((subtotal * 0.05).toFixed(2));
    const tax = 0;
    const tip = input.tip ?? 0;
    const discount = input.discount ?? 0;
    const total = Math.max(
      0,
      Number((subtotal + deliveryFee + serviceFee + tax + tip - discount).toFixed(2)),
    );
    const commission = Number((subtotal * COMMISSION_RATE).toFixed(2));

    const orderNumber = await this.generateOrderNumber();
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: input.customerId,
        restaurant_id: input.restaurantId,
        items: input.items as any,
        subtotal,
        delivery_fee: deliveryFee,
        service_fee: serviceFee,
        tax,
        tip,
        discount,
        total,
        commission,
        delivery_address: input.deliveryAddress,
        customer_lat: input.customerLat,
        customer_lng: input.customerLng,
        notes: input.notes,
        status: 'pending',
        payment_method: input.paymentMethod ?? 'cash',
        scheduled_for: input.scheduledFor,
        coupon_id: input.couponId,
        points_redeemed: input.pointsRedeemed,
      })
      .select('*')
      .single();
    if (error || !data) {
      logger.error('Order create failed', { customerId: input.customerId }, error);
      throw new AppError('Failed to create order', { statusCode: 500, code: 'ORDER_CREATE_FAILED', cause: error });
    }
    // Side effects: coupon use + referral completion (best-effort)
    if (input.couponId) {
      try {
        await svc.rpc('increment_coupon_uses', { coupon_id: input.couponId });
      } catch (e) {
        logger.warn('Coupon use increment failed', { couponId: input.couponId }, e);
      }
    }
    if (input.referralCode) {
      try {
        const { ReferralService } = await import('./referral-service');
        await ReferralService.markCompleted(input.customerId, data.id);
      } catch (e) {
        logger.warn('Referral completion failed', { orderId: data.id }, e);
      }
    }
    return data as Order;
  }

  /**
   * Get an order by id, ensuring the caller is allowed to see it.
   */
  static async getById(orderId: string, viewer: { id: string; role: string }): Promise<Order> {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error || !data) throw new NotFoundError('Order');
    // Customer/Driver/Restaurant can only see their own
    if (viewer.role === 'customer' && data.customer_id !== viewer.id) {
      throw new AuthorizationError('You can only view your own orders');
    }
    if (viewer.role === 'driver' && data.driver_id !== viewer.id) {
      throw new AuthorizationError('You can only view your assigned orders');
    }
    if (viewer.role === 'restaurant' && data.restaurant_id !== viewer.id) {
      throw new AuthorizationError('You can only view your restaurant orders');
    }
    return data as Order;
  }

  /**
   * Transition an order to a new status. Validates the transition is allowed.
   */
  static async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    actor: { id: string; role: string },
  ): Promise<Order> {
    const current = await this.getById(orderId, { id: actor.id, role: actor.role });
    const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ConflictError(
        `Cannot transition from ${current.status} to ${newStatus}`,
        { from: current.status, to: newStatus, allowed },
      );
    }
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('orders')
      .update({
        status: newStatus,
        ...this.statusTimestamps(newStatus),
      })
      .eq('id', orderId)
      .select('*')
      .single();
    if (error || !data) {
      logger.error('Order status update failed', { orderId, newStatus }, error);
      throw new AppError('Failed to update order status', { statusCode: 500, code: 'ORDER_UPDATE_FAILED', cause: error });
    }
    // Side effect: when delivered, award loyalty points
    if (newStatus === 'delivered') {
      try {
        const { LoyaltyService } = await import('./loyalty-service');
        await LoyaltyService.awardForOrder(data.customer_id, data.id, data.total);
      } catch (e) {
        logger.warn('Loyalty award failed (non-fatal)', { orderId, total: data.total }, e);
      }
    }
    return data as Order;
  }

  /**
   * Atomically assign a driver to an order.
   * Uses a single SQL update with WHERE status IN (allowed) to prevent races.
   */
  static async assignDriver(orderId: string, driverId: string): Promise<Order> {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('orders')
      .update({
        driver_id: driverId,
        status: 'picked_up',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .in('status', ['confirmed', 'preparing', 'ready'])
      .is('driver_id', null)
      .select('*')
      .single();
    if (error || !data) {
      throw new ConflictError('Order is no longer available', { orderId });
    }
    return data as Order;
  }

  /**
   * List orders with role-based filtering + pagination.
   */
  static async list(filter: {
    role: 'customer' | 'driver' | 'restaurant' | 'admin';
    userId: string;
    status?: OrderStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }> {
    const svc = createServiceClient();
    let q = svc.from('orders').select('*', { count: 'exact' });
    switch (filter.role) {
      case 'customer':
        q = q.eq('customer_id', filter.userId);
        break;
      case 'driver':
        q = q.eq('driver_id', filter.userId);
        break;
      case 'restaurant':
        q = q.eq('restaurant_id', filter.userId);
        break;
      // admin: no filter
    }
    if (filter.status) q = q.eq('status', filter.status);
    q = q.order('created_at', { ascending: false })
      .range(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50) - 1);
    const { data, count, error } = await q;
    if (error) {
      logger.error('Order list failed', { filter }, error);
      throw new AppError('Failed to list orders', { statusCode: 500, code: 'ORDER_LIST_FAILED', cause: error });
    }
    return { orders: (data ?? []) as Order[], total: count ?? 0 };
  }

  /**
   * Generate a unique order number like BLG27943494.
   */
  private static async generateOrderNumber(): Promise<string> {
    const n = Math.floor(Math.random() * 9e7) + 1e7;
    return `BLG${n}`;
  }

  private static statusTimestamps(status: OrderStatus): Record<string, string> {
    const now = new Date().toISOString();
    switch (status) {
      case 'preparing': return { prepared_at: now };
      case 'ready': return { ready_at: now };
      case 'picked_up': return { picked_up_at: now };
      case 'delivered': return { delivered_at: now };
      case 'cancelled': return { cancelled_at: now };
      default: return {};
    }
  }
}
