/**
 * POST /api/cart/quote
 *
 * Server-authoritative cart quote. The cart page MUST call this endpoint
 * before displaying totals to the customer. The client must NEVER compute
 * its own subtotal, fees, or grand total — every cent is re-derived here
 * from the canonical product+modifier data.
 *
 * Phase 7E — Cart Final Commercial Certification.
 *
 * Body:
 *   {
 *     restaurant_id: string,
 *     items: Array<{
 *       product_id: string,
 *       quantity: number,
 *       config_key: string,             // client-side key (for line identification)
 *       configuration: CartLineConfiguration,
 *     }>,
 *     tip?: number,                     // tip in EUR (server clamps to [0, 500])
 *     coupon_code?: string,             // optional — server validates + applies
 *     points_redeemed?: number,         // loyalty points to redeem
 *     delivery_address?: { lat, lng, address, postal_code? },
 *   }
 *
 * Response:
 *   {
 *     ok: boolean,
 *     issues: Array<{ kind, message, line?: string }>,
 *     restaurant: { id, name, is_paused, is_hidden, is_active, min_order_amount, delivery_fee },
 *     lines: Array<{
 *       config_key: string,             // server-issued
 *       product_id: string,
 *       product_name: string,
 *       unit_price: number,             // server-computed (with modifier deltas)
 *       line_subtotal: number,          // unit_price * quantity
 *       issues: string[],               // per-line issues (e.g. "out of stock")
 *     }>,
 *     subtotal: number,
 *     delivery_fee: number,
 *     service_fee: number,
 *     tip: number,
 *     discount: number,                 // coupon + points discount
 *     total: number,                    // grand total (always >= 0)
 *     coupon: { code, type, value, min_order_amount, max_discount } | null,
 *     points_discount: number,
 *     min_order_amount: number,
 *     min_order_ok: boolean,
 *     delivery_zone_ok: boolean,
 *     delivery_distance_km: number | null,
 *     server_key_issued_at: string,
 *     can_place_order: boolean,         // true iff no blocking issues
 *   }
 *
 * SECURITY: The client never sets the price. The client never sets the
 * coupon discount. The client never sets the delivery fee. Everything is
 * re-derived from the database. The only client inputs that influence
 * the totals are:
 *   - product_id (must exist)
 *   - quantity (must be a positive integer, clamped to [1, 99])
 *   - selected_modifiers, modifier_quantities (validated against schema)
 *   - tip (clamped to [0, 500])
 *   - coupon_code (validated against DB)
 *   - points_redeemed (validated against user balance)
 *
 * Cross-restaurant products are rejected. Hidden / paused / deleted
 * restaurants or products are rejected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverDeriveKey, type CartLineConfiguration } from '@/lib/cart-key';
import { STANDARD_DELIVERY_FEE, SERVICE_FEE_RATE } from '@/lib/config/fees';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getSupabaseServerRuntimeConfig, supabaseServiceHeaders } from '@/lib/supabase/runtime-config';
import { resolveConfiguredDeliveryZone } from '@/lib/services/delivery-zone-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUANTITY = 99;
const MIN_QUANTITY = 1;
const MIN_TIP = 0;
const MAX_TIP = 500;

interface QuoteItemInput {
  product_id: string;
  quantity: number;
  config_key?: string;
  configuration?: CartLineConfiguration;
}

interface QuoteRequest {
  restaurant_id: string;
  fulfillment_type?: 'delivery' | 'pickup';
  items: QuoteItemInput[];
  tip?: number;
  coupon_code?: string;
  points_redeemed?: number;
  delivery_address?: {
    lat?: number;
    lng?: number;
    address?: string;
    postal_code?: string;
  };
}

interface RestaurantRow {
  id: string;
  name: string;
  type: string | null;
  is_active: boolean;
  is_paused: boolean;
  is_hidden: boolean;
  delivery_fee: number | string | null;
  min_order_amount?: number | string | null;
  minimum_order?: number | string | null;
  min_order?: number | string | null;
  pickup_enabled: boolean | null;
  pickup_instructions: string | null;
  address: string | null;
}

interface ProductModifierOption {
  id: string;
  price_delta?: number | string | null;
}

interface ProductModifier {
  id: string;
  name: string;
  required?: boolean;
  min_select: number;
  max_select: number;
  options: ProductModifierOption[];
}

interface ProductRow {
  id: string;
  name: string;
  restaurant_id: string;
  price: number | string;
  discount_price: number | string | null;
  is_hidden: boolean;
  is_active: boolean;
  is_available: boolean;
  approval_status: string | null;
  archived_at: string | null;
  product_kind: string | null;
  legal_information_complete: boolean | null;
  modifiers?: ProductModifier[] | null;
}

interface CouponRow {
  code: string;
  type: string;
  value: number | string;
  start_date: string | null;
  end_date: string | null;
  usage_limit: number | null;
  usage_count: number | null;
  min_order_amount: number | string | null;
  max_discount: number | string | null;
}

interface LoyaltyPointsRow {
  points: number | string | null;
}

interface QuoteLine {
  config_key: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  line_subtotal: number;
  quantity: number;
  configuration: CartLineConfiguration;
  issues: string[];
}

function safeNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function safeInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

export async function POST(req: NextRequest) {
  let body: QuoteRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  if (!body || !body.restaurant_id || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const config = getSupabaseServerRuntimeConfig();
  if (!config) return NextResponse.json({ ok: false, error: 'service_unavailable' }, { status: 503 });
  const { baseUrl } = config;
  const serviceHeaders = supabaseServiceHeaders(config);
  const issues: Array<{ kind: string; message: string; line?: string }> = [];

  // 1) Load restaurant
  const restRes = await fetch(
    `${baseUrl}/rest/v1/restaurants?select=id,name,type,is_active,is_paused,is_hidden,delivery_fee,min_order_amount,pickup_enabled,pickup_instructions,address&id=eq.${body.restaurant_id}&archived_at=is.null&limit=1`,
    { headers: serviceHeaders },
  );
  if (!restRes.ok) {
    return NextResponse.json({ ok: false, error: 'restaurant_not_found' }, { status: 404 });
  }
  const rs = await restRes.json() as RestaurantRow[];
  if (!rs || rs.length === 0) {
    return NextResponse.json({ ok: false, error: 'restaurant_not_found' }, { status: 404 });
  }
  const restaurant = rs[0];
  const fulfillmentType = body.fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
  if (!restaurant.is_active) {
    issues.push({ kind: 'restaurant_inactive', message: 'Restaurant is not active' });
  }
  if (restaurant.is_paused) {
    issues.push({ kind: 'restaurant_paused', message: 'Restaurant is paused' });
  }
  if (restaurant.is_hidden) {
    issues.push({ kind: 'restaurant_hidden', message: 'Restaurant is hidden' });
  }
  if (fulfillmentType === 'pickup' && restaurant.pickup_enabled === false) {
    issues.push({ kind: 'pickup_disabled', message: 'Customer pickup is not available at this restaurant' });
  }

  // 2) Load all products in one query (PostgREST `or=` for multiple IDs)
  const productIds = Array.from(new Set(body.items.map((i) => i.product_id).filter(Boolean)));
  if (productIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'no_products' }, { status: 400 });
  }
  const orFilter = `or=(${productIds.map((id) => `id.eq.${id}`).join(',')})`;
  const prodRes = await fetch(
    `${baseUrl}/rest/v1/products?select=*&${orFilter}`,
    { headers: serviceHeaders },
  );
  if (!prodRes.ok) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  const products = await prodRes.json() as ProductRow[];
  const productMap = new Map(products.map((p) => [p.id, p]));

  // 3) Process each line
  const lines: QuoteLine[] = [];
  let subtotal = 0;

  for (const item of body.items) {
    const product = productMap.get(item.product_id);
    if (!product) {
      issues.push({ kind: 'product_deleted', message: `Product ${item.product_id} no longer available`, line: item.config_key });
      continue;
    }
    if (product.restaurant_id !== body.restaurant_id) {
      issues.push({ kind: 'product_wrong_restaurant', message: 'Product is from a different restaurant', line: item.config_key });
      continue;
    }
    if (product.is_active === false || product.approval_status !== 'approved' || product.archived_at) {
      issues.push({ kind: 'product_unavailable', message: `"${product.name}" is no longer available`, line: item.config_key });
      continue;
    }
    if (product.is_hidden) {
      issues.push({ kind: 'product_hidden', message: `"${product.name}" is hidden`, line: item.config_key });
      continue;
    }
    if (!product.is_available) {
      issues.push({ kind: 'product_unavailable', message: `"${product.name}" is no longer available`, line: item.config_key });
      continue;
    }
    if ((['market', 'pharmacy'].includes(String(restaurant.type)) || product.product_kind === 'alcohol') && product.legal_information_complete !== true) {
      issues.push({ kind: 'legal_information_incomplete', message: `Mandatory product information for "${product.name}" is incomplete`, line: item.config_key });
    }

    // Clamp quantity
    const qty = safeInt(item.quantity, MIN_QUANTITY, MAX_QUANTITY, 1);

    // Server-side price (use discount_price if lower)
    const basePrice = product.discount_price != null && Number(product.discount_price) < Number(product.price)
      ? Number(product.discount_price)
      : Number(product.price);

    // Validate modifiers (server-side authoritative)
    const productModifiers = product.modifiers ?? [];
    const providedModifiers = item.configuration?.selected_modifiers || {};
    const providedQuantities = item.configuration?.modifier_quantities || {};
    const validOptionsByModifier = new Map<string, Set<string>>();
    for (const m of productModifiers) {
      validOptionsByModifier.set(m.id, new Set(m.options.map((option) => option.id)));
    }

    let modifierTotal = 0;
    const canonicalSelectedModifiers: Record<string, string[]> = {};
    const lineIssues: string[] = [];

    for (const modId of Object.keys(providedModifiers)) {
      if (!validOptionsByModifier.has(modId)) {
        lineIssues.push(`Modifier "${modId}" does not exist`);
        continue;
      }
      const valid = validOptionsByModifier.get(modId)!;
      const selected = providedModifiers[modId] || [];
      for (const optId of selected) {
        if (!valid.has(optId)) {
          lineIssues.push(`Option "${optId}" does not exist on "${modId}"`);
        }
      }
    }
    for (const m of productModifiers) {
      const selected = (providedModifiers[m.id] || []).filter((id: string) => validOptionsByModifier.get(m.id)?.has(id));
      const deduped = Array.from(new Set(selected));
      if (m.required && deduped.length < m.min_select) {
        lineIssues.push(`Required modifier "${m.name}" missing`);
      }
      if (deduped.length > m.max_select) {
        lineIssues.push(`Too many selections for "${m.name}"`);
      }
      for (const optId of deduped) {
        const opt = m.options.find((option) => option.id === optId);
        if (opt) modifierTotal += Number(opt.price_delta || 0);
      }
      canonicalSelectedModifiers[m.id] = deduped.sort();
    }
    // Validate modifier_quantities
    const canonicalQuantities: Record<string, number> = {};
    for (const k of Object.keys(providedQuantities)) {
      const m = k.split(':');
      if (m.length !== 2) {
        lineIssues.push(`Malformed modifier_quantity key "${k}"`);
        continue;
      }
      const [modId, optId] = m;
      if (!validOptionsByModifier.get(modId)?.has(optId)) {
        lineIssues.push(`Quantity references unknown ${modId}:${optId}`);
        continue;
      }
      const q = safeInt(providedQuantities[k], 0, MAX_QUANTITY, 0);
      if (q > 0) canonicalQuantities[k] = q;
    }

    // Notes / cooking / spice
    const sanitizedNotes = (item.configuration?.notes ?? '').toString().slice(0, 500);
    const cookingPref = (item.configuration?.cooking_preference ?? '').toString().slice(0, 100);
    const spiceLevel = (item.configuration?.spice_level ?? '').toString().slice(0, 100);
    const variants = item.configuration?.variants || {};
    const addOns = Array.isArray(item.configuration?.add_ons) ? item.configuration!.add_ons.slice(0, 20) : [];
    const substitutionPreference = ['best_match', 'contact_me', 'refund_item'].includes(String(item.configuration?.substitution_preference))
      ? item.configuration?.substitution_preference as 'best_match' | 'contact_me' | 'refund_item'
      : undefined;

    const finalConfiguration: CartLineConfiguration = {
      selected_modifiers: canonicalSelectedModifiers,
      modifier_quantities: canonicalQuantities,
      notes: sanitizedNotes || undefined,
      cooking_preference: cookingPref || undefined,
      spice_level: spiceLevel || undefined,
      variants: Object.keys(variants).length > 0 ? variants : undefined,
      add_ons: addOns.length > 0 ? addOns : undefined,
      substitution_preference: substitutionPreference,
    };

    const unitPrice = basePrice + modifierTotal;
    const lineSubtotal = unitPrice * qty;

    // Server-issued canonical key
    const configKey = serverDeriveKey(body.restaurant_id, product.id, canonicalSelectedModifiers, {
      modifier_quantities: Object.keys(canonicalQuantities).length > 0 ? canonicalQuantities : undefined,
      notes: sanitizedNotes || undefined,
      cooking_preference: cookingPref || undefined,
      spice_level: spiceLevel || undefined,
      variants: Object.keys(variants).length > 0 ? variants : undefined,
      substitution_preference: substitutionPreference,
    });

    if (lineIssues.length > 0) {
      issues.push(...lineIssues.map((msg) => ({ kind: 'modifier_invalid', message: msg, line: item.config_key })));
    }

    lines.push({
      config_key: configKey,
      product_id: product.id,
      product_name: product.name,
      unit_price: Number(unitPrice.toFixed(2)),
      line_subtotal: Number(lineSubtotal.toFixed(2)),
      quantity: qty,
      configuration: finalConfiguration,
      issues: lineIssues,
    });
    subtotal += lineSubtotal;
  }
  subtotal = Number(subtotal.toFixed(2));

  // 4) Versioned delivery-zone rule. Coverage and delivery pricing must use
  // the same persisted rule; a dashboard-only zone is not operational truth.
  let deliveryZoneOk = true;
  let deliveryDistanceKm: number | null = null;
  let deliveryZoneRuleId: string | null = null;
  let deliveryZoneRuleVersion: number | null = null;
  let zoneDeliveryFee: number | null = null;
  let deliveryFeeBase: number | null = null;
  let deliveryFeeMultiplier = 1;
  let deliveryFeeSurge = 0;
  let deliveryFeeSurgeActive = false;
  let zoneMinimum = 0;
  if (fulfillmentType === 'delivery' && body.delivery_address?.lat != null && body.delivery_address?.lng != null) {
    const lat = Number(body.delivery_address.lat);
    const lng = Number(body.delivery_address.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      try {
        const match = await resolveConfiguredDeliveryZone(createServiceClient(), lat, lng);
        deliveryZoneOk = match.ok;
        deliveryDistanceKm = match.distanceKm === null ? null : Number(match.distanceKm.toFixed(2));
        if (match.ok) {
          deliveryZoneRuleId = match.ruleId;
          deliveryZoneRuleVersion = match.ruleVersion;
          zoneDeliveryFee = match.pricing.deliveryFee;
          deliveryFeeBase = match.pricing.baseFee;
          deliveryFeeMultiplier = match.pricing.multiplier;
          deliveryFeeSurge = match.pricing.surgeAmount;
          deliveryFeeSurgeActive = match.pricing.surgeActive;
          zoneMinimum = Number(match.zone.min_order_amount ?? 0);
        } else {
          issues.push({ kind: 'delivery_zone', message: 'Delivery address is outside every active delivery zone' });
        }
      } catch {
        deliveryZoneOk = false;
        issues.push({ kind: 'zone_configuration', message: 'Delivery-zone pricing is temporarily unavailable' });
      }
    }
  }
  const deliveryFee = fulfillmentType === 'pickup' ? 0 : zoneDeliveryFee ?? (restaurant.delivery_fee != null ? Number(restaurant.delivery_fee) : STANDARD_DELIVERY_FEE);
  if (fulfillmentType === 'pickup') deliveryFeeBase = 0;
  else if (deliveryFeeBase === null) deliveryFeeBase = deliveryFee;
  const restaurantMinimum = Number(restaurant.min_order_amount ?? restaurant.minimum_order ?? restaurant.min_order ?? 0);
  const minOrderAmount = fulfillmentType === 'pickup' ? restaurantMinimum : Math.max(restaurantMinimum, zoneMinimum);

  // 5) Service fee (5% of subtotal — server-computed)
  const serviceFee = Number((subtotal * SERVICE_FEE_RATE).toFixed(2));

  // 6) Tip (clamp to [0, 500])
  const tip = safeNumber(body.tip, MIN_TIP, MAX_TIP, 0);

  // 7) Coupon validation
  let discount = 0;
  let coupon: {
    code: string;
    type: string;
    value: number;
    min_order_amount: number | null;
    max_discount: number | null;
    discount: number;
  } | null = null;
  if (body.coupon_code) {
    const code = body.coupon_code.toString().toUpperCase().slice(0, 32);
    const couponRes = await fetch(
      `${baseUrl}/rest/v1/coupons?select=*&code=eq.${code}&is_active=eq.true&limit=1`,
      { headers: serviceHeaders },
    );
    if (couponRes.ok) {
      const coupons = await couponRes.json() as CouponRow[];
      const c = coupons[0];
      if (!c) {
        issues.push({ kind: 'coupon_invalid', message: 'Invalid coupon code' });
      } else {
        const now = new Date();
        if (c.start_date && new Date(c.start_date) > now) {
          issues.push({ kind: 'coupon_not_active', message: 'Coupon not yet active' });
        } else if (c.end_date && new Date(c.end_date) < now) {
          issues.push({ kind: 'coupon_expired', message: 'Coupon expired' });
        } else if (c.usage_limit && (c.usage_count ?? 0) >= c.usage_limit) {
          issues.push({ kind: 'coupon_usage_limit', message: 'Coupon usage limit reached' });
        } else if (c.min_order_amount && subtotal < Number(c.min_order_amount)) {
          issues.push({ kind: 'coupon_min_order', message: `Minimum order €${Number(c.min_order_amount).toFixed(2)} for this coupon` });
        } else {
          // Apply coupon
          if (c.type === 'percentage') {
            discount = subtotal * (Number(c.value) / 100);
            if (c.max_discount) discount = Math.min(discount, Number(c.max_discount));
          } else if (c.type === 'fixed') {
            discount = Number(c.value);
          } else {
            discount = Number(c.value);
          }
          discount = Number(Math.min(discount, subtotal).toFixed(2));
          coupon = {
            code: c.code,
            type: c.type,
            value: Number(c.value),
            min_order_amount: c.min_order_amount ? Number(c.min_order_amount) : null,
            max_discount: c.max_discount ? Number(c.max_discount) : null,
            discount,
          };
        }
      }
    } else {
      issues.push({ kind: 'coupon_db_error', message: 'Could not verify coupon' });
    }
  }

  // 8) Loyalty points (server-clamped to user balance × 50 cents per point)
  let pointsDiscount = 0;
  if (body.points_redeemed && body.points_redeemed > 0) {
    const requested = safeInt(body.points_redeemed, 0, 100_000, 0);
    if (requested > 0) {
      let balance = 0;
      const authClient = await createServerClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) {
        issues.push({ kind: 'loyalty_auth_required', message: 'Sign in to redeem loyalty points' });
      } else {
        const lpRes = await fetch(
          `${baseUrl}/rest/v1/loyalty_points?select=points&user_id=eq.${user.id}&limit=1`,
          { headers: serviceHeaders },
        );
        if (lpRes.ok) {
          const lps = await lpRes.json() as LoyaltyPointsRow[];
          balance = Number(lps[0]?.points ?? 0);
        }
      }
      const maxBySubtotal = Math.floor(subtotal * 50); // 1 point = 0.01 EUR, max 50% of subtotal
      const redeemable = Math.min(requested, balance, maxBySubtotal);
      pointsDiscount = Number((redeemable * 0.01).toFixed(2));
    }
  }

  // 9) Grand total (always >= 0)
  const total = Math.max(0, Number((subtotal + deliveryFee + serviceFee + tip - discount - pointsDiscount).toFixed(2)));

  // 10) Min order check
  const minOrderOk = subtotal >= minOrderAmount;
  if (!minOrderOk) {
    issues.push({ kind: 'min_order', message: `Minimum order is €${minOrderAmount.toFixed(2)}` });
  }

  // 11) Can place order?
  const blockingKinds = new Set([
    'product_deleted',
    'product_wrong_restaurant',
    'product_hidden',
    'product_unavailable',
    'modifier_invalid',
    'restaurant_inactive',
    'restaurant_paused',
    'restaurant_hidden',
    'min_order',
    'delivery_zone',
    'zone_configuration',
    'pickup_disabled',
    'loyalty_auth_required',
  ]);
  const canPlaceOrder = !issues.some((i) => blockingKinds.has(i.kind));

  return NextResponse.json({
    ok: canPlaceOrder,
    issues,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      type: restaurant.type ?? 'restaurant',
      is_paused: !!restaurant.is_paused,
      is_hidden: !!restaurant.is_hidden,
      is_active: !!restaurant.is_active,
      min_order_amount: minOrderAmount,
      delivery_fee: deliveryFee,
      pickup_enabled: restaurant.pickup_enabled !== false,
      pickup_instructions: restaurant.pickup_instructions ?? null,
      address: restaurant.address ?? null,
    },
    fulfillment_type: fulfillmentType,
    lines,
    subtotal,
    delivery_fee: deliveryFee,
    delivery_fee_base: deliveryFeeBase,
    delivery_fee_surge: deliveryFeeSurge,
    delivery_fee_multiplier: deliveryFeeMultiplier,
    delivery_fee_surge_active: deliveryFeeSurgeActive,
    service_fee: serviceFee,
    tip,
    discount,
    points_discount: pointsDiscount,
    total,
    coupon,
    min_order_amount: minOrderAmount,
    min_order_ok: minOrderOk,
    delivery_zone_ok: deliveryZoneOk,
    delivery_distance_km: deliveryDistanceKm,
    delivery_zone_rule_id: deliveryZoneRuleId,
    delivery_zone_rule_version: deliveryZoneRuleVersion,
    server_key_issued_at: new Date().toISOString(),
    can_place_order: canPlaceOrder,
  });
}
