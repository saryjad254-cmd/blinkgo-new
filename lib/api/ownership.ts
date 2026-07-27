/**
 * v81 — Ownership / Authorization Helpers
 * ───────────────────────────────────────
 * Canonical pattern for "user X can read/modify resource Y".
 *
 * Each helper takes the authenticated user (from requireApiRole / getApiUserWithRole)
 * plus the resource id, verifies the resource exists, and verifies the user
 * has the right relationship to it. Throws AppError(404) if not found,
 * AppError(403) if not authorized.
 *
 * Usage in a route handler:
 * ```ts
 * const user = await requireApiRole(['customer']);
 * if (!user) return fail('UNAUTHORIZED', 401);
 * await assertCanReadOrder(user, orderId);
 * // ... fetch the order, knowing the user is authorized
 * ```
 *
 * For admin/owner resources, the helper automatically accepts the user
 * if their role is `admin` / `super_admin` / `manager` (admin override).
 *
 * If the resource has a different owner field (e.g., `restaurant_id`,
 * `customer_id`, `user_id`), the helper reads from `public.{table}` and
 * matches accordingly.
 */
import { createServerClient } from '@/lib/supabase/server';
import { AppError, NotFoundError, AuthorizationError } from '@/lib/errors';
import type { AuthedUser } from '@/lib/auth-helper';

/**
 * v81: accept either the plain AuthedUser (from requireApiRole /
 * getApiUserWithRole) or the AuthedContext.user object (from
 * withSecurity). Both shapes are structurally identical; this type
 * narrows to the common subset.
 */
type AnyAuthed = Pick<AuthedUser, 'id' | 'role'> & Partial<AuthedUser>;

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'manager']);

function isAdmin(user: AnyAuthed): boolean {
  return ADMIN_ROLES.has(user.role);
}

/** Assert the user can read an order. Customer owns the order,
 *  restaurant owner owns the restaurant, driver is assigned,
 *  or admin override. Returns the order row for convenience. */
export async function assertCanReadOrder(
  user: AnyAuthed,
  orderId: string,
): Promise<{
  id: string;
  customer_id: string;
  restaurant_id: string;
  driver_id: string | null;
  status: string;
  total: number;
  payment_method: string | null;
  payment_status: string | null;
  stripe_payment_intent_id: string | null;
  points_redeemed: number | null;
  order_number: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  delivery_fee: number | null;
  service_fee: number | null;
  tip: number | null;
  delivery_address: any;
  delivery_instructions: string | null;
  items?: any[];
  restaurant?: any;
  [k: string]: any;
}> {
  const supabase = createServerClient();
  // Select the order with the common fields used by callers. We use a
  // single .select() so callers don't need a follow-up query.
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, customer_id, restaurant_id, driver_id, status, total, payment_method, payment_status, stripe_payment_intent_id, points_redeemed, order_number, cancelled_at, cancellation_reason, delivery_fee, service_fee, tip, delivery_address, delivery_instructions, items:order_items(id, product_id, quantity, price, name, subtotal), restaurant:restaurants!orders_restaurant_id_fkey(owner_id)')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!order) throw new NotFoundError('Order');

  if (isAdmin(user)) return order as any;

  const isCustomer = order.customer_id === user.id;
  const ownerId = (order.restaurant as any)?.owner_id;
  const isRestaurant = ownerId === user.id;
  const isDriver = order.driver_id === user.id;

  if (!isCustomer && !isRestaurant && !isDriver) {
    throw new AuthorizationError('You do not have access to this order');
  }
  return order as any;
}

/** Assert the user can read a restaurant. Public-by-default for read; only
 *  the owner (or admin) can update. The caller decides read vs write. */
export async function assertCanReadRestaurant(user: AnyAuthed, restaurantId: string): Promise<{ ownerId: string }> {
  const supabase = createServerClient();
  const { data: rest, error } = await supabase
    .from('restaurants')
    .select('id, owner_id, is_active')
    .eq('id', restaurantId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!rest) throw new NotFoundError('Restaurant');
  return { ownerId: rest.owner_id };
}

/** Assert the user can write to a restaurant (menu, hours, etc.). Must be
 *  the owner or admin. */
export async function assertCanWriteRestaurant(user: AnyAuthed, restaurantId: string): Promise<void> {
  if (isAdmin(user)) return;
  const { ownerId } = await assertCanReadRestaurant(user, restaurantId);
  if (ownerId !== user.id) {
    throw new AuthorizationError('Only the restaurant owner can modify this restaurant');
  }
}

/** Assert the user can read a driver. Self or admin. */
export async function assertCanReadDriver(user: AnyAuthed, driverId: string): Promise<void> {
  if (isAdmin(user)) return;
  if (user.id !== driverId) {
    throw new AuthorizationError('Drivers can only access their own data');
  }
}

/** Assert the user can read a user profile. Self or admin. */
export async function assertCanReadUser(user: AnyAuthed, userId: string): Promise<void> {
  if (isAdmin(user)) return;
  if (user.id !== userId) {
    throw new AuthorizationError('Users can only access their own profile');
  }
}

/** Assert the user can read an address. Self or admin. */
export async function assertCanReadAddress(user: AnyAuthed, addressId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: addr, error } = await supabase
    .from('customer_addresses')
    .select('id, user_id')
    .eq('id', addressId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!addr) throw new NotFoundError('Address');
  if (addr.user_id !== user.id) {
    throw new AuthorizationError('You can only access your own addresses');
  }
}

/** Assert the user can read a payment. The payment belongs to an order;
 *  we verify the user can read that order. */
export async function assertCanReadPayment(user: AnyAuthed, paymentId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: pay, error } = await supabase
    .from('payments')
    .select('id, order_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!pay) throw new NotFoundError('Payment');
  // Delegate to order ownership check
  await assertCanReadOrder(user, pay.order_id);
}

/** Assert the user can read a notification. Self or admin. */
export async function assertCanReadNotification(user: AnyAuthed, notificationId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: notif, error } = await supabase
    .from('notifications')
    .select('id, user_id')
    .eq('id', notificationId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!notif) throw new NotFoundError('Notification');
  if (notif.user_id !== user.id) {
    throw new AuthorizationError('You can only access your own notifications');
  }
}

/** Assert the user can read a favorite. Self or admin. */
export async function assertCanReadFavorite(user: AnyAuthed, favoriteId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: fav, error } = await supabase
    .from('favorites')
    .select('id, user_id')
    .eq('id', favoriteId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!fav) throw new NotFoundError('Favorite');
  if (fav.user_id !== user.id) {
    throw new AuthorizationError('You can only access your own favorites');
  }
}

/** Assert the user can read a rating. The rating is associated with an order;
 *  the customer who placed the order or the restaurant can read it, or admin. */
export async function assertCanReadRating(user: AnyAuthed, ratingId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: rating, error } = await supabase
    .from('ratings')
    .select('id, order_id, customer_id')
    .eq('id', ratingId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!rating) throw new NotFoundError('Rating');
  if (rating.customer_id !== user.id) {
    // Check if user owns the restaurant
    const { data: order } = await supabase
      .from('orders')
      .select('restaurant_id, restaurants(owner_id)')
      .eq('id', rating.order_id)
      .maybeSingle();
    const ownerId = (order?.restaurants as any)?.owner_id;
    if (ownerId !== user.id) {
      throw new AuthorizationError('You can only access ratings for your own orders or restaurant');
    }
  }
}

/** Assert the user can read a loyalty transaction. Self or admin. */
export async function assertCanReadLoyalty(user: AnyAuthed, transactionId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: tx, error } = await supabase
    .from('loyalty_transactions')
    .select('id, user_id')
    .eq('id', transactionId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!tx) throw new NotFoundError('Loyalty transaction');
  if (tx.user_id !== user.id) {
    throw new AuthorizationError('You can only access your own loyalty data');
  }
}

/** Assert the user can read a support ticket. Self or admin. */
export async function assertCanReadTicket(user: AnyAuthed, ticketId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: t, error } = await supabase
    .from('support_tickets')
    .select('id, user_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!t) throw new NotFoundError('Support ticket');
  if (t.user_id !== user.id) {
    throw new AuthorizationError('You can only access your own support tickets');
  }
}

/** Assert the user can read a share-link. Self or admin. */
export async function assertCanReadShareLink(user: AnyAuthed, shareLinkId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: sl, error } = await supabase
    .from('share_links')
    .select('id, user_id')
    .eq('id', shareLinkId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!sl) throw new NotFoundError('Share link');
  if (sl.user_id !== user.id) {
    throw new AuthorizationError('You can only access your own share links');
  }
}

/** Assert the user can read a driver_working_hours row. Self or admin. */
export async function assertCanReadDriverHours(user: AnyAuthed, hoursId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: h, error } = await supabase
    .from('driver_working_hours')
    .select('id, driver_id')
    .eq('id', hoursId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!h) throw new NotFoundError('Driver working hours');
  if (h.driver_id !== user.id) {
    throw new AuthorizationError('You can only access your own working hours');
  }
}

/** Assert the user can read a push subscription. Self or admin. */
export async function assertCanReadPushSubscription(user: AnyAuthed, subId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: ps, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id')
    .eq('id', subId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!ps) throw new NotFoundError('Push subscription');
  if (ps.user_id !== user.id) {
    throw new AuthorizationError('You can only access your own push subscriptions');
  }
}

/** Assert the user can read an expansion request. Public-by-default; only
 *  the submitter (if authenticated) or admin can read. */
export async function assertCanReadExpansionRequest(user: AnyAuthed, reqId: string): Promise<void> {
  if (isAdmin(user)) return;
  const supabase = createServerClient();
  const { data: er, error } = await supabase
    .from('expansion_requests')
    .select('id, user_id')
    .eq('id', reqId)
    .maybeSingle();
  if (error) throw new AppError('Database error', { statusCode: 500, code: 'DB_ERROR' });
  if (!er) throw new NotFoundError('Expansion request');
  if (er.user_id && er.user_id !== user.id) {
    throw new AuthorizationError('You can only access your own expansion requests');
  }
}
