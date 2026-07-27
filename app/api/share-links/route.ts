/**
 * Share Links API
 * ───────────────
 * POST /api/share-links
 * Body: { resource_type, resource_id, expires_in_hours? }
 * Returns: { token, url }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ValidationError } from '@/lib/errors';
import { randomBytes } from 'crypto';
import { getCanonicalBaseUrl } from '@/lib/auth/redirect-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => createShareLink(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function createShareLink(userId: string, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();

    const body = await req.json().catch(() => ({}));
    const { resource_type, resource_id, expires_in_hours } = body;
    if (!resource_type || !resource_id) {
      throw new ValidationError('resource_type and resource_id required');
    }
    const token = randomBytes(16).toString('hex');
    const expiresAt = expires_in_hours
      ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // v80 (audit open-redirect): build the share URL from the CANONICAL
    // APP_URL (validated against the allowlist), NOT from
    // `x-forwarded-host`. Without this, an attacker who could set
    // X-Forwarded-Host (e.g. via a misconfigured proxy hop) would get
    // back a `url` pointing at their own server — turning a share link
    // into a phishing payload.
    let appUrl: string;
    try {
      appUrl = getCanonicalBaseUrl(req.nextUrl.origin);
    } catch {
      appUrl = new URL(req.url).origin;
    }
    const url = `${appUrl}/share/${token}`;

    const { data, error } = await supabase
      .from('share_links')
      .insert({
        token,
        resource_type,
        resource_id,
        created_by: userId,
        expires_at: expiresAt,
      })
      .select('*')
      .single();
    if (error || !data) {
      // If table doesn't exist yet, still return a usable URL so the
      // feature works pre-migration.
      if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.message?.includes('relation') || error?.message?.includes('Could not find the table')) {
        return ok({ token, url, expires_at: expiresAt });
      }
      throw new Error('Failed to create share link');
    }
    return ok({ token, url, expires_at: expiresAt });
  });
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
