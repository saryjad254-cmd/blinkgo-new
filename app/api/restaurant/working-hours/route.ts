/**
 * Restaurant working hours API.
 * GET  /api/restaurant/working-hours  — Get current working hours
 * POST /api/restaurant/working-hours  — Save working hours
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const svc = createServiceClient();
    const { data: restaurant } = await svc.from('restaurants').select('id, opening_hours').eq('owner_id', user.id).maybeSingle();
    if (!restaurant) throw new NotFoundError('Restaurant');

    return ok({ hours: restaurant.opening_hours ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const { hours } = await req.json();
    if (!Array.isArray(hours)) {
      return ok({ updated: false });
    }
    const svc = createServiceClient();
    const { error } = await svc
      .from('restaurants')
      .update({ opening_hours: hours })
      .eq('owner_id', user.id);
    if (error) {
      logger.error('Working hours save failed', { userId: user.id }, error);
      return ok({ updated: false });
    }
    return ok({ updated: true });
  });
}
