/**
 * Public Delivery Zones API
 * ─────────────────────────
 * GET /api/zones - Get all active delivery zones (for customer check)
 *
 * Migrated to apiRoute() — the canonical API entry point.
 */
import { createServerClient } from '@/lib/supabase/server';
import { apiRoute, ok, log, tier } from '@/lib/api/canonical';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeliveryZoneRow = {
  id: string;
  name: string;
  description?: string | null;
  polygon?: unknown;
  center_lat?: number | string | null;
  center_lng?: number | string | null;
  radius_km?: number | string | null;
  delivery_fee?: number | string | null;
  min_order_amount?: number | string | null;
  priority?: number | null;
};

export const GET = apiRoute({
  method: 'GET',
  auth: 'public',
  rateLimit: tier('open'),
  // PERF: delivery zones are static. CDN caches 1 day, revalidates
  // up to a week while serving stale. Eliminates this fetch from
  // the per-request Supabase load almost entirely.
  cacheControl: 'public, s-maxage=86400, stale-while-revalidate=604800',
  handler: async () => {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('id,name,description,polygon,center_lat,center_lng,radius_km,delivery_fee,min_order_amount,priority')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      log.warn('zones fetch failed', { error: error.message });
      return ok({ zones: [] });
    }

    // Normalize polygon from JSONB
    const zones = ((data ?? []) as DeliveryZoneRow[]).map((z) => ({
      id: z.id,
      name: z.name,
      description: z.description,
      polygon: z.polygon,
      center: z.center_lat != null ? { lat: Number(z.center_lat), lng: Number(z.center_lng) } : undefined,
      radius_km: z.radius_km ? Number(z.radius_km) : undefined,
      delivery_fee: z.delivery_fee ? Number(z.delivery_fee) : undefined,
      min_order_amount: z.min_order_amount ? Number(z.min_order_amount) : undefined,
      priority: z.priority ?? 0,
    }));

    return ok({ zones });
  },
});
