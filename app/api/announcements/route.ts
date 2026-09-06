/**
 * Public Announcements
 * ────────────────────
 * GET /api/announcements?audience=customer
 * Returns active announcements for the user's role.
 *
 * Migrated to apiRoute() — the canonical API entry point.
 */
import { createServerClient } from '@/lib/supabase/server';
import { apiRoute, ok, log, tier } from '@/lib/api/canonical';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLE_TO_AUDIENCE: Record<string, string> = {
  customer: 'customers',
  driver: 'drivers',
  restaurant_owner: 'restaurants',
  admin: 'admins',
  super_admin: 'admins',
  restaurant: 'restaurants',
  manager: 'admins',
};

export const GET = apiRoute({
  method: 'GET',
  auth: 'optional',
  rateLimit: tier('open'),
  cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
  handler: async ({ user, query }) => {
    const audienceParam = typeof query.audience === 'string' ? query.audience : null;

    let audiences = ['all'];
    if (audienceParam) {
      audiences = ['all', audienceParam];
    } else if (user) {
      // Use the authenticated user's role to determine the audience
      const mapped = ROLE_TO_AUDIENCE[user.role];
      if (mapped) audiences = ['all', mapped];
    }

    const supabase = await createServerClient();
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
      log.warn('public announcements fetch failed', { error: error.message });
      return ok({ announcements: [] });
    }
    return ok({ announcements: data ?? [] });
  },
});
