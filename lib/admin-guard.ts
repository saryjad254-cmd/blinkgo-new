/**
 * Admin Guard — Secure Server-Side Auth Helpers
 * ─────────────────────────────────────────────
 * Built on @/lib/foundation: uses fail() and Foundation error types.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getApiUserWithRole } from './auth-helper';
import type { ApiAuthResult, AuthProfile } from './auth-helper';
import { fail, AuthenticationError, AuthorizationError, log } from '@/lib/foundation';

const DEV_BYPASS_ENABLED = process.env.ENABLE_DEV_BYPASS === 'true';

export interface AdminGuardResult {
  ok: boolean;
  auth?: ApiAuthResult;
  error?: NextResponse;
}

function isActiveAccount(profile: AuthProfile): boolean {
  return profile && profile.is_active !== false;
}

export async function requireAdminOrDev(_request?: NextRequest): Promise<AdminGuardResult> {
  void _request;
  if (DEV_BYPASS_ENABLED && process.env.NODE_ENV !== 'production') {
    log.warn('admin.dev_bypass_active');
    return {
      ok: true,
      auth: {
        user: { id: 'dev', email: null, role: 'admin', name: 'Development admin', isActive: true, isVerified: true },
        profile: { id: 'dev', email: null, name: 'Development admin', role: 'admin', is_active: true, is_verified: true },
      },
    };
  }

  const auth = await getApiUserWithRole();
  if (!auth) {
    return { ok: false, error: fail(new AuthenticationError()) };
  }
  const role = auth.profile?.role;
  if (role !== 'admin' && role !== 'super_admin' && role !== 'manager') {
    return { ok: false, error: fail(new AuthorizationError('Admin access required')) };
  }
  if (!isActiveAccount(auth.profile)) {
    return { ok: false, error: fail(new AuthorizationError('Account is disabled')) };
  }
  return { ok: true, auth };
}

export async function requireAdmin(_request?: NextRequest): Promise<AdminGuardResult> {
  void _request;
  const auth = await getApiUserWithRole();
  if (!auth) {
    return { ok: false, error: fail(new AuthenticationError()) };
  }
  const role = auth.profile?.role;
  if (role !== 'admin' && role !== 'super_admin' && role !== 'manager') {
    return { ok: false, error: fail(new AuthorizationError('Admin access required')) };
  }
  if (!isActiveAccount(auth.profile)) {
    return { ok: false, error: fail(new AuthorizationError('Account is disabled')) };
  }
  return { ok: true, auth };
}

export async function requireAuth(_request?: NextRequest): Promise<AdminGuardResult> {
  void _request;
  const auth = await getApiUserWithRole();
  if (!auth) {
    return { ok: false, error: fail(new AuthenticationError()) };
  }
  if (!isActiveAccount(auth.profile)) {
    return { ok: false, error: fail(new AuthorizationError('Account is disabled')) };
  }
  return { ok: true, auth };
}
