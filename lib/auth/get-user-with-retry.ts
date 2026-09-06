import type { AuthError, User } from '@supabase/supabase-js';

type AuthClientLike = {
  auth: {
    getUser: () => Promise<{ data: { user: User | null }; error: AuthError | null }>;
    getClaims?: () => Promise<{
      data: { claims: Record<string, unknown> } | null;
      error: AuthError | null;
    }>;
  };
};

function isTransientAuthError(error: AuthError | null): boolean {
  if (!error) return false;
  const name = String(error.name || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  return name.includes('retryable')
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('timed out')
    || message.includes('timeout');
}

/** Retry read-only session verification on short provider/network outages. */
export async function getUserWithTransientRetry(client: AuthClientLike) {
  // Prefer locally verified JWT claims. With asymmetric Supabase signing keys this
  // avoids a network round-trip to Auth on every server-rendered page while still
  // cryptographically verifying the session. The public.users lookup performed by
  // the callers remains the source of truth for role and account activation.
  if (client.auth.getClaims) {
    const claimsResult = await client.auth.getClaims();
    const claims = claimsResult.data?.claims;
    if (!claimsResult.error && typeof claims?.sub === 'string' && claims.sub) {
      const issuedAt = typeof claims.iat === 'number' ? claims.iat : Math.floor(Date.now() / 1000);
      const user = {
        id: claims.sub,
        aud: typeof claims.aud === 'string' ? claims.aud : 'authenticated',
        role: typeof claims.role === 'string' ? claims.role : 'authenticated',
        email: typeof claims.email === 'string' ? claims.email : undefined,
        phone: typeof claims.phone === 'string' ? claims.phone : undefined,
        app_metadata: claims.app_metadata && typeof claims.app_metadata === 'object' ? claims.app_metadata : {},
        user_metadata: claims.user_metadata && typeof claims.user_metadata === 'object' ? claims.user_metadata : {},
        created_at: new Date(issuedAt * 1000).toISOString(),
      } as unknown as User;
      return { data: { user }, error: null };
    }
  }

  let result = await client.auth.getUser();
  for (const delayMs of [100, 300]) {
    if (result.data.user || !isTransientAuthError(result.error)) break;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await client.auth.getUser();
  }
  return result;
}
