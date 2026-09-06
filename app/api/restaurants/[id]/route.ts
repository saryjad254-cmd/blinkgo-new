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
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
  // Bypass the supabase-js client (which appears to strip unknown fields in
  // Next.js server runtime) and use fetch directly. The mock returns the
  // same shape either way.
  const config = getSupabaseServerRuntimeConfig();
  if (!config) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const { baseUrl } = config;
  // Query only canonical columns that exist in the production schema. Asking
  // PostgREST for even one legacy alias makes the entire request fail, which
  // previously turned a valid restaurant into a misleading 404 response.
  const url = `${baseUrl}/rest/v1/restaurants?select=id,type,name,description,cover_url,image_url,logo_url,rating,total_reviews,review_count,delivery_time,avg_prep_minutes,delivery_fee,min_order_amount,min_order,cuisine,is_active,busy_mode,is_paused,is_hidden,is_open_now,is_online,accepting_orders,latitude,longitude,delivery_zones,opening_hours,address,phone&id=eq.${encodeURIComponent(params.id)}&is_active=eq.true&is_hidden=eq.false&archived_at=is.null&limit=1`;
  const res = await fetch(url, {
    headers: supabaseServiceHeaders(config),
  });
  if (!res.ok) {
    return NextResponse.json({ error: 'restaurant_lookup_failed' }, { status: 502 });
  }
  const payload: unknown = await res.json();
  const rows = Array.isArray(payload) ? payload.map(record).filter((row): row is Record<string, unknown> => row !== null) : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
  }
  const source = rows.find((row) => row.id === params.id) ?? rows[0];
  const zoneConfig = source.delivery_zones && typeof source.delivery_zones === 'object' && !Array.isArray(source.delivery_zones)
    ? source.delivery_zones as Record<string, unknown>
    : {};
  // Stable client DTO: the cloud schema uses canonical names while the
  // original local mock used legacy aliases consumed by the detail page.
  const restaurant = {
    id: source.id,
    type: source.type,
    name: source.name,
    description: source.description,
    cover_image_url: source.cover_image_url ?? source.cover_url ?? source.image_url ?? null,
    total_reviews: source.total_reviews ?? source.review_count ?? 0,
    delivery_time_min: source.delivery_time_min ?? source.delivery_time ?? source.avg_prep_minutes ?? 25,
    minimum_order: source.minimum_order ?? source.min_order_amount ?? source.min_order ?? 0,
    cuisines: source.cuisines ?? source.cuisine ?? [],
    is_busy: source.is_busy ?? source.busy_mode ?? false,
    lat: source.lat ?? source.latitude ?? null,
    lng: source.lng ?? source.longitude ?? null,
    delivery_radius_km: source.delivery_radius_km ?? zoneConfig.radius ?? null,
    opening_hours: source.opening_hours ?? null,
    address: source.address ?? null,
    phone: source.phone ?? null,
    is_active: source.is_active === true,
    is_paused: source.is_paused === true,
    is_hidden: source.is_hidden === true,
    is_open_now: source.is_open_now !== false,
    is_online: source.is_online !== false,
    accepting_orders: source.accepting_orders !== false,
    delivery_fee: source.delivery_fee ?? 0,
    logo_url: source.logo_url ?? null,
  };
  return NextResponse.json({ restaurant });
}
