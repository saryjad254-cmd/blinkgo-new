/**
 * Restaurant working hours API.
 * GET  /api/restaurant/working-hours  — Get current working hours
 * POST /api/restaurant/working-hours  — Save working hours
 *
 * v81: wrapped in withSecurity for consistent auth/role enforcement;
 * the inner handler enforces owner-or-admin (POST) and self-or-admin
 * (GET) so a restaurant owner cannot edit another restaurant's hours.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { withSecurity, HandlerContext } from '@/lib/api/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wrapped = withSecurity(
    { roles: ['restaurant', 'admin', 'super_admin', 'manager'] },
    async (ctx: HandlerContext) => withErrorHandling(async () => {
      const svc = createServiceClient();
      const { data: restaurant } = await svc
        .from('restaurants')
        .select('id, opening_hours')
        .eq('owner_id', ctx.auth.user.id)
        .maybeSingle();
      if (!restaurant) throw new NotFoundError('Restaurant');
      return ok({ hours: restaurant.opening_hours ?? [] });
    }),
  );
  return (await wrapped(req)) as unknown as NextResponse;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const wrapped = withSecurity(
    { roles: ['restaurant', 'admin', 'super_admin', 'manager'] },
    async (ctx: HandlerContext) => withErrorHandling(async () => {
      const { hours } = await ctx.req.json().catch(() => ({}));
      if (!Array.isArray(hours)) {
        throw new ValidationError('hours must be an array');
      }
      const svc = createServiceClient();
      // v81 SECURITY: filter on owner_id so a restaurant owner cannot
      // edit another restaurant's working hours.
      const { error } = await svc
        .from('restaurants')
        .update({ opening_hours: hours })
        .eq('owner_id', ctx.auth.user.id);
      if (error) {
        logger.error('Working hours save failed', { userId: ctx.auth.user.id }, error);
        throw new Error('Failed to save working hours');
      }
      return ok({ updated: true });
    }),
  );
  return (await wrapped(req)) as unknown as NextResponse;
}
