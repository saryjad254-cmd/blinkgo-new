/**
 * Push Subscription API
 * ─────────────────────
 * POST /api/push/subscribe   — Save a web push subscription
 * DELETE /api/push/subscribe — Unsubscribe
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ValidationError, AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => subscribe(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function subscribe(userId: string, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();

    const body = await req.json().catch(() => ({}));
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new ValidationError('endpoint, keys.p256dh, keys.auth required');
    }
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
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
  return (await withSecurity(
    secureRoute('moderate'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => unsubscribe(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function unsubscribe(userId: string, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}));
    const { endpoint } = body;
    if (!endpoint) throw new ValidationError('endpoint required');
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);
    return ok({ unsubscribed: true });
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
