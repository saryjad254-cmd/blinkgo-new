/**
 * POST /api/cart/validate
 *
 * Server-side price & configuration validation. This is the **trust
 * boundary** — the client must never be trusted to:
 *  - invent modifier options that don't exist
 *  - spoof prices
 *  - pick cross-restaurant products
 *  - omit a required modifier
 *
 * The endpoint also issues the **authoritative canonical CartKey** derived
 * from the validated configuration. The client must use this key on the
 * cart line so all subsequent operations key on the server-issued identity.
 *
 * Body:
 *   {
 *     restaurant_id: string,
 *     items: Array<{
 *       product_id: string,
 *       quantity: number,
 *       selected_modifiers?: Record<string, string[]>, // modifier_id → option_ids
 *       modifier_quantities?: Record<string, number>,  // "<mod>:<opt>" → qty
 *       notes?: string,
 *       cooking_preference?: string,
 *       spice_level?: string,
 *       variants?: Record<string, string>,
 *       add_ons?: string[],
 *       special_instructions?: string,
 *     }>
 *   }
 *
 * Response:
 *   {
 *     ok: boolean,
 *     issues: Array<{ product_id, kind, message }>,
 *     total: number,
 *     lines: Array<{
 *       product_id: string,
 *       configuration: {…},
 *       unit_price: number,    // server-computed, with modifier deltas
 *       line_subtotal: number, // unit_price * quantity
 *       config_key: string,    // server-issued canonical key
 *     }>
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverDeriveKey, type CartLineConfiguration } from '@/lib/cart-key';
import { getSupabaseServerRuntimeConfig, supabaseServiceHeaders } from '@/lib/supabase/runtime-config';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ValidateItem {
  product_id: string;
  quantity: number;
  selected_modifiers?: Record<string, string[]>;
  modifier_quantities?: Record<string, number>;
  notes?: string;
  cooking_preference?: string;
  spice_level?: string;
  variants?: Record<string, string>;
  add_ons?: string[];
  special_instructions?: string;
  substitution_preference?: 'best_match' | 'contact_me' | 'refund_item';
  client_price?: number; // ignored — DB only
}

interface Issue {
  product_id: string;
  kind: 'unavailable' | 'out_of_stock' | 'price_changed' | 'deleted' | 'modifier_invalid' | 'tampered';
  message: string;
  client_price?: number;
  server_price?: number;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  discount_price: number | null;
  is_active: boolean;
  is_available: boolean;
  restaurant_id: string;
  modifiers: Array<{
    id: string;
    type: 'radio' | 'checkbox';
    required: boolean;
    min_select: number;
    max_select: number;
    options: Array<{ id: string; price_delta: number }>;
  }> | null;
}

interface RestaurantRow {
  id: string;
  is_active: boolean;
  is_paused?: boolean;
  is_hidden?: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const limited = rateLimit({ limit: 30, windowSec: 60, name: 'cart-validate' }, req);
  if (limited) return limited;

  let body: { restaurant_id: string; items: ValidateItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  if (!UUID_PATTERN.test(body.restaurant_id) || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
  if (body.items.some((item) => !UUID_PATTERN.test(item.product_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)) {
    return NextResponse.json({ ok: false, error: 'invalid_item' }, { status: 400 });
  }

  const config = getSupabaseServerRuntimeConfig();
  if (!config) return NextResponse.json({ ok: false, error: 'service_unavailable' }, { status: 503 });
  const { baseUrl } = config;

  // 1) Load restaurant
  const restRes = await fetch(
    `${baseUrl}/rest/v1/restaurants?select=id,is_active,is_paused,is_hidden&id=eq.${encodeURIComponent(body.restaurant_id)}&is_active=eq.true&is_hidden=eq.false&archived_at=is.null&limit=1`,
    { headers: supabaseServiceHeaders(config) },
  );
  if (!restRes.ok) {
    return NextResponse.json({ ok: false, error: 'restaurant_not_found' }, { status: 404 });
  }
  const parsedRestaurants: unknown = await restRes.json();
  const rs = Array.isArray(parsedRestaurants) ? parsedRestaurants as RestaurantRow[] : [];
  if (!rs || rs.length === 0) {
    return NextResponse.json({ ok: false, error: 'restaurant_not_found' }, { status: 404 });
  }
  const restaurant = rs[0];
  if (restaurant.is_paused || restaurant.is_hidden) {
    return NextResponse.json({ ok: false, error: 'restaurant_unavailable' }, { status: 409 });
  }

  // 2) Load all products in one query
  // SECURITY: PostgREST `id=eq.X&id=eq.Y` is AND, not OR. Use the explicit
  // `or=(...)` group filter to fetch multiple IDs. The parens and commas
  // must be URL-encoded so the supabase-js client AND the mock both parse
  // the filter correctly.
  const ids = [...new Set(body.items.map((i) => i.product_id))];
  const orInner = ids.map((id) => `id.eq.${id}`).join(',');
  const orFilter = `or=(${orInner})`;
  const productsUrl = `${baseUrl}/rest/v1/products?select=id,name,price,discount_price,is_active,is_available,restaurant_id,modifiers&${orFilter}&approval_status=eq.approved&archived_at=is.null&is_active=eq.true&is_available=eq.true`;
  const prodRes = await fetch(
    productsUrl,
    { headers: supabaseServiceHeaders(config) },
  );
  if (!prodRes.ok) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  const parsedProducts: unknown = await prodRes.json();
  const products: ProductRow[] = Array.isArray(parsedProducts) ? parsedProducts as ProductRow[] : [];

  const issues: Issue[] = [];
  const lines: Array<{
    product_id: string;
    configuration: CartLineConfiguration;
    unit_price: number;
    line_subtotal: number;
    config_key: string;
  }> = [];
  let total = 0;

  for (const item of body.items) {
    const product = (products || []).find((p) => p.id === item.product_id);
    if (!product) {
      issues.push({ product_id: item.product_id, kind: 'deleted', message: 'Product no longer available' });
      continue;
    }
    if (product.restaurant_id !== body.restaurant_id) {
      issues.push({ product_id: item.product_id, kind: 'unavailable', message: 'Product is from a different restaurant' });
      continue;
    }
    if (!product.is_active || !product.is_available) {
      issues.push({ product_id: item.product_id, kind: 'out_of_stock', message: 'Out of stock' });
      continue;
    }

    // 3) Validate modifiers against the product schema (server-only).
    const basePrice = product.discount_price ?? product.price;
    let modifierTotal = 0;
    const productModifiers = product.modifiers || [];
    const providedModifiers = item.selected_modifiers || {};
    const providedQuantities = item.modifier_quantities || {};

    // Build a map: modifier_id → Set<option_id> for fast O(1) validation.
    const validOptionsByModifier = new Map<string, Set<string>>();
    for (const m of productModifiers) {
      validOptionsByModifier.set(m.id, new Set(m.options.map((o) => o.id)));
    }

    // Reject any modifier that doesn't exist on the product.
    for (const modId of Object.keys(providedModifiers)) {
      if (!validOptionsByModifier.has(modId)) {
        issues.push({
          product_id: item.product_id,
          kind: 'tampered',
          message: `Modifier "${modId}" does not exist on this product`,
        });
        continue;
      }
      const valid = validOptionsByModifier.get(modId)!;
      const selected = providedModifiers[modId] || [];
      // Reject any option that doesn't exist on the product.
      for (const optId of selected) {
        if (!valid.has(optId)) {
          issues.push({
            product_id: item.product_id,
            kind: 'tampered',
            message: `Option "${optId}" does not exist on modifier "${modId}"`,
          });
          continue;
        }
      }
    }

    // Enforce min/max for the canonicalized selection.
    const canonicalSelectedModifiers: Record<string, string[]> = {};
    for (const m of productModifiers) {
      const selected = (providedModifiers[m.id] || []).filter((id) => validOptionsByModifier.get(m.id)?.has(id));
      // De-duplicate (option lists are sets in the canonical form).
      const deduped = Array.from(new Set(selected));
      if (m.required && deduped.length < m.min_select) {
        issues.push({
          product_id: item.product_id,
          kind: 'modifier_invalid',
          message: `Required modifier "${m.id}" missing`,
        });
      }
      if (deduped.length > m.max_select) {
        issues.push({
          product_id: item.product_id,
          kind: 'modifier_invalid',
          message: `Too many selections for "${m.id}" (max ${m.max_select})`,
        });
      }
      // Sum the modifier price deltas (server-side authoritative price).
      for (const optId of deduped) {
        const opt = m.options.find((o) => o.id === optId);
        if (opt) modifierTotal += opt.price_delta;
      }
      canonicalSelectedModifiers[m.id] = deduped.sort();
    }

    // Validate modifier_quantities keys reference real mod:opt pairs.
    const canonicalQuantities: Record<string, number> = {};
    for (const k of Object.keys(providedQuantities)) {
      const m = k.split(':');
      if (m.length !== 2) {
        issues.push({
          product_id: item.product_id,
          kind: 'tampered',
          message: `Malformed modifier_quantity key "${k}"`,
        });
        continue;
      }
      const [modId, optId] = m;
      if (!validOptionsByModifier.get(modId)?.has(optId)) {
        issues.push({
          product_id: item.product_id,
          kind: 'tampered',
          message: `Quantity references unknown ${modId}:${optId}`,
        });
        continue;
      }
      const qty = Number(providedQuantities[k]);
      if (!Number.isInteger(qty) || qty < 0 || qty > 99) {
        issues.push({
          product_id: item.product_id,
          kind: 'tampered',
          message: `Quantity for ${k} out of range`,
        });
        continue;
      }
      canonicalQuantities[k] = qty;
    }

    // Compose the canonical configuration.
    const configuration: CartLineConfiguration = {
      selected_modifiers: canonicalSelectedModifiers,
      modifier_quantities: Object.keys(canonicalQuantities).length ? canonicalQuantities : undefined,
      notes: (item.notes || '').trim() || undefined,
      cooking_preference: (item.cooking_preference || '').trim() || undefined,
      spice_level: (item.spice_level || '').trim() || undefined,
      variants: item.variants && Object.keys(item.variants).length ? item.variants : undefined,
      add_ons: item.add_ons && item.add_ons.length ? [...item.add_ons].sort() : undefined,
      special_instructions:
        (item.special_instructions || '').trim() && (item.special_instructions || '').trim() !== (item.notes || '').trim()
          ? (item.special_instructions || '').trim()
          : undefined,
      substitution_preference: ['best_match', 'contact_me', 'refund_item'].includes(String(item.substitution_preference))
        ? item.substitution_preference
        : undefined,
    };

    // Issue the authoritative canonical key from the validated configuration.
    const config_key = serverDeriveKey(
      body.restaurant_id,
      item.product_id,
      canonicalSelectedModifiers,
      {
        modifier_quantities: configuration.modifier_quantities,
        notes: configuration.notes,
        cooking_preference: configuration.cooking_preference,
        spice_level: configuration.spice_level,
        variants: configuration.variants,
        add_ons: configuration.add_ons,
        special_instructions: configuration.special_instructions,
        substitution_preference: configuration.substitution_preference,
      },
    );

    const unitPrice = basePrice + modifierTotal;
    const line_subtotal = unitPrice * item.quantity;
    total += line_subtotal;
    lines.push({
      product_id: item.product_id,
      configuration,
      unit_price: Math.round(unitPrice * 100) / 100,
      line_subtotal: Math.round(line_subtotal * 100) / 100,
      config_key,
    });
  }

  return NextResponse.json({
    ok: issues.length === 0,
    issues,
    total: Math.round(total * 100) / 100,
    lines,
    server_key_issued_at: new Date().toISOString(),
  });
}
