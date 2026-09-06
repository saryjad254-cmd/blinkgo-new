/**
 * Schema Compatibility Layer
 * ──────────────────────────
 * Maps app-side field names to the real production database schema.
 * 
 * The real Supabase was set up independently with its own schema
 * (matching seed-operator-accounts.sql). Some columns the app expects
 * don't exist in real DB:
 * 
 *   App expects        → Real DB has
 *   ────────────────────────────────────
 *   cuisine_type       → cuisine (text[])
 *   is_paused          → (not in DB, always false)
 *   is_hidden          → (not in DB, always false)
 *   min_order          → min_order_amount
 *   total_reviews      → review_count
 *   lat / lng          → latitude / longitude
 *   slug, city, postal_code, deleted_at → (not in DB)
 * 
 * SELECT_HELPERS below provide canonical column lists that match the
 * real schema. Use these in app/api/* routes that previously failed
 * with "column does not exist" errors.
 */

import type { PostgrestQueryBuilder } from '@supabase/postgrest-js';

/** Real-DB canonical column list for the restaurants table. */
export const RESTAURANT_COLUMNS = [
  'id',
  'owner_id',
  'name',
  'description',
  'logo_url',
  'cover_url',
  'address',
  'latitude',
  'longitude',
  'phone',
  'email',
  'cuisine',
  'is_verified',
  'is_active',
  'min_order_amount',
  'delivery_fee',
  'estimated_delivery_time',
  'opening_hours',
  'delivery_zones',
  'rating',
  'review_count',
  'is_online',
  'created_at',
  'updated_at',
].join(',');

/** Real-DB canonical column list for the products table. */
export const PRODUCT_COLUMNS = [
  'id',
  'restaurant_id',
  'category_id',
  'name',
  'description',
  'price',
  'discount_price',
  'image_urls',
  'is_available',
  'is_featured',
  'preparation_time',
  'calories',
  'allergens',
  'nutritional_info',
  'sold_count',
  'created_at',
  'updated_at',
].join(',');

/**
 * Map a real-DB restaurant row to the app's expected RestaurantRow shape.
 * - cuisine_type derived from cuisine[0]
 * - lat / lng derived from latitude / longitude
 * - min_order derived from min_order_amount
 * - total_reviews derived from review_count
 * - is_paused / is_hidden default to false (fields don't exist)
 * - is_visible mirrors is_active
 * - slug / city / postal_code / deleted_at set to null
 */
export function mapRestaurantRow(r: any): any {
  if (!r) return null;
  return {
    ...r,
    cuisine_type: Array.isArray(r.cuisine) && r.cuisine.length > 0 ? r.cuisine[0] : null,
    cuisine: r.cuisine,
    lat: r.latitude,
    lng: r.longitude,
    min_order: r.min_order_amount,
    total_reviews: r.review_count,
    is_visible: r.is_active,
    is_paused: false,
    is_hidden: false,
    slug: r.name ? r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null,
    city: parseCity(r.address),
    postal_code: parsePostal(r.address),
    deleted_at: null,
  };
}

/**
 * Map a real-DB product row to the app's expected product shape.
 */
export function mapProductRow(p: any): any {
  if (!p) return null;
  return {
    ...p,
    is_hidden: false,
  };
}

function parseCity(address: string | null): string | null {
  if (!address) return null;
  // "Königstraße 24, 53113 Bonn, Deutschland" → "Bonn"
  const m = address.match(/,\s*\d{4,5}\s+([^,]+),/);
  return m ? m[1].trim() : null;
}

function parsePostal(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(/,\s*(\d{4,5})\s+/);
  return m ? m[1] : null;
}
