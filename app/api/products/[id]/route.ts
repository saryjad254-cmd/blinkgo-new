/**
 * GET /api/products/[id]
 *
 * Returns a single product with full detail (modifiers, calories, allergens,
 * discount_price, prep_time_min, image_urls).
 *
 * This is the canonical source for the ProductDetailModal — the restaurant
 * page loads a slim list, but opening a product triggers this endpoint to
 * fetch the full modifier tree.
 *
 * Security:
 *   - Only `is_active = true` products are returned.
 *   - Hidden restaurants' products are filtered out.
 *   - `discount_price` is included only if the product is currently on promotion.
 *
 * Note: bypasses supabase-js to avoid field stripping in Next.js server
 * runtime. Read-only, whitelisted query.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerRuntimeConfig, supabaseServiceHeaders } from '@/lib/supabase/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'id_required' }, { status: 400 });
  }

  const config = getSupabaseServerRuntimeConfig();
  if (!config) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const { baseUrl } = config;

  // 1) Load the product
  const prodRes = await fetch(
    `${baseUrl}/rest/v1/products?select=id,restaurant_id,name,description,price,discount_price,image_urls,category,is_vegetarian,is_vegan,is_gluten_free,is_featured,is_available,prep_time_min,calories,allergens,ingredients,product_kind,legal_name,net_quantity,net_quantity_unit,base_price,base_price_unit,ingredients_text,additives,nutrition,country_of_origin,producer_name,producer_address,storage_instructions,usage_instructions,alcohol_percentage,minimum_age,legal_information_complete,sold_count,rating,modifiers&id=eq.${encodeURIComponent(id)}&approval_status=eq.approved&archived_at=is.null&is_active=eq.true&is_available=eq.true&limit=1`,
    { headers: supabaseServiceHeaders(config) },
  );
  if (!prodRes.ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const productPayload: unknown = await prodRes.json();
  const product = Array.isArray(productPayload) ? record(productPayload[0]) : null;
  if (!product || typeof product.restaurant_id !== 'string') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // 2) Ensure restaurant is active
  const restRes = await fetch(
    `${baseUrl}/rest/v1/restaurants?select=id,is_active&id=eq.${encodeURIComponent(product.restaurant_id)}&is_active=eq.true&is_hidden=eq.false&archived_at=is.null&limit=1`,
    { headers: supabaseServiceHeaders(config) },
  );
  if (!restRes.ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const restaurantPayload: unknown = await restRes.json();
  const restaurant = Array.isArray(restaurantPayload) ? record(restaurantPayload[0]) : null;
  if (!restaurant) {
    return NextResponse.json({ error: 'unavailable' }, { status: 404 });
  }
  if (restaurant.is_active !== true) {
    return NextResponse.json({ error: 'restaurant_unavailable' }, { status: 409 });
  }

  return NextResponse.json({ product });
}
