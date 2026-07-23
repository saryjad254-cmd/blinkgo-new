/**
 * Admin: Driver Heat Map
 * ─────────────────────
 * GET /api/admin/heatmap - Get active driver locations for heat map
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const { data: profile } = await supabaseAuth
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      throw new AuthorizationError('Admin access required');
    }

    const supabase = createServerClient();
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

    const drivers = (data ?? []).map((d: any) => ({
      id: d.driver_id,
      name: d.users?.name ?? 'Unknown',
      rating: d.users?.rating ?? 0,
      lat: Number(d.last_location_lat),
      lng: Number(d.last_location_lng),
      last_update: d.last_location_at,
    }));

    return ok({ drivers, count: drivers.length });
  });
}
