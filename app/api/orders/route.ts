/**
 * Order Endpoints — using apiRoute() canonical pattern
 * ───────────────────────────────────────────────────────
 * GET  /api/orders  → list orders (customer/driver/admin)
 * POST /api/orders  → create order (customer only)
 *
 * The POST handler preserves all the v80+ business logic:
 *   - Server-authoritative pricing (recalculates from DB)
 *   - Atomic order creation via RPC
 *   - Delivery zone check
 *   - Coupon + loyalty validation
 *   - Restaurant notification
 *   - Idempotency key handling
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { apiRoute, ok, fail, log, tier, withIdempotency, getIdempotencyKey } from '@/lib/api/canonical';
import { ValidationError, NotFoundError, ConflictError } from '@/lib/foundation/errors';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NotificationService } from '@/lib/services/notification-service';
import { checkDeliveryZone } from '@/lib/delivery-zone';
import { OrderCreateSchema } from '@/lib/validation/schemas';
import { z, type infer as ZodInfer } from '@/lib/foundation/zod-mini';
import { hasDeliveryPreferences, sanitizeDeliveryPreferences } from '@/lib/delivery-preferences';
import { postOrderFinancialJournal } from '@/lib/finance/ledger';
import { requireFeatureFlag } from '@/lib/platform/feature-flags';
import { verifyCheckoutDraftSignature } from '@/lib/checkout/draft-signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Body schema (canonical zod-mini) ────────────────────────
const OrderBodySchema = z.object({
  restaurant_id: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.number(),
    config_key: z.string().optional(),
    notes: z.string().optional(),
    configuration: z.unknown().optional(),
  })),
  payment_method: z.string(),  // 'cash' | 'stripe' | 'card'
  fulfillment_type: z.enum(['delivery', 'pickup']).optional(),
  delivery_address: z.object({
    address: z.string().min(1),
    lat: z.number().optional(),
    lng: z.number().optional(),
    notes: z.string().optional(),
    delivery_preferences: z.unknown().optional(),
  }).optional(),
  tip: z.number().optional(),
  coupon_code: z.string().optional(),
  scheduled_for: z.string().optional(),
  points_redeemed: z.number().optional(),
  notes: z.string().optional(),
  group_order_id: z.string().optional(),
  checkout_draft_id: z.string().optional(),
});

type OrderInput = ZodInfer<typeof OrderBodySchema>;

interface ProductRow {
  id: string;
  name: string;
  price: number;
  discount_price: number | null;
  is_available: boolean;
  is_active: boolean;
  approval_status: string;
  archived_at: string | null;
  restaurant_id: string;
}

interface CouponRow {
  id: string;
  type: 'percentage' | 'fixed' | string;
  value: number;
  start_date: string | null;
  end_date: string | null;
  usage_limit: number | null;
  usage_count: number;
  min_order_amount: number | null;
  max_discount: number | null;
}

interface LoyaltyRow { points: number }

interface OrderItem {
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
  config_key: string;
  configuration: Record<string, unknown>;
}

interface ConfirmedCashDraft extends Record<string, unknown> {
  payment_method?: string;
  can_place_order?: boolean;
  restaurant_id?: string;
  fulfillment_type?: 'delivery' | 'pickup';
  delivery_address?: OrderInput['delivery_address'];
  tip?: number;
  coupon?: { code?: string } | null;
  scheduled_for?: string | null;
  points_redeemed?: number;
  group_order_id?: string;
  lines?: Array<{
    product_id?: string;
    quantity?: number;
    config_key?: string;
    configuration?: Record<string, unknown>;
  }>;
}

// ── GET — list orders (admin/driver/restaurant) ─────────────
export const GET = apiRoute({
  method: 'GET',
  auth: 'required',
  roles: ['admin', 'super_admin', 'manager', 'driver', 'restaurant'],
  rateLimit: tier('lenient'),
  handler: async () => {
    return ok({ orders: [], note: 'Use /api/admin/orders, /api/driver/orders, or /api/orders/recent for filtered lists' });
  },
});

// ── POST — create order ──────────────────────────────────────
export const POST = apiRoute({
  method: 'POST',
  auth: 'required',
  roles: ['customer', 'admin', 'super_admin'],
  rateLimit: tier('strict'),
  bodySchema: OrderBodySchema,
  handler: async ({ req, body, user }) => {
    if (!user) throw new ValidationError('Authentication required');
    const input = body as OrderInput;
    await requireFeatureFlag('orders.create.enabled', { userId: user.id, role: user.role, activeOrder: false });
    await requireFeatureFlag(
      input.payment_method === 'cash' ? 'payments.cash.enabled' : 'payments.stripe.enabled',
      { userId: user.id, role: user.role, activeOrder: false },
    );
    if (input.fulfillment_type === 'pickup') {
      await requireFeatureFlag('features.customer_pickup.enabled', { userId: user.id, role: user.role });
    }
    if (input.group_order_id) {
      await requireFeatureFlag('features.group_orders.enabled', { userId: user.id, role: user.role });
    }

    return withIdempotency(
      { req, user, method: 'POST' },
      async () => createOrderLogic(req, input, user.id),
      { fingerprint: input },
    );
  },
});

// ── Business logic (extracted for testability) ───────────────
async function createOrderLogic(
  req: NextRequest,
  submittedInput: OrderInput,
  userId: string,
): Promise<NextResponse> {
  const supabase = createServiceClient();
  let input = submittedInput;
  const checkoutDraftId = submittedInput.checkout_draft_id;
  const requestIdempotencyKey = getIdempotencyKey(req);
  if (checkoutDraftId) {
    if (!/^DRF-\d{14}-[0-9A-F]{8}-[0-9A-F]{4}$/.test(checkoutDraftId)) {
      throw new ValidationError('Invalid checkout draft');
    }
    const { data: draftRow, error: draftError } = await supabase
      .from('order_drafts')
      .select('id,customer_id,draft,signature,expires_at,used,confirmed_by,deleted_at')
      .eq('id', checkoutDraftId)
      .maybeSingle();
    const draft = draftRow?.draft as ConfirmedCashDraft | undefined;
    if (
      draftError || !draftRow || !draft || draftRow.customer_id !== userId ||
      draftRow.deleted_at || new Date(draftRow.expires_at).getTime() <= Date.now() ||
      draftRow.used !== true || draftRow.confirmed_by !== userId ||
      draft.payment_method !== 'cash' || draft.can_place_order !== true ||
      !verifyCheckoutDraftSignature(draft, draftRow.signature)
    ) {
      throw new ValidationError('Checkout draft is invalid or not confirmed');
    }
    input = {
      restaurant_id: String(draft.restaurant_id),
      items: Array.isArray(draft.lines) ? draft.lines.map((line) => ({
        product_id: String(line.product_id),
        quantity: Number(line.quantity),
        config_key: String(line.config_key),
        configuration: line.configuration ?? {},
      })) : [],
      payment_method: 'cash',
      fulfillment_type: draft.fulfillment_type === 'pickup' ? 'pickup' : 'delivery',
      delivery_address: draft.delivery_address ?? undefined,
      tip: Number(draft.tip ?? 0),
      coupon_code: draft.coupon?.code ?? undefined,
      scheduled_for: draft.scheduled_for ?? undefined,
      points_redeemed: Number(draft.points_redeemed ?? 0),
      notes: draft.delivery_address?.notes ?? undefined,
      group_order_id: draft.group_order_id ?? undefined,
      checkout_draft_id: checkoutDraftId,
    } as OrderInput;
  }
  const fulfillmentType: 'delivery' | 'pickup' = input.fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
  const deliveryAddress = input.delivery_address;
  if (fulfillmentType === 'delivery' && !deliveryAddress) {
    throw new ValidationError('Delivery address is required');
  }
  const deliveryPreferences = sanitizeDeliveryPreferences(deliveryAddress?.delivery_preferences);

  // Reuse the cart trust boundary so modifiers and their price deltas are
  // validated identically in cart, draft and final cash-order creation.
  const cartValidationResponse = await fetch(new URL('/api/cart/validate', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: input.restaurant_id,
      items: input.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        ...(item.configuration ?? {}),
      })),
    }),
  });
  const cartValidation = await cartValidationResponse.json().catch(() => ({}));
  if (!cartValidationResponse.ok || cartValidation.ok !== true || cartValidation.lines?.length !== input.items.length) {
    throw new ValidationError('One or more product options are invalid');
  }
  const validatedLines = (cartValidation.lines as Array<{ product_id: string; config_key: string; configuration: Record<string, unknown>; unit_price: number; line_subtotal: number }>).map((line, index) => ({
    ...line,
    quantity: Number(input.items[index]?.quantity),
  }));
  if (input.group_order_id) {
    const [{ data: group }, { data: participant }, { data: groupItems }] = await Promise.all([
      supabase.from('group_orders').select('id,restaurant_id,host_user_id,status,completed_order_id').eq('id', input.group_order_id).maybeSingle(),
      supabase.from('group_order_participants').select('id,is_host').eq('group_order_id', input.group_order_id).eq('user_id', userId).maybeSingle(),
      supabase.from('group_order_items').select('config_key,quantity').eq('group_order_id', input.group_order_id),
    ]);
    if (!group || !participant?.is_host || group.host_user_id !== userId) throw new ValidationError('GROUP_ORDER_NOT_FOUND');
    if (group.status !== 'locked' || group.completed_order_id || group.restaurant_id !== input.restaurant_id) throw new ValidationError('GROUP_ORDER_NOT_CHECKOUT_READY');
    const aggregate = (lines: Array<{ config_key: string; quantity: number }>) => Array.from(lines.reduce((map, line) => map.set(line.config_key, (map.get(line.config_key) ?? 0) + Number(line.quantity)), new Map<string, number>())).sort(([a], [b]) => a.localeCompare(b));
    if (JSON.stringify(aggregate((groupItems ?? []) as Array<{ config_key: string; quantity: number }>)) !== JSON.stringify(aggregate(validatedLines))) {
      log.warn('orders.group_snapshot_mismatch', { groupOrderId: input.group_order_id, locked: aggregate((groupItems ?? []) as Array<{ config_key: string; quantity: number }>), checkout: aggregate(validatedLines) });
      throw new ValidationError('GROUP_ORDER_ITEMS_CHANGED');
    }
  }

  // SECURITY: only customers can place orders
  const { data: profile } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', userId)
    .single();
  if (!profile) throw new ValidationError('No profile');
  if (profile.is_active === false) {
    return fail(new ValidationError('Account is disabled'));
  }

  // 2) Delivery zone check
  if (fulfillmentType === 'delivery' && deliveryAddress?.lat != null && deliveryAddress.lng != null) {
    const customerLat = Number(deliveryAddress.lat);
    const customerLng = Number(deliveryAddress.lng);
    const addr = deliveryAddress as unknown as Record<string, unknown>;
    const postalCode = (addr.postal_code as string | undefined) ??
      (addr.postalCode as string | undefined) ??
      (typeof deliveryAddress.address === 'string'
        ? deliveryAddress.address.match(/\b(\d{5})\b/)?.[1]
        : null) ?? null;
    const zone = checkDeliveryZone(customerLat, customerLng, postalCode);
    if (!zone.ok) {
      throw new ValidationError(
        `Delivery address is outside the BlinkGo service zone (${zone.distanceKm.toFixed(1)} km from Wesseling, max 15 km).`,
      );
    }
  }

  // 3) Order number
  const nowDate = new Date();
  const yyyy = nowDate.getUTCFullYear();
  const mm = String(nowDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(nowDate.getUTCDate()).padStart(2, '0');
  const hh = String(nowDate.getUTCHours()).padStart(2, '0');
  const mi = String(nowDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(nowDate.getUTCSeconds()).padStart(2, '0');
  const random = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
  let orderNumber = checkoutDraftId
    ? `BLGD${crypto.createHash('sha256').update(checkoutDraftId).digest('hex').slice(0, 20).toUpperCase()}`
    : requestIdempotencyKey
      ? `BLGI${crypto.createHash('sha256').update(`${userId}:${requestIdempotencyKey}`).digest('hex').slice(0, 20).toUpperCase()}`
    : `BLG${yyyy}${mm}${dd}${hh}${mi}${ss}${random}`;

  // 4) Parallel lookups
  const productIds = input.items.map((item) => item.product_id);
  const pointsRequested = input.points_redeemed ?? 0;
  const [restaurantRes, productsRes, dupRes, couponRes, loyaltyRes] = await Promise.all([
    supabase
      .from('restaurants')
      .select('id, name, latitude, longitude, is_active, is_paused, is_hidden, archived_at, delivery_fee, min_order_amount, pickup_enabled')
      .eq('id', input.restaurant_id)
      .single(),
    supabase
      .from('products')
      .select('id, name, price, discount_price, is_available, is_active, approval_status, archived_at, restaurant_id')
      .in('id', productIds),
    supabase
      .from('orders')
      .select('id,order_number,status,total,fulfillment_type')
      .eq('order_number', orderNumber)
      .eq('customer_id', userId)
      .maybeSingle(),
    input.coupon_code
      ? supabase
          .from('coupons')
          .select('*')
          .eq('code', input.coupon_code.toUpperCase())
          .eq('is_active', true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    pointsRequested > 0
      ? supabase
          .from('loyalty_points')
          .select('points')
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const { data: restaurant, error: rErr } = restaurantRes;
  const { data: products, error: pErr } = productsRes;
  const { data: dup } = dupRes;
  const coupon = couponRes.data as CouponRow | null;
  const lp = loyaltyRes.data as LoyaltyRow | null;
  if ((checkoutDraftId || requestIdempotencyKey) && dup) {
    return ok({ order: { ...dup, reused: true } });
  }
  if (rErr || !restaurant) throw new NotFoundError('Restaurant not found');
  // Older deployed schemas may omit this column from compatibility views.
  // Only an explicit false means the restaurant is disabled.
  if (restaurant.is_active === false) throw new ValidationError('Restaurant is not active');
  if (restaurant.is_hidden === true || restaurant.archived_at) throw new ValidationError('Restaurant is not available');
  if (restaurant.is_paused === true) throw new ValidationError('Restaurant is not accepting orders');
  if (fulfillmentType === 'pickup' && restaurant.pickup_enabled === false) {
    throw new ValidationError('Customer pickup is not available at this restaurant');
  }
  if (pErr) throw new ValidationError('Failed to load products');

  // Validate products
  const productsMap = new Map(((products ?? []) as ProductRow[]).map((product) => [product.id, product]));
  let subtotal = 0;
  const orderItems: OrderItem[] = [];
  for (const [index, it] of input.items.entries()) {
    const p = productsMap.get(it.product_id);
    const validatedLine = validatedLines[index];
    if (!p) throw new ValidationError(`Product ${it.product_id} not found`);
    if (p.restaurant_id !== input.restaurant_id) {
      throw new ValidationError('All items must be from the same restaurant');
    }
    if (!p.is_available || p.is_active === false || p.approval_status !== 'approved' || p.archived_at) {
      throw new ValidationError(`"${p.name}" is no longer available`);
    }
    if (!validatedLine || validatedLine.product_id !== p.id) throw new ValidationError('Product validation mismatch');
    const unitPrice = Number(validatedLine.unit_price);
    const lineSubtotal = Number(validatedLine.line_subtotal);
    subtotal += lineSubtotal;
    orderItems.push({
      product_id: p.id,
      product_name: p.name,
      product_price: Number(unitPrice),
      quantity: validatedLine.quantity,
      subtotal: lineSubtotal,
      config_key: validatedLine.config_key,
      configuration: validatedLine.configuration,
    });
  }

  const restaurantCommercial = restaurant as typeof restaurant & {
    minimum_order?: number | null;
    min_order?: number | null;
  };
  const restaurantMinimumOrder = Number(
    restaurantCommercial.min_order_amount ?? restaurantCommercial.minimum_order ?? restaurantCommercial.min_order ?? 0,
  );
  if (restaurantMinimumOrder > 0 && subtotal < restaurantMinimumOrder) {
    throw new ValidationError(`Minimum order is €${restaurantMinimumOrder.toFixed(2)}`);
  }

  // 5) Calculate fees + tip
  const deliveryFee = fulfillmentType === 'pickup' ? 0 : Number(restaurant.delivery_fee ?? 3.99);
  const serviceFee = subtotal * 0.05;
  const tip = Math.min(500, Math.max(0, Number(input.tip ?? 0)));

  // 6) Coupon
  let discount = 0;
  let couponId: string | null = null;
  if (input.coupon_code) {
    if (!coupon) throw new ValidationError('Invalid coupon code');
    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) {
      throw new ValidationError('Coupon not yet active');
    }
    if (coupon.end_date && new Date(coupon.end_date) < now) {
      throw new ValidationError('Coupon expired');
    }
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      throw new ValidationError('Coupon usage limit reached');
    }
    if (coupon.min_order_amount && subtotal < Number(coupon.min_order_amount)) {
      throw new ValidationError(`Minimum order €${coupon.min_order_amount} for this coupon`);
    }
    if (coupon.type === 'percentage') {
      discount = subtotal * (coupon.value / 100);
      if (coupon.max_discount && discount > coupon.max_discount) {
        discount = coupon.max_discount;
      }
    } else if (coupon.type === 'fixed') {
      discount = coupon.value;
    } else {
      discount = coupon.value;
    }
    discount = Math.min(discount, subtotal);
    couponId = coupon.id;
  }

  // 7) Loyalty points
  let pointsDiscount = 0;
  if (pointsRequested > 0) {
    const balance = (lp?.points as number) ?? 0;
    const redeemable = Math.min(pointsRequested, balance, Math.floor(subtotal * 50));
    pointsDiscount = redeemable * 0.01;
  }

  const total = Math.max(0, subtotal + deliveryFee + serviceFee + tip - discount - pointsDiscount);

  if (dup && !checkoutDraftId) {
    const extra = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
    orderNumber = orderNumber + extra;
  }

  // 8) Atomic order creation
  const itemsJson = orderItems.map((it) => ({
    product_id: it.product_id,
    product_name: it.product_name,
    product_price: it.product_price,
    quantity: it.quantity,
    subtotal: it.subtotal,
    configuration: it.configuration,
    config_key: it.config_key,
  }));

  const { data: rpcRows, error: oErr } = await supabase.rpc('create_order_atomic', {
    p_order_number: orderNumber,
    p_customer_id: userId,
    p_restaurant_id: input.restaurant_id,
    p_subtotal: subtotal,
    p_delivery_fee: deliveryFee,
    p_service_fee: serviceFee,
    p_tip: tip,
    p_discount: discount + pointsDiscount,
    p_total: total,
    p_payment_method: input.payment_method,
    p_delivery_address: fulfillmentType === 'pickup' ? null : {
      ...(deliveryAddress ?? {}),
      delivery_preferences: deliveryPreferences,
    },
    p_customer_latitude: fulfillmentType === 'pickup' ? null : deliveryAddress?.lat ?? null,
    p_customer_longitude: fulfillmentType === 'pickup' ? null : deliveryAddress?.lng ?? null,
    p_restaurant_latitude: restaurant.latitude ?? null,
    p_restaurant_longitude: restaurant.longitude ?? null,
    p_scheduled_for: input.scheduled_for ?? null,
    p_items: itemsJson,
    p_fulfillment_type: fulfillmentType,
  });
  if (oErr || !rpcRows || rpcRows.length === 0) {
    if (checkoutDraftId || requestIdempotencyKey) {
      const { data: existing } = await supabase
        .from('orders')
        .select('id,order_number,status,total,fulfillment_type')
        .eq('order_number', orderNumber)
        .eq('customer_id', userId)
        .maybeSingle();
      if (existing) return ok({ order: { ...existing, reused: true } });
    }
    log.error('Atomic order create failed', { oErr: oErr?.message });
    const msg = oErr?.message ?? '';
    if (msg.startsWith('OUT_OF_STOCK:')) {
      throw new ConflictError(msg.replace(/^OUT_OF_STOCK:\s*/, 'Out of stock: '), {
        code: 'OUT_OF_STOCK',
      });
    }
    throw new ValidationError('Failed to create order');
  }
  const order = { id: rpcRows[0].order_id, order_number: rpcRows[0].order_number };
  if (fulfillmentType === 'delivery' && hasDeliveryPreferences(deliveryPreferences)) {
    const { error: preferenceError } = await supabase
      .from('order_delivery_preferences')
      .upsert({
        order_id: order.id,
        customer_id: userId,
        preferences: deliveryPreferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'order_id' });
    if (preferenceError) {
      log.error('Delivery preference persistence failed', { orderId: order.id, error: preferenceError.message });
      throw new ConflictError('Order was created, but delivery preferences could not be saved', {
        code: 'DELIVERY_PREFERENCES_FAILED',
      });
    }
  }
  if (input.group_order_id) {
    const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_group_order', {
      p_group_order_id: input.group_order_id,
      p_order_id: order.id,
      p_host_user_id: userId,
    });
    if (finalizeError || finalized !== true) {
      log.error('Group order finalize failed after order creation', { groupOrderId: input.group_order_id, orderId: order.id, error: finalizeError?.message });
      throw new ConflictError('Order was created, but the group status could not be finalized', { code: 'GROUP_ORDER_FINALIZE_FAILED' });
    }
  }

  // 9) Increment coupon usage
  if (couponId) {
    try {
      await supabase.rpc('increment_coupon_usage', { p_coupon_id: couponId });
    } catch {
      const { data: c2 } = await supabase
        .from('coupons')
        .select('usage_count')
        .eq('id', couponId)
        .maybeSingle();
      const current = (c2?.usage_count as number) ?? 0;
      await supabase
        .from('coupons')
        .update({ usage_count: current + 1 })
        .eq('id', couponId);
    }
  }

  // 10) Deduct points
  if (pointsRequested > 0) {
    try {
      await supabase.rpc('redeem_loyalty_points', {
        p_user_id: userId,
        p_points: pointsRequested,
        p_order_id: order.id,
      });
    } catch {
      // ignore
    }
  }

  // Append-only and idempotent; a missing ledger migration is reported in
  // admin reconciliation without rolling back a successfully created order.
  await postOrderFinancialJournal(order.id);

  // 11) Notify restaurant
  try {
    const { data: owner } = await supabase
      .from('restaurants')
      .select('owner_id, name')
      .eq('id', input.restaurant_id)
      .single();
    if (owner?.owner_id) {
      await NotificationService.send({
        userId: owner.owner_id,
        type: 'order_placed',
        title: 'Neue Bestellung',
        body: `${orderNumber} • €${total.toFixed(2)}`,
        data: { order_id: order.id, order_number: orderNumber },
      });
    }
  } catch {
    // notification failure doesn't break the order
  }

  return ok({
    order: {
      id: order.id,
      order_number: orderNumber,
      subtotal,
      delivery_fee: deliveryFee,
      service_fee: serviceFee,
      tip,
      discount: discount + pointsDiscount,
      total,
      items: orderItems,
      status: 'pending',
      fulfillment_type: fulfillmentType,
    },
  });
}

// Suppress unused imports warning
void createServerClient;
void OrderCreateSchema;
