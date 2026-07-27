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
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
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

  // v86 fix (post-login redirect bug):
  //
  // The previous implementation queried `public.users` through the anon
  // (user-scoped) client. With the production RLS policies in effect
  // (`users_select_self USING (auth.uid() = id)`), this query was
  // correct IN THEORY — but it failed in practice for two reasons that
  // only manifest in production:
  //
  //   1. The `app_metadata.role` claim is NEVER set on a password-grant
  //      JWT (only the `user_metadata` is set by the app, and only
  //      `app_metadata` is honoured by RLS). So the
  //      `users_select_admin USING (auth.jwt() -> 'app_metadata' ->>
  //      'role' = 'admin')` policy is never true for an operator who
  //      logged in with email+password — they can ONLY read their own
  //      row via `users_select_self`.
  //
  //   2. If the operator's `public.users.id` ever drifts from their
  //      `auth.users.id` (e.g. a soft-deleted prior user, a re-run of
  //      the setup script with a different canonical UUID, or a
  //      recovery that kept the old auth id), the anon query
  //      `SELECT … FROM users WHERE id = auth.uid()` returns ZERO
  //      rows (RLS hides the row, the WHERE matches nothing). The
  //      previous code then auto-created a brand-new `customer` row
  //      for the same auth id, which immediately failed the role
  //      check and redirected the user back to /login with
  //      `?error=insufficient_permissions`.
  //
  // The fix: use the **service-role** client to read `public.users` for
  // the authenticated user. The service-role key bypasses RLS, so we
  // always see the real row regardless of which policy was active or
  // whether the public.users.id matches. This is safe because we are
  // still scoping the query by `user.id` taken from the verified
  // `supabase.auth.getUser()` JWT — there is no way for a different
  // user to reach this code path with someone else's user.id.
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('id, email, name, role, is_active, is_verified')
    .eq('id', user.id)
    .maybeSingle();
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
    // v86 fix: do NOT auto-create a public.users row from the page
    // request. The previous auto-create path silently downgraded the
    // user to role='customer' and then redirected them to /login with
    // `?error=insufficient_permissions` — which is exactly the
    // post-login bug we are fixing. Auto-creating a customer row
    // behind the user's back (overwriting their real role with
    // 'customer') was the second of two stacked failures.
    //
    // Operator accounts (admin, driver, restaurant) are pre-provisioned
    // via `scripts/setup-operator-accounts.mjs`. The setup script
    // writes BOTH `auth.users` AND `public.users` with the SAME
    // canonical UUID, so this branch should never fire for an
    // operator. If it does fire, something is wrong upstream and we
    // want the user to see a clear error rather than a confusing
    // permission redirect.
    //
    // For OAuth customers (the only legitimate case where
    // public.users is missing) the OAuth callback route
    // `app/auth/callback/route.ts` is responsible for creating the
    // public.users row BEFORE the user lands on any page. If we are
    // here and the row is missing for an OAuth user, that means the
    // callback failed — we should NOT paper over that by auto-creating
    // a customer row here.
    authTrace('redirect_to_login', {
      source: AUTH_SOURCES.REQUIRE_ROLE_NO_PROFILE,
      reason: 'profile_not_found_no_autocreate',
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
  // F1 fix: apply admin hierarchy. If 'admin' is in the allowed list, also
  // pass for 'super_admin' and 'manager' (admin implies those). This is the
  // canonical hierarchy already used by requireAdminRole() below.
  const roleRank: Record<string, number> = { super_admin: 3, admin: 2, manager: 1 };
  const highestAdminRankInAllowed = Math.max(
    0,
    ...allowedRoles.map((r) => roleRank[r] ?? 0)
  );
  const userRank = roleRank[profile.role] ?? 0;
  const adminHierarchyOk = highestAdminRankInAllowed > 0 && userRank >= highestAdminRankInAllowed;
  if (!allowedRoles.includes(profile.role) && !adminHierarchyOk) {
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
