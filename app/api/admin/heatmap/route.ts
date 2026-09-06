/**
 * Admin: Driver Heat Map
 * ─────────────────────
 * GET /api/admin/heatmap - Get active driver locations for heat map
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { AuthorizationError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DriverUserRelation = { name?: string | null; rating?: number | null } | Array<{ name?: string | null; rating?: number | null }> | null;
type DriverLocationRow = {
  driver_id: string;
  last_location_lat: number | string;
  last_location_lng: number | string;
  last_location_at: string;
  users?: DriverUserRelation;
};

function driverUser(relation: DriverUserRelation | undefined) {
  return Array.isArray(relation) ? relation[0] : relation;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => heatmap() as any,
  )(req)) as unknown as NextResponse;
}

async function heatmap(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin', 'manager']);
    if (!user) throw new AuthorizationError('Admin access required');

    const supabase = await createServerClient();
    // Get all online drivers with recent location
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('driver_status')
      .select('driver_id, last_location_lat, last_location_lng, last_location_at, is_online, is_active, users:driver_id(name, rating)')
      .eq('is_online', true)
      .gte('last_location_at', cutoff)
      .not('last_location_lat', 'is', null)
      .not('last_location_lng', 'is', null);

    if (error) {
      logger.warn('heatmap fetch failed', { error: error.message });
      return ok({ drivers: [], count: 0 });
    }

    const drivers = ((data ?? []) as DriverLocationRow[]).map((d) => ({
      id: d.driver_id,
      name: driverUser(d.users)?.name ?? 'Unknown',
      rating: driverUser(d.users)?.rating ?? 0,
      lat: Number(d.last_location_lat),
      lng: Number(d.last_location_lng),
      last_update: d.last_location_at,
    }));

    return ok({ drivers, count: drivers.length });
  });
}
