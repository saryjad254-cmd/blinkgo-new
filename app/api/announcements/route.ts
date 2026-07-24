/**
 * Public Announcements
 * ────────────────────
 * GET /api/announcements?audience=customer
 * Returns active announcements for the user's role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLE_TO_AUDIENCE = {
  customer: 'customers',
  driver: 'drivers',
  restaurant: 'restaurants',
  admin: 'admins',
  super_admin: 'admins',
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const audienceParam = url.searchParams.get('audience');

    let audiences = ['all'];
    if (audienceParam) {
      audiences = ['all', audienceParam];
    } else {
      // Try to get user role
      const supabase = createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role) {
          const mapped = (ROLE_TO_AUDIENCE as any)[profile.role];
          if (mapped) audiences = ['all', mapped];
        }
      }
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('system_announcements')
      .select('*')
      .eq('is_active', true)
      .in('audience', audiences)
      .lte('starts_at', new Date().toISOString())
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      logger.warn('public announcements fetch failed', {}, error);
      return ok({ announcements: [] });
    }
    return ok({ announcements: data ?? [] });
  });
}
