/**
 * Get current authenticated user info
 * ───────────────────────────────────
 * Canonical API Layer: uses apiRoute() from @/lib/api/canonical.
 *
 * Demonstrates the new canonical entry point:
 *   - Single config object: { method, auth, rateLimit, handler }
 *   - Type-safe context: { req, user, body, query, params }
 *   - Built-in: CSRF, rate limit, body validation, method validation,
 *     request ID, response timing, structured logging
 */
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiRoute, ok, tier } from '@/lib/api/canonical';
import { getUserWithTransientRetry } from '@/lib/auth/get-user-with-retry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = apiRoute({
  method: 'GET',
  auth: 'optional',
  rateLimit: tier('lenient'),
  cacheControl: 'private, max-age=10',
  handler: async () => {
    const supabase = await createServerClient();
    const { data: { user } } = await getUserWithTransientRetry(supabase);

    if (!user) {
      return ok({ user: null, profile: null });
    }

    // Use the service client for the profile lookup so the response
    // isn't gated on RLS. The query is still scoped by `user.id` from
    // the verified JWT, so this isn't a privilege escalation.
    const service = createServiceClient();
    const { data: profile } = await service
      .from('users')
      .select('id, email, name, phone, role, is_active, is_verified')
      .eq('id', user.id)
      .single();

    // Only return a curated subset of the user object — never the raw
    // user_metadata (which a client can stuff with anything).
    return ok({
      user: {
        id: user.id,
        email: user.email,
        permissions: Array.isArray(user.app_metadata?.permissions) ? user.app_metadata.permissions : [],
      },
      profile: profile || { role: 'customer' },
    });
  },
});
