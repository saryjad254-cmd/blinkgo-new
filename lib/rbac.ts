/**
 * RBAC & Authentication Helpers
 * ──────────────────────────────
 * Server-side helpers for role-based access control.
 * Reads role from public.users (NEVER from user_metadata).
 *
 * Functions:
 *  - requireRole(role)         → Page-level: returns user or redirects to /login
 *  - requireRestaurantId()     → Page-level: returns { restaurantId, user } or redirects
 *  - requireAdminRole(perm)    → API-level: returns admin context or 401
 *  - requireApiRole(roles)     → API-level: returns user or null
 */

import { NextResponse, type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';

// ── Types ──
export type AdminPermission = 'super_admin' | 'admin' | 'manager';
export type AppRole = 'customer' | 'driver' | 'restaurant' | 'admin' | 'super_admin' | 'manager';

export interface AdminContext {
  user: {
    id: string;
    email: string | null;
    role: AdminPermission;
    name?: string;
  };
}

export interface AuthedUser {
  id: string;
  email: string | null;
  role: string;
  name: string | null;
  isActive: boolean;
  isVerified: boolean;
}

export type CurrentUser = AuthedUser;

// ── Page-level helpers (redirect on fail) ──

/**
 * Require a user with the specified role for a page.
 * Returns the user if the role matches, otherwise redirects to /login.
 */
export async function requireRole(allowed: string | string[]): Promise<AuthedUser> {
  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
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

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role, is_active, is_verified')
    .eq('id', user.id)
    .single();
  if (!profile) {
    authTrace('auto_create_profile_attempt', {
      source: AUTH_SOURCES.REQUIRE_ROLE_NO_PROFILE,
      reason: 'profile_not_found_in_public_users_will_try_create',
      userId: user.id,
      role: Array.isArray(allowed) ? allowed.join(',') : allowed,
    });

    // PRODUCTION FIX: If the user is authenticated but has no public.users
    // row (e.g., OAuth callback failed to create it due to transient DB
    // error), create it now as a safety net. This prevents the user
    // from being silently redirected to /login with no error message.
    //
    // SECURITY: First-time users always get role='customer' regardless
    // of any user_metadata the provider may have included.
    try {
      const adminClient = createAdminClient();
      const meta = user.user_metadata || {};
      const displayName =
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof meta.name === 'string' && meta.name) ||
        (user.email ? user.email.split('@')[0] : 'User');
      // Defensive: only include columns that exist in production users table.
      // The production schema may not have `auth_provider` or `avatar_url`,
      // so we attempt the insert with the full payload first, then fall back
      // to a minimal payload if the first attempt fails.
      const fullPayload = {
        id: user.id,
        email: user.email || null,
        name: displayName,
        role: 'customer', // hard-coded for first-time users
        is_active: true,
        is_verified: true,
        auth_provider: 'oauth',
        avatar_url: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
      };
      const minimalPayload = {
        id: user.id,
        email: user.email || null,
        name: displayName,
        role: 'customer',
        is_active: true,
        is_verified: true,
      };

      let createErr: any = null;
      let created: any = null;
      let r1 = await adminClient
        .from('users')
        .upsert(fullPayload, { onConflict: 'id' })
        .select('id, email, name, role, is_active, is_verified')
        .maybeSingle();

      if (r1.error && (r1.error.code === 'PGRST204' || r1.error.message?.includes('schema cache') || r1.error.message?.includes('does not exist'))) {
        authTrace('auto_create_fallback_minimal', {
          source: AUTH_SOURCES.REQUIRE_ROLE_NO_PROFILE,
          reason: 'full_payload_failed_using_minimal',
          userId: user.id,
          errorCode: r1.error.code,
          errorMessage: r1.error.message,
        });
        const r2 = await adminClient
          .from('users')
          .upsert(minimalPayload, { onConflict: 'id' })
          .select('id, email, name, role, is_active, is_verified')
          .maybeSingle();
        createErr = r2.error;
        created = r2.data;
      } else {
        createErr = r1.error;
        created = r1.data;
      }

      if (createErr || !created) {
        authTrace('redirect_to_login', {
          source: AUTH_SOURCES.REQUIRE_ROLE_NO_PROFILE,
          reason: 'auto_create_failed',
          userId: user.id,
          errorCode: createErr?.code,
          errorMessage: createErr?.message,
          redirectTarget: '/login?error=require_role_no_profile',
        });
        redirect('/login?error=require_role_no_profile');
      }

      authTrace('auto_create_profile_ok', {
        source: AUTH_SOURCES.REQUIRE_ROLE_NO_PROFILE,
        userId: user.id,
        role: 'customer',
        isActive: true,
        isVerified: true,
      });

      // Use the newly-created profile
      const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
      if (!allowedRoles.includes('customer')) {
        authTrace('redirect_to_login', {
          source: AUTH_SOURCES.REQUIRE_ROLE_WRONG_ROLE,
          reason: 'insufficient_permissions_after_create',
          userId: user.id,
          role: 'customer',
        });
        redirect('/login?error=insufficient_permissions');
      }
      return {
        id: created.id,
        email: created.email ?? user.email ?? null,
        role: created.role,
        name: created.name ?? null,
        isActive: created.is_active !== false,
        isVerified: created.is_verified === true,
      };
    } catch (e: any) {
      authTrace('redirect_to_login', {
        source: AUTH_SOURCES.REQUIRE_ROLE_NO_PROFILE,
        reason: 'auto_create_threw',
        userId: user.id,
        errorCode: 'exception',
        errorMessage: e?.message,
        redirectTarget: '/login?error=require_role_no_profile',
      });
      redirect('/login?error=require_role_no_profile');
    }
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
  if (!allowedRoles.includes(profile.role)) {
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
  };
}

/**
 * Require a restaurant user and return their restaurant_id.
 * For restaurant pages.
 */
export async function requireRestaurantId(): Promise<{ restaurantId: string; user: AuthedUser }> {
  const user = await requireRole(['restaurant', 'admin', 'super_admin']);
  if (user.role === 'restaurant') {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('restaurants')
      .select('id')
      .eq('owner_id', user.id)
      .single();
    if (!data) {
      redirect('/login?error=no_restaurant');
    }
    return { restaurantId: data.id, user };
  }
  // For admin/super_admin, get the first restaurant (or could be parameterized)
  const supabase = createServerClient();
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

/**
 * Verify the request is from an authenticated admin with the required permission level.
 * Returns the admin context on success, or a 401/403 response on failure.
 */
export async function requireAdminRole(
  _request: NextRequest | unknown = null,
  required: AdminPermission = 'manager'
): Promise<AdminContext | NextResponse> {
  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (profile.is_active === false) {
    return NextResponse.json({ ok: false, error: 'ACCOUNT_DISABLED' }, { status: 403 });
  }

  // Role hierarchy
  const roleRank: Record<AdminPermission, number> = { super_admin: 3, admin: 2, manager: 1 };
  const userRank = roleRank[profile.role as AdminPermission] ?? 0;
  if (userRank < roleRank[required]) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  return {
    user: {
      id: profile.id,
      email: profile.email,
      role: profile.role as AdminPermission,
      name: profile.name ?? undefined,
    },
  };
}

/**
 * Alias for getApiUserWithRole().requireApiRole in auth-helper.
 * Returns user or null (for API routes).
 */
export async function requireApiRole(
  allowed: string | string[]
): Promise<AuthedUser | null> {
  const result = await getApiUserWithRole();
  if (!result) return null;
  if (!result.user.isActive) return null;
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedRoles.includes(result.user.role)) return null;
  return result.user;
}
