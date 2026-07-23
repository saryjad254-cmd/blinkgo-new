/**
 * Public Delivery Zones API
 * ─────────────────────────
 * GET /api/zones - Get all active delivery zones (for customer check)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      logger.warn('zones fetch failed', { error: error.message });
      return ok({ zones: [] });
    }

    // Normalize polygon from JSONB
    const zones = (data ?? []).map((z: any) => ({
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
  });
}
