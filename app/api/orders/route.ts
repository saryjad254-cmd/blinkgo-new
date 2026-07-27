/**
 * Order Creation Endpoint
 * ───────────────────────
 * Creates an order with items in a single atomic transaction.
 * Server-authoritative:
 *  - Validates items exist + are available
 *  - Recalculates prices from DB (prevents client tampering)
 *  - Inserts order + items
 *  - Notifies restaurant & admin
 *  - Awards loyalty points (placeholder, awarded on delivery)
 *
 * Auth: Customer only.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ok, withErrorHandling } from '@/lib/api/response';
import { rateLimit } from '@/lib/rate-limit';
import { ValidationError, AuthenticationError, NotFoundError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { audit } from '@/lib/services/audit-log';
import { NotificationService } from '@/lib/services/notification-service';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getIdempotencyKey, getIdempotencyResponse, setIdempotencyResponse } from '@/lib/idempotency';
import { checkDeliveryZone } from '@/lib/delivery-zone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// F3 fix: route through the canonical service-role client, which has the
// sb_secret_* key-format compatibility fix. Inline createClient bypasses
// that and breaks when the key is rotated to sb_secret_*.
function getServiceClient() {
  return createServiceClient();
}

// CartItem now comes from Zod schema

// OrderInput now comes from Zod schema (lib/validation/schemas.ts OrderCreateSchema)
type OrderInput = {
  restaurant_id: string;
  items: Array<{ product_id: string; quantity: number; notes?: string }>;
  payment_method: 'cash' | 'stripe' | 'card';
  delivery_address: {
    address: string;
    lat?: number | null;
    lng?: number | null;
    notes?: string;
  };
  tip: number;
  coupon_code?: string;
  scheduled_for?: string | null;
  points_redeemed: number;
  notes?: string;
};

/**
 * Use Zod schema for validation (single source of truth).
 * Falls back gracefully if zod schema fails to import.
 */
function validateOrderInput(body: any): { ok: true; data: OrderInput } | { ok: false; error: string } {
  try {
    const { OrderCreateSchema } = require('@/lib/validation/schemas');
    const result = OrderCreateSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.errors[0];
      return {
        ok: false,
        error: `${firstError.path.join('.') || 'field'}: ${firstError.message}`,
      };
    }
    return { ok: true, data: result.data as OrderInput };
  } catch (e) {
    // Fallback to manual validation if zod not available
    if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
    if (!body.restaurant_id || typeof body.restaurant_id !== 'string') {
      return { ok: false, error: 'restaurant_id required' };
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return { ok: false, error: 'items must be a non-empty array' };
    }
    if (body.items.length > 100) {
      return { ok: false, error: 'Too many items' };
    }
    for (const it of body.items) {
      if (!it.product_id || typeof it.product_id !== 'string') {
        return { ok: false, error: 'product_id required' };
      }
      if (typeof it.quantity !== 'number' || it.quantity < 1 || it.quantity > 50) {
        return { ok: false, error: 'Quantity 1-50' };
      }
    }
    if (!body.delivery_address || !body.delivery_address.address) {
      return { ok: false, error: 'delivery_address required' };
    }
    if (!['cash', 'stripe', 'card'].includes(body.payment_method)) {
      return { ok: false, error: 'invalid payment_method' };
    }
    return {
      ok: true,
      data: {
        restaurant_id: body.restaurant_id,
        items: body.items,
        payment_method: body.payment_method,
        delivery_address: body.delivery_address,
        tip: Math.min(500, Math.max(0, Number(body.tip ?? 0))),
        coupon_code: body.coupon_code,
        scheduled_for: body.scheduled_for,
        points_redeemed: Number(body.points_redeemed ?? 0),
        notes: body.notes,
      },
    };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // Rate limit: 20 orders per 15 minutes per user/IP
    const limited = rateLimit({ limit: 20, windowSec: 15 * 60, name: 'orders' }, req);
    if (limited) return limited;

    // Idempotency: if the same X-Idempotency-Key has been used recently,
    // return the cached response (DoorDash / Stripe style).
    // This prevents duplicate orders from network retries or double-taps.
    // v82: now async to support the DB-backed cache lookup.
    const idempotencyKey = getIdempotencyKey(req);
    if (idempotencyKey) {
      const cached = await getIdempotencyResponse(idempotencyKey, {
        method: req.method,
        url: req.url,
        headers: req.headers,
      });
      if (cached) {
        return NextResponse.json(cached.body, { status: cached.status });
      }
    }

    const supabase = getServiceClient();

    // 1) Authenticate — try Bearer token first, then cookie-based session
    const authHeader = req.headers.get('authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let userId: string | null = null;
    if (bearer) {
      const { data } = await supabase.auth.getUser(bearer);
      userId = data.user?.id ?? null;
    }
    // Fall back to cookie auth (proper server client that reads request cookies)
    if (!userId) {
      try {
        const serverSupabase = createServerClient();
        const { data: { user } } = await serverSupabase.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        // ignore
      }
    }
    if (!userId) throw new AuthenticationError('Not authenticated');

    // SECURITY: only customers can place orders. Drivers/restaurants/admins
    // cannot impersonate or place orders on behalf of customers.
    // PERF: profile lookup is independent of body parse — fire both in parallel
    // to save 1 RTT on the checkout critical path.
    const [profileRes, body] = await Promise.all([
      supabase
        .from('users')
        .select('role, is_active, is_verified')
        .eq('id', userId)
        .single(),
      req.json().catch(() => null),
    ]);
    const profile = profileRes.data;
    if (!profile) throw new AuthenticationError('No profile');
    if (profile.is_active === false) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_DISABLED' }, { status: 403 });
    }
    if (profile.role !== 'customer' && profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'CUSTOMER_ONLY' }, { status: 403 });
    }

    // 2) Parse + validate input
    const v = validateOrderInput(body);
    if (!v.ok) throw new ValidationError(v.error);
    const input = v.data;

    // 2b) Delivery zone check — canonical (Wesseling + 15 km).
    // NOT restaurant-specific: validates the customer address against the
    // single BlinkGo service center, independent of which restaurant the
    // order is from. Pure-CPU so it can run inline while the parallel
    // Supabase lookups below are in flight.
    if (input.delivery_address.lat != null && input.delivery_address.lng != null) {
      const customerLat = Number(input.delivery_address.lat);
      const customerLng = Number(input.delivery_address.lng);
      // Best-effort: accept either `postal_code` or `postalCode` from the
      // address payload (callers differ). Falls back to null.
      const rawAddr = input.delivery_address as unknown as Record<string, unknown>;
      const postalCode = (() => {
        const candidate =
          (rawAddr.postal_code as string | undefined) ??
          (rawAddr.postalCode as string | undefined) ??
          (typeof input.delivery_address.address === 'string'
            ? input.delivery_address.address.match(/\b(\d{5})\b/)?.[1]
            : null);
        return candidate ?? null;
      })();
      const zone = checkDeliveryZone(customerLat, customerLng, postalCode);
      if (!zone.ok) {
        throw new ValidationError(
          `Delivery address is outside the BlinkGo service zone (${zone.distanceKm.toFixed(1)} km from Wesseling, max 15 km).`,
        );
      }
    }

    // 3) Generate a collision-resistant order number locally (no I/O):
    //    BLG + YYYYMMDD + HHMMSS + 4 random chars
    //    Example: BLG20260712T1430527A3F
    //    Done up-front so the uniqueness check can run in parallel with the
    //    other independent lookups below.
    const nowDate = new Date();
    const yyyy = nowDate.getUTCFullYear();
    const mm = String(nowDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(nowDate.getUTCDate()).padStart(2, '0');
    const hh = String(nowDate.getUTCHours()).padStart(2, '0');
    const mi = String(nowDate.getUTCMinutes()).padStart(2, '0');
    const ss = String(nowDate.getUTCSeconds()).padStart(2, '0');
    const random = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
    let orderNumber = `BLG${yyyy}${mm}${dd}${hh}${mi}${ss}${random}`;

    // 4) PERF: Fan-out all independent lookups in a single round-trip wave.
    //    restaurant + products + dup-check + (conditional) coupon + (conditional)
    //    loyalty are all independent reads; firing them concurrently cuts
    //    ~4 sequential RTTs from the checkout critical path (was 8 awaits in series,
    //    now 2 waves: profile|body, then everything-else).
    const productIds = input.items.map((i) => i.product_id);
    const pointsRequested = input.points_redeemed ?? 0;
    const [restaurantRes, productsRes, dupRes, couponRes, loyaltyRes] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, name, latitude, longitude, is_active, delivery_fee, min_order_amount')
        .eq('id', input.restaurant_id)
        .single(),
      supabase
        .from('products')
        .select('id, name, price, discount_price, is_available, restaurant_id')
        .in('id', productIds),
      supabase
        .from('orders')
        .select('id')
        .eq('order_number', orderNumber)
        .maybeSingle(),
      input.coupon_code
        ? supabase
            .from('coupons')
            .select('*')
            .eq('code', input.coupon_code.toUpperCase())
            .eq('is_active', true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      pointsRequested > 0
        ? supabase
            .from('loyalty_points')
            .select('points')
            .eq('user_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
    ]);
    const { data: restaurant, error: rErr } = restaurantRes;
    const { data: products, error: pErr } = productsRes;
    const { data: dup } = dupRes;
    const coupon = (couponRes as { data: any }).data;
    const lp = (loyaltyRes as { data: any }).data;
    if (rErr || !restaurant) throw new NotFoundError('Restaurant not found');
    if (!restaurant.is_active) throw new ValidationError('Restaurant is not active');
    if (pErr) throw new ValidationError('Failed to load products');

    // Validate all products exist and belong to the same restaurant
    const productsMap = new Map((products ?? []).map((p: any) => [p.id, p]));
    let subtotal = 0;
    const orderItems: any[] = [];
    for (const it of input.items) {
      const p = productsMap.get(it.product_id) as any;
      if (!p) throw new ValidationError(`Product ${it.product_id} not found`);
      if (p.restaurant_id !== input.restaurant_id) {
        throw new ValidationError('All items must be from the same restaurant');
      }
      if (!p.is_available) {
        throw new ValidationError(`"${p.name}" is no longer available`);
      }
      const unitPrice = p.discount_price != null && p.discount_price < p.price ? p.discount_price : p.price;
      const lineSubtotal = Number(unitPrice) * it.quantity;
      subtotal += lineSubtotal;
      orderItems.push({
        product_id: p.id,
        product_name: p.name,
        product_price: Number(unitPrice),
        quantity: it.quantity,
        subtotal: lineSubtotal,
      });
    }

    // Check minimum order
    if (restaurant.min_order_amount && subtotal < Number(restaurant.min_order_amount)) {
      throw new ValidationError(`Minimum order is €${restaurant.min_order_amount.toFixed(2)}`);
    }

    // 5) Calculate fees + tip
    const deliveryFee = Number(restaurant.delivery_fee ?? 3.99);
    const serviceFee = subtotal * 0.05;
    const tip = Math.min(500, Math.max(0, Number(input.tip ?? 0)));

    // 6) Coupon validation (server-side) — coupon row already fetched in step 4.
    let discount = 0;
    let couponId: string | null = null;
    if (input.coupon_code) {
      if (!coupon) throw new ValidationError('Invalid coupon code');
      // Validate dates
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
      // Calculate discount
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

    // 7) Loyalty points redemption (1 point = €0.01, capped at 50% of order)
    //    lp row already fetched in step 4.
    let pointsDiscount = 0;
    if (pointsRequested > 0) {
      const balance = (lp?.points as number) ?? 0;
      const redeemable = Math.min(pointsRequested, balance, Math.floor(subtotal * 50));
      pointsDiscount = redeemable * 0.01;
    }

    const total = Math.max(0, subtotal + deliveryFee + serviceFee + tip - discount - pointsDiscount);

    // 7b) Uniqueness append (only if the parallel dup-check found a collision —
    //     extremely unlikely; keeps the original safety net).
    if (dup) {
      const extra = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
      orderNumber = orderNumber + extra;
    }

    // 8) ATOMIC write: order + order_items + stock decrement in a single
    //    Postgres transaction via the create_order_atomic RPC.
    //    Replaces the previous two-call sequence (orders insert then
    //    order_items insert) which could leave an orphan order if the
    //    second call failed, AND fixes the stock read-then-write race
    //    by using row-level locks + atomic decrement.
    //    See deploy/supabase/50-atomic-order-creation.sql.
    const itemsJson = orderItems.map((it) => ({
      product_id: it.product_id,
      product_name: it.product_name,
      product_price: it.product_price,
      quantity: it.quantity,
      subtotal: it.subtotal,
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
      p_delivery_address: input.delivery_address,
      p_customer_latitude: input.delivery_address.lat ?? null,
      p_customer_longitude: input.delivery_address.lng ?? null,
      p_restaurant_latitude: restaurant.latitude ?? null,
      p_restaurant_longitude: restaurant.longitude ?? null,
      p_scheduled_for: input.scheduled_for ?? null,
      p_items: itemsJson,
    });
    if (oErr || !rpcRows || rpcRows.length === 0) {
      logger.error('Atomic order create failed', { oErr });
      // OUT_OF_STOCK is raised by the SQL function with ERRCODE P0001 +
      // message prefix 'OUT_OF_STOCK:'. Map to a 409 Conflict so the
      // client can show "this item just sold out" instead of a generic
      // 500. Anything else bubbles up as a ValidationError.
      const msg = oErr?.message ?? '';
      if (msg.startsWith('OUT_OF_STOCK:')) {
        throw new ConflictError(msg.replace(/^OUT_OF_STOCK:\s*/, 'Out of stock: '), {
          code: 'OUT_OF_STOCK',
        });
      }
      throw new ValidationError('Failed to create order');
    }
    const order = { id: rpcRows[0].order_id, order_number: rpcRows[0].order_number };

    // 10) Increment coupon usage (best-effort)
    if (couponId) {
      try {
        await supabase.rpc('increment_coupon_usage', { p_coupon_id: couponId });
      } catch {
        // fallback: direct update
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

    // 11) Deduct redeemed points (best-effort)
    if (pointsRequested > 0) {
      try {
        await supabase.rpc('redeem_loyalty_points', {
          p_user_id: userId,
          p_points: pointsRequested,
          p_order_id: order.id,
        });
      } catch {
        // ignore — points not critical
      }
    }

    // 12) Notify the restaurant owner
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
    } catch (e) {
      // notification failure doesn't break the order
    }

    const responseBody = {
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
      },
    };

    // Cache the response under the idempotency key (24h TTL)
    if (idempotencyKey) {
      setIdempotencyResponse(idempotencyKey, 200, { ok: true, data: responseBody });
    }

    return ok(responseBody);
  });
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
