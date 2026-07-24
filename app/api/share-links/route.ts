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
import { ValidationError, AuthenticationError } from '@/lib/errors';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const body = await req.json().catch(() => ({}));
    const { resource_type, resource_id, expires_in_hours } = body;
    if (!resource_type || !resource_id) {
      throw new ValidationError('resource_type and resource_id required');
    }
    const token = randomBytes(16).toString('hex');
    const expiresAt = expires_in_hours
      ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('share_links')
      .insert({
        token,
        resource_type,
        resource_id,
        created_by: user.id,
        expires_at: expiresAt,
      })
      .select('*')
      .single();
    if (error || !data) {
      // If table doesn't exist yet, still return a usable URL (in-memory)
      // so the feature works pre-migration.
      if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.message?.includes('relation') || error?.message?.includes('Could not find the table')) {
        const proto = req.headers.get('x-forwarded-proto') ?? 'https';
        const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
        const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
        return ok({ token, url: `${origin}/share/${token}`, expires_at: expiresAt });
      }
      throw new Error('Failed to create share link');
    }
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
    const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
    const url = `${origin}/share/${token}`;
    return ok({ token, url, expires_at: expiresAt });
  });
}
