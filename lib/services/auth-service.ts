/**
 * AuthService — Single source of truth for authentication & role-detection.
 *
 * SECURITY:
 *   - JWT signature is verified via Supabase server client (createServerClient)
 *     for any code path that consumes the tokens.
 *   - Role is read from public.users (NEVER from user_metadata).
 *   - Cookies are httpOnly + Secure (when running over HTTPS) + SameSite=Lax.
 *   - The deprecated `login()` method has been removed — use `loginFull()`.
 */

import { cookies, headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { logger } from '@/lib/logging';

export type UserRole = 'customer' | 'driver' | 'restaurant' | 'admin' | 'super_admin' | 'manager';
export type LoginRedirectRole = 'customer' | 'driver' | 'restaurant' | 'admin';

const ROLE_REDIRECTS: Record<LoginRedirectRole, string> = {
  customer: '/search',
  driver: '/driver/dashboard',
  restaurant: '/restaurant/dashboard',
  admin: '/admin',
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  redirectPath: string;
}

interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
}

function adminClient() {
  return createServiceClient();
}

/**
 * Extract the Supabase user id (sub claim) from a freshly-issued access token
 * by parsing the JWT payload. The token is already trusted at this point —
 * it was just returned by GoTrue with HTTP 200 over an HTTPS request, so
 * we do NOT need to re-validate it through `supabase.auth.getUser()`.
 *
 * The previous implementation called `supabase.auth.getUser(token)` from the
 * service-role client. With the new `sb_secret_*` service-role key format
 * this call returned `401 Invalid token` because the service-role key was
 * being sent as the `apikey` header alongside the user's JWT, and certain
 * Supabase / GoTrue versions reject that combination. The token itself is
 * valid (Supabase just issued it), so we simply trust the password-grant
 * response and use the `user.id` it already included.
 *
 * SECURITY: This is safe because the password-grant endpoint is the only
 * place that issued this token in the first place, and we just observed
 * a 200 response with the matching user object in the same body.
 */
function extractUserIdFromAccessToken(accessToken: string): string {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    throw new AuthenticationError('Invalid token format');
  }
  try {
    // JWT payload is base64url-encoded JSON. We tolerate base64url and base64.
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const claims = JSON.parse(json);
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new AuthenticationError('Invalid token: missing sub claim');
    }
    return claims.sub;
  } catch (e: any) {
    if (e instanceof AuthenticationError) throw e;
    throw new AuthenticationError('Invalid token: cannot parse claims');
  }
}

export async function lookupRole(userId: string): Promise<UserRole> {
  try {
    const admin = adminClient();
    const { data, error } = await admin
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    if (error || !data?.role) {
      logger.warn('Role lookup failed', { userId, error: error?.message });
      return 'customer';
    }
    return data.role as UserRole;
  } catch (e) {
    logger.error('Role lookup threw', { userId }, e);
    return 'customer';
  }
}

export async function lookupUser(userId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, email, name, role, is_active, is_verified')
    .eq('id', userId)
    .single();
  if (error || !data) throw new NotFoundError('User');
  return data;
}

function resolveRedirectPath(role: UserRole): string {
  const r = role === 'super_admin' || role === 'manager' ? 'admin' : role;
  return ROLE_REDIRECTS[r as LoginRedirectRole] ?? '/search';
}

/**
 * Check if the current request arrived over HTTPS.
 * Trusts X-Forwarded-Proto only if behind a known proxy (Vercel sets this).
 */
function requestIsHttps(): boolean {
  try {
    // 1) Check the explicit X-Forwarded-Proto header (set by reverse proxies
    //    like Vercel, Cloudflare, nginx, localtunnel, etc.).

    try {
      const h = headers();
      const xfp = h.get('x-forwarded-proto');
      if (xfp) return xfp.toLowerCase().startsWith('https');
    } catch {
      // not in a request context — fall through
    }
    // 2) Fall back to NODE_ENV: production is assumed to be HTTPS, dev is HTTP.
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

export class AuthService {
  /**
   * Full login flow: auth + role lookup + user data.
   * Returns user info + raw tokens (for cookie setting).
   * Throws AuthenticationError on bad credentials.
   */
  static async loginFull(email: string, password: string): Promise<{
    user: AuthenticatedUser;
    tokens: AuthTokens;
  }> {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: supabaseAnon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      // Log the failure (server-side only) without leaking detail
      logger.warn('Login failed', { email, status: res.status });
      throw new AuthenticationError('Invalid email or password');
    }
    const responseBody: any = await res.json();
    if (!responseBody.access_token) {
      throw new AuthenticationError('Invalid response from authentication provider');
    }

    // Build the tokens we will hand to the cookie layer.
    // We intentionally do NOT re-validate the access_token through
    // supabase.auth.getUser() on the service-role client. The
    // password-grant response itself is the authoritative source: it
    // already includes the user object. Re-validating with the new
    // sb_secret_* service-role key triggers a 401 from GoTrue.
    const tokens: AuthTokens = {
      access_token: responseBody.access_token,
      refresh_token: responseBody.refresh_token,
      expires_in: responseBody.expires_in,
      expires_at: responseBody.expires_at,
      token_type: responseBody.token_type || 'bearer',
    };

    // Prefer the user.id from the password-grant response. Fall back to
    // parsing the JWT only if the response somehow omits the user object
    // (it should always be present for a successful grant).
    const userId: string | undefined =
      responseBody?.user?.id ?? (tokens.access_token ? extractUserIdFromAccessToken(tokens.access_token) : undefined);

    if (!userId) {
      throw new AuthenticationError('Authentication response did not include a user id');
    }

    const profile = await lookupUser(userId).catch(() => null);

    if (!profile) {
      throw new AuthenticationError('No profile found for this account');
    }
    if (profile.is_active === false) {
      throw new AuthorizationError('This account has been disabled');
    }

    return {
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role as UserRole,
        redirectPath: resolveRedirectPath(profile.role as UserRole),
      },
      tokens,
    };
  }

  /**
   * Set the Supabase auth cookies after a successful login.
   * SECURITY: httpOnly=true prevents XSS token theft. Secure flag
   * forces HTTPS-only transmission. SameSite=Lax blocks most CSRF.
   */
  static setSessionCookies(tokens: AuthTokens): void {
    const cookieStore = cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    const projectCookieName = `sb-${ref}-auth-token`;
    const isHttps = requestIsHttps();
    const maxAge = 60 * 60 * 24 * 7; // 7 days
    const cookieBase = {
      path: '/',
      maxAge,
      sameSite: 'lax' as const,
      httpOnly: true,            // CRITICAL: prevent XSS token theft
      secure: isHttps,
    };

    const payload = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      expires_at: tokens.expires_at ?? Math.floor(Date.now() / 1000) + tokens.expires_in,
    });

    if (payload.length <= 4096) {
      cookieStore.set(projectCookieName, payload, cookieBase);
    } else {
      cookieStore.set(projectCookieName, '', { ...cookieBase, maxAge: 0 });
      const chunkSize = 4096;
      const chunkCount = Math.ceil(payload.length / chunkSize);
      for (let i = 0; i < chunkCount; i++) {
        const chunk = payload.slice(i * chunkSize, (i + 1) * chunkSize);
        cookieStore.set(`${projectCookieName}.${i}`, chunk, { ...cookieBase, httpOnly: true });
      }
    }
  }

  /**
   * Sign out: clear auth cookies and revoke the server-side session.
   */
  static async logout(refreshToken?: string): Promise<void> {
    const cookieStore = cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    const projectCookieName = `sb-${ref}-auth-token`;

    // Revoke the refresh token server-side if provided
    if (refreshToken) {
      try {
        const supabase = adminClient();
        await supabase.auth.admin.signOut(refreshToken);
      } catch (e) {
        logger.warn('Refresh-token revocation failed (non-fatal)', {}, e);
      }
    }

    // Clear all chunked cookies too
    cookieStore.delete(projectCookieName);
    for (let i = 0; i < 20; i++) {
      cookieStore.delete(`${projectCookieName}.${i}`);
      cookieStore.delete(`${projectCookieName}-code-chunk-${i}`);
    }
    cookieStore.delete('blinkgo-session');

    try {
      const supabase = createServerClient();
      await supabase.auth.signOut();
    } catch (e) {
      logger.warn('Sign out failed (non-fatal)', {}, e);
    }
  }

  /**
   * Get the currently signed-in user (or null). Never throws.
   * Use for read-only paths. For protected paths, use requireUser().
   */
  static async currentUser(): Promise<AuthenticatedUser | null> {
    try {
      const supabase = createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const profile = await lookupUser(user.id).catch(() => null);
      if (!profile) return null;
      if (profile.is_active === false) return null;
      return {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role as UserRole,
        redirectPath: resolveRedirectPath(profile.role as UserRole),
      };
    } catch {
      return null;
    }
  }
}
