/**
 * Push Subscription API
 * ─────────────────────
 * POST /api/push/subscribe   — Save a web push subscription
 * DELETE /api/push/subscribe — Unsubscribe
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { ValidationError, AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const body = await req.json().catch(() => ({}));
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new ValidationError('endpoint, keys.p256dh, keys.auth required');
    }
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: req.headers.get('user-agent') ?? null,
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
    if (error) {
      throw new Error('Failed to save push subscription');
    }
    return ok({ subscribed: true });
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();
    const body = await req.json().catch(() => ({}));
    const { endpoint } = body;
    if (!endpoint) throw new ValidationError('endpoint required');
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);
    return ok({ unsubscribed: true });
  });
}
