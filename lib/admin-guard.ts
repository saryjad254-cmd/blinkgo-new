/**
 * Admin Guard — Secure Server-Side Auth Helpers
 * ─────────────────────────────────────────────
 * - `requireAdminOrDev` → Allows admin OR if ENABLE_DEV_BYPASS=true
 * - `requireAdmin` → Requires authenticated admin (always)
 * - `requireAuth` → Requires any authenticated user (always)
 *
 * SECURITY:
 *   - JWT signature is verified via Supabase server client (createServerClient).
 *   - Role is read from public.users (NEVER from user_metadata).
 *   - is_active is enforced — disabled accounts are rejected.
 *   - Dev bypass requires explicit opt-in via ENABLE_DEV_BYPASS=true.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getApiUserWithRole } from './auth-helper';

const DEV_BYPASS_ENABLED = process.env.ENABLE_DEV_BYPASS === 'true';

export interface AdminGuardResult {
  ok: boolean;
  auth?: { user: any; profile: any };
  error?: NextResponse;
}

function isActiveAccount(profile: any): boolean {
  return profile && profile.is_active !== false;
}

/**
 * Allow if:
 *   1. User is authenticated AND has admin role AND is active
 *   2. OR ENABLE_DEV_BYPASS=true is set (dev only)
 */
export async function requireAdminOrDev(request?: NextRequest): Promise<AdminGuardResult> {
  if (DEV_BYPASS_ENABLED && process.env.NODE_ENV !== 'production') {
    return { ok: true, auth: { user: { id: 'dev' }, profile: { role: 'admin' } } };
  }

  const auth = await getApiUserWithRole();
  if (!auth) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }),
    };
  }
  if (auth.profile?.role !== 'admin' && auth.profile?.role !== 'super_admin' && auth.profile?.role !== 'manager') {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: 'ADMIN_ONLY' }, { status: 403 }),
    };
  }
  if (!isActiveAccount(auth.profile)) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: 'ACCOUNT_DISABLED' }, { status: 403 }),
    };
  }
  return { ok: true, auth };
}

/**
 * Require authenticated admin (no dev bypass).
 * Use for: admin dashboard endpoints, sensitive operations.
 */
export async function requireAdmin(request?: NextRequest): Promise<AdminGuardResult> {
  const auth = await getApiUserWithRole();
  if (!auth) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }),
    };
  }
  if (auth.profile?.role !== 'admin' && auth.profile?.role !== 'super_admin' && auth.profile?.role !== 'manager') {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: 'ADMIN_ONLY' }, { status: 403 }),
    };
  }
  if (!isActiveAccount(auth.profile)) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: 'ACCOUNT_DISABLED' }, { status: 403 }),
    };
  }
  return { ok: true, auth };
}

/**
 * Require any authenticated, active user.
 */
export async function requireAuth(request?: NextRequest): Promise<AdminGuardResult> {
  const auth = await getApiUserWithRole();
  if (!auth) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }),
    };
  }
  if (!isActiveAccount(auth.profile)) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: 'ACCOUNT_DISABLED' }, { status: 403 }),
    };
  }
  return { ok: true, auth };
}
