/**
 * Logout endpoint
 * ───────────────
 * SECURITY: Only POST is allowed (GET would let any image tag trigger logout
 * via CSRF). The refresh token is also revoked server-side.
 *
 * Migrated to apiRoute() — the canonical API entry point.
 */
import { cookies } from 'next/headers';
import { apiRoute, ok, log, tier } from '@/lib/api/canonical';
import { createServiceClient } from '@/lib/data';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

async function getRefreshTokenFromCookies(): Promise<string | null> {
  const all = (await cookies()).getAll();
  for (const c of all) {
    if (!c.name.startsWith('sb-') || !c.name.includes('auth-token')) continue;
    if (c.name.includes('-code-chunk-') || /\.\d+$/.test(c.name)) continue;
    try {
      const value = decodeURIComponent(c.value);
      const parsed = JSON.parse(value);
      if (parsed?.refresh_token) return parsed.refresh_token;
    } catch {
      // not JSON
    }
  }
  return null;
}

export const POST = apiRoute({
  method: 'POST',
  auth: 'public',  // logout works even with expired session
  rateLimit: tier('auth'),
  csrf: 'skip',  // logout must work without Origin (user might be on different page)
  handler: async () => {
    try {
      // 1) Revoke the refresh token server-side
      const refreshToken = await getRefreshTokenFromCookies();
      if (refreshToken) {
        try {
          const supabaseAdmin = createServiceClient();
          await supabaseAdmin.auth.admin.signOut(refreshToken);
        } catch (error: unknown) {
          log.warn('Server-side refresh token revocation failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
        }
      }

      // 2) Sign out via @supabase/ssr
      try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() { return cookieStore.getAll(); },
              setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
                for (const { name, value, options } of cookiesToSet) {
                  void name; void value; void options;
                }
              },
            },
          },
        );
        await supabase.auth.signOut();
      } catch (error: unknown) {
        log.warn('Supabase signOut failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      // 3) Clear all auth-related cookies
      const allCurrent = (await cookies()).getAll();
      const response = ok({ loggedOut: true });
      for (const cookie of allCurrent) {
        if (
          cookie.name === 'blinkgo-session' ||
          (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
        ) {
          response.cookies.set({
            name: cookie.name,
            value: '',
            expires: new Date(0),
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          });
        }
      }
      return response;
    } catch (error: unknown) {
      log.error('logout failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
      });
      throw error;
    }
  },
});
