import type { SupabaseClient } from '@supabase/supabase-js';

export type PrivilegedMfaState = 'verified' | 'required' | 'unavailable';

/**
 * Privileged MFA fails closed in production. Local development and the mock
 * Supabase harness stay usable unless explicitly opted in for integration QA.
 */
export function isPrivilegedMfaEnforced() {
  if (process.env.DISABLE_ADMIN_MFA === 'true') return false;
  return process.env.NODE_ENV === 'production' || process.env.ENFORCE_ADMIN_MFA === 'true';
}

export async function getPrivilegedMfaState(client: SupabaseClient): Promise<PrivilegedMfaState> {
  if (!isPrivilegedMfaEnforced()) return 'verified';
  try {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return 'unavailable';
    return data.currentLevel === 'aal2' ? 'verified' : 'required';
  } catch {
    return 'unavailable';
  }
}

export function safeAdminRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith('/admin') || value.startsWith('//')) return '/admin';
  return value;
}
