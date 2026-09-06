/**
 * RBAC & Authentication Helpers
 * ──────────────────────────────
 * Server-side helpers for role-based access control.
 *
 * Built on top of @/lib/foundation:
 *   - `requireRole` uses Foundation's `Role` type
 *   - `requireAdminRole` returns Foundation-shaped responses
 *
 * Public exports:
 *  - requireRole(role)            → Page-level: returns user or redirects to /login
 *  - requireRestaurantId()        → Page-level: returns { restaurantId, user } or redirects
 *  - requireAdminRole(perm)       → API-level: returns admin context or 401/403
 *  - getApiUserWithRole()         → Re-export from auth-helper
 *  - requireApiRole()             → Re-export from auth-helper
 */

import { NextResponse, type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';
import { roleSatisfies, type Role } from '@/lib/foundation/types';
import { getUserWithTransientRetry } from '@/lib/auth/get-user-with-retry';

import { getApiUserFromRequest, type AuthedUser } from '@/lib/auth-helper';
export { getApiUserWithRole, requireApiRole } from '@/lib/auth-helper';

// ── Types ──
export type AdminPermission = 'super_admin' | 'admin' | 'manager';
export type AppRole = Role;

export interface AdminContext {
  user: {
    id: string;
    email: string | null;
    role: AdminPermission;
    name?: string;
  };
}

// Alias for `AuthedUser` (the canonical auth-user shape from auth-helper)
export type CurrentUser = AuthedUser;
export type { AuthedUser };

// ── Page-level helpers (redirect on fail) ──
export const requireRole = cache(async function requireRole(allowed: string | string[]): Promise<{
  id: string;
  email: string | null;
  role: string;
  name: string | null;
  isActive: boolean;
  isVerified: boolean;
  permissions: string[];
}> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await getUserWithTransientRetry(supabase);
  if (error || !user) {
    authTrace('redirect_to_login', {
      source: AUTH_SOURCES.REQUIRE_ROLE_AUTH_FAIL,
      reason: 'no_user_or_auth_error',
      role: Array.isArray(allowed) ? allowed.join(',') : allowed,
      hasSession: !!user,
      errorCode: error?.name,
      errorMessage: error?.message,
      redirectTarget: '/login?error=require_role_auth',
    });
    redirect('/login?error=require_role_auth');
  }

  // Read the authoritative role from public.users. Never authorize from
  // user_metadata: Supabase users can edit that object themselves.
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('id, email, name, role, is_active, is_verified')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) {
    authTrace('redirect_to_login', {
      source: AUTH_SOURCES.REQUIRE_ROLE_NO_PROFILE,
      reason: 'profile_not_found_in_public_users',
      userId: user.id,
      role: Array.isArray(allowed) ? allowed.join(',') : allowed,
      redirectTarget: '/login?error=require_role_no_profile',
    });
    redirect('/login?error=require_role_no_profile');
  }
  if (profile.is_active === false) {
    authTrace('redirect_to_login', {
      source: AUTH_SOURCES.REQUIRE_ROLE_INACTIVE,
      reason: 'account_disabled',
      userId: user.id,
      role: profile.role,
      isActive: profile.is_active,
    });
    redirect('/login?error=account_disabled');
  }
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  // Two-way check:
  // 1. Explicit match — user.role is in allowedRoles
  // 2. Hierarchy — user.role >= max(allowedRoles)
  // This means a customer can access /customer routes, but admin/super_admin
  // can also access them (for support/testing). The hierarchy check alone
  // would FAIL because customer (0) is not >= admin (3).
  const explicit = allowedRoles.includes(profile.role);
  const hierarchical = roleSatisfies(profile.role as Role, allowedRoles as Role[]);
  const ok = explicit || hierarchical;
  if (!ok) {
    authTrace('redirect_to_login', {
      source: AUTH_SOURCES.REQUIRE_ROLE_WRONG_ROLE,
      reason: 'insufficient_permissions',
      userId: user.id,
      role: profile.role,
      isActive: profile.is_active,
    });
    redirect('/login?error=insufficient_permissions');
  }
  authTrace('allow', {
    source: AUTH_SOURCES.REQUIRE_ROLE_OK,
    userId: user.id,
    role: profile.role,
    isActive: profile.is_active,
    isVerified: profile.is_verified,
  });
  return {
    id: profile.id,
    email: profile.email ?? user.email ?? null,
    role: profile.role,
    name: profile.name ?? null,
    isActive: profile.is_active !== false,
    isVerified: profile.is_verified === true,
    permissions: Array.isArray(user.app_metadata?.permissions) ? user.app_metadata.permissions : [],
  };
});

export async function requireRestaurantId(): Promise<{ restaurantId: string; user: Awaited<ReturnType<typeof requireRole>> }> {
  const user = await requireRole(['restaurant', 'admin', 'super_admin']);
  if (user.role === 'restaurant') {
    const supabase = await createServerClient();
    const { data: profile } = await supabase
      .from('users')
      .select('restaurant_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.restaurant_id) {
      const { data: linkedRestaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('id', profile.restaurant_id)
        .eq('owner_id', user.id)
        .maybeSingle();
      if (linkedRestaurant) return { restaurantId: linkedRestaurant.id, user };
    }
    const { data } = await supabase
      .from('restaurants')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) {
      redirect('/login?error=no_restaurant');
    }
    return { restaurantId: data.id, user };
  }
  const supabase = await createServerClient();
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!data) {
    redirect('/login?error=no_restaurant');
  }
  return { restaurantId: data.id, user };
}

// ── API-level helpers (return null on fail) ──
export async function requireAdminRole(
  request: NextRequest | unknown = null,
  required: AdminPermission = 'manager'
): Promise<AdminContext | NextResponse> {
  const authRequest = request && typeof request === 'object' && 'headers' in request
    ? request as NextRequest
    : null;
  const auth = await getApiUserFromRequest(authRequest);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!auth.user.isActive) {
    return NextResponse.json({ ok: false, error: 'ACCOUNT_DISABLED' }, { status: 403 });
  }

  // Foundation hierarchy check
  const roleRank: Record<AdminPermission, number> = { super_admin: 3, admin: 2, manager: 1 };
  const userRank = roleRank[auth.user.role as AdminPermission] ?? 0;
  if (userRank < roleRank[required]) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  return {
    user: {
      id: auth.user.id,
      email: auth.user.email,
      role: auth.user.role as AdminPermission,
      name: auth.user.name ?? undefined,
    },
  };
}
