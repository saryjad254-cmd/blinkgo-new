/**
 * Logout endpoint
 * ───────────────
 * SECURITY: Only POST is allowed (GET would let any image tag trigger logout
 * via CSRF). The refresh token is also revoked server-side.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { ok, withErrorHandling } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

function getRefreshTokenFromCookies(): string | null {
  const all = cookies().getAll();
  for (const c of all) {
    if (!c.name.startsWith('sb-') || !c.name.includes('auth-token')) continue;
    if (c.name.includes('-code-chunk-') || /\.\d+$/.test(c.name)) continue; // skip chunks
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

async function handleLogout(req: NextRequest): Promise<void> {
  // 1) Revoke the refresh token server-side (if available)
  const refreshToken = getRefreshTokenFromCookies();
  if (refreshToken) {
    try {
      const supabaseAdmin = createServiceClient();
      await supabaseAdmin.auth.admin.signOut(refreshToken);
    } catch (e) {
      logger.warn('Server-side refresh token revocation failed (non-fatal)', {}, e);
    }
  }

  // 2) Sign out via @supabase/ssr
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies().getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          for (const { name, value, options } of cookiesToSet) {
            void name; void value; void options;
          }
        },
      },
    },
  );
  try {
    await supabase.auth.signOut();
  } catch (e) {
    logger.warn('Supabase signOut failed (non-fatal)', {}, e);
  }

  // 3) Clear all auth-related cookies
  const allCurrent = cookies().getAll();
  for (const cookie of allCurrent) {
    if (
      cookie.name === 'blinkgo-session' ||
      (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
    ) {
      // Delete via response — the route returns NextResponse.json below.
    }
  }
}

// Reject GET — log out must be POST to prevent CSRF via <img src>
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // CSRF protection: allow localhost + known tunnel hosts (loca.lt, ngrok, etc.)
    const origin = req.headers.get('origin') ?? '';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const isLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    const isTunnel = (() => {
      const tunnelSuffixes = ['.loca.lt', '.ngrok.io', '.ngrok-free.app', '.ngrok.app', '.trycloudflare.com', '.vercel.app', '.netlify.app'];
      try {
        const host = new URL(origin).host;
        return tunnelSuffixes.some((s) => host.endsWith(s));
      } catch { return false; }
    })();
    const isAppUrl = appUrl && origin.startsWith(appUrl);
    if (origin && !isLocal && !isTunnel && !isAppUrl) {
      return NextResponse.json({ ok: false, error: 'CSRF' }, { status: 403 });
    }

    await handleLogout(req);

    // Clear cookies in the response
    const allCurrent = cookies().getAll();
    const res = NextResponse.json({ ok: true, loggedOut: true });
    for (const cookie of allCurrent) {
      if (
        cookie.name === 'blinkgo-session' ||
        (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
      ) {
        res.cookies.set({
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
    return res;
  });
}
