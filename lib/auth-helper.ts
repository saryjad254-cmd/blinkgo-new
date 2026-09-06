/**
 * Canonical server-side authentication and role lookup.
 *
 * Identity always comes from Supabase Auth's signature-verified getUser().
 * Authorization always comes from public.users and protected app_metadata.
 * Editable user_metadata is never an authorization source.
 */
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { User } from '@supabase/supabase-js';

export interface AuthedUser {
  id: string;
  email: string | null;
  role: string;
  name: string | null;
  isActive: boolean;
  isVerified: boolean;
  permissions?: string[];
}

export interface AuthProfile {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  is_active: boolean | null;
  is_verified: boolean | null;
}

export interface ApiAuthResult {
  user: AuthedUser;
  profile: AuthProfile;
}

type VerifiedAuthUser = Pick<User, 'id' | 'email' | 'app_metadata'>;

function permissionsFrom(user: VerifiedAuthUser): string[] {
  const permissions = user.app_metadata?.permissions;
  return Array.isArray(permissions)
    ? permissions.filter((value): value is string => typeof value === 'string')
    : [];
}

async function buildAuthResult(user: VerifiedAuthUser): Promise<ApiAuthResult | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('users')
    .select('id, email, name, role, is_active, is_verified')
    .eq('id', user.id)
    .maybeSingle();
  const profile = data as AuthProfile | null;
  if (!profile || profile.is_active === false) return null;

  return {
    user: {
      id: profile.id,
      email: profile.email ?? user.email ?? null,
      role: profile.role,
      name: profile.name ?? null,
      isActive: true,
      isVerified: profile.is_verified === true,
      permissions: permissionsFrom(user),
    },
    profile,
  };
}

/** Resolve a cookie-bound authenticated user and authoritative profile. */
export async function getApiUserWithRole(): Promise<ApiAuthResult | null> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return buildAuthResult(user);
  } catch {
    return null;
  }
}

/**
 * Resolve cookie auth first, then a Bearer token. Bearer tokens are always
 * verified by Supabase Auth, including local and staging development.
 */
export async function getApiUserFromRequest(
  req: { headers: { get(name: string): string | null } } | null,
): Promise<ApiAuthResult | null> {
  const cookieResult = await getApiUserWithRole();
  if (cookieResult) return cookieResult;
  if (!req) return null;

  const authorization = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return buildAuthResult(user);
  } catch {
    return null;
  }
}

/** Require an active user whose authoritative role satisfies the route. */
export async function requireApiRole(
  allowed: string | string[],
  request: { headers: { get(name: string): string | null } } | null = null,
): Promise<AuthedUser | null> {
  const result = request ? await getApiUserFromRequest(request) : await getApiUserWithRole();
  if (!result?.user.isActive) return null;
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];

  const roleRank: Record<string, number> = { super_admin: 3, admin: 2, manager: 1 };
  const minimumAdminRank = Math.max(0, ...allowedRoles.map((role) => roleRank[role] ?? 0));
  const userRank = roleRank[result.user.role] ?? 0;
  const hierarchyOk = minimumAdminRank > 0 && userRank >= minimumAdminRank;

  if (!allowedRoles.includes(result.user.role) && !hierarchyOk) return null;
  return result.user;
}
