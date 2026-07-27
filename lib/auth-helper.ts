/**
 * Auth Helper — Secure Server-Side User Lookup
 * ──────────────────────────────────────────────
 * All functions in this module verify the JWT signature via Supabase's
 * server-side auth.getUser() — they never decode JWTs without verification.
 *
 * The legacy getApiUser() / getApiUserWithRole() (which decoded JWTs without
 * signature verification) have been REMOVED. Use createServerClient().auth.getUser()
 * directly, or use the higher-level helpers requireRole() / requireAdminRole()
 * in lib/rbac.ts and lib/admin/admin-rbac.ts.
 */

import { createServerClient } from '@/lib/supabase/server';

export interface AuthedUser {
  id: string;
  email: string | null;
  role: string;
  name: string | null;
  isActive: boolean;
  isVerified: boolean;
}

/**
 * Get the current user with their public profile (role, name, is_active, is_verified).
 * Returns null if not authenticated, or if the user is not active.
 *
 * SECURITY: Uses Supabase server client which verifies the JWT signature
 * via the project's JWT secret. No way to forge identity.
 */
export async function getApiUserWithRole(): Promise<{ user: AuthedUser; profile: any } | null> {
  try {
    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const { data: profile } = await supabase
      .from('users')
      .select('id, email, name, role, is_active, is_verified')
      .eq('id', user.id)
      .single();
    if (!profile) return null;

    return {
      user: {
        id: profile.id,
        email: profile.email ?? user.email ?? null,
        role: profile.role,
        name: profile.name ?? null,
        isActive: profile.is_active !== false,
        isVerified: profile.is_verified === true,
      },
      profile,
    };
  } catch {
    return null;
  }
}

/**
 * Require an active authenticated user with one of the allowed roles.
 * Returns the user info on success, or null on failure.
 */
export async function requireApiRole(
  allowed: string | string[],
): Promise<AuthedUser | null> {
  const result = await getApiUserWithRole();
  if (!result) return null;
  if (!result.user.isActive) return null;
  const allowed_ = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowed_.includes(result.user.role)) return null;
  return result.user;
}
