/**
 * Notification Preferences API
 * ────────────────────────────
 * GET  /api/notifications/preferences - Get user's preferences
 * POST /api/notifications/preferences - Update preferences
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { AuthenticationError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_BOOL_FIELDS = [
  'push_enabled', 'email_enabled', 'sms_enabled', 'in_app_enabled', 'sound_enabled',
  'order_updates', 'delivery_updates', 'promotions', 'new_features', 'reviews', 'payouts',
  'quiet_hours_enabled',
];

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => getPrefs(ctx.auth.user.id) as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function getPrefs(userId: string): Promise<NextResponse> {
  return withErrorHandling(async () => {

    const supabase = createServerClient();
    let { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Auto-create if missing
    if (!data) {
      const { data: created, error: cErr } = await supabase
        .from('notification_preferences')
        .insert({ user_id: userId })
        .select()
        .single();
      if (cErr) {
        logger.warn('notif prefs create failed', { userId }, cErr);
        return ok({ preferences: getDefaultPreferences() });
      }
      data = created;
    }

    if (error) {
      logger.warn('notif prefs fetch failed', { userId }, error);
      return ok({ preferences: getDefaultPreferences() });
    }
    return ok({ preferences: data ?? getDefaultPreferences() });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => updatePrefs(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function updatePrefs(userId: string, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {

    const body = await req.json().catch(() => ({}));
    const updates: any = {};

    for (const field of VALID_BOOL_FIELDS) {
      if (typeof body[field] === 'boolean') updates[field] = body[field];
    }
    if (body.quiet_hours_start) updates.quiet_hours_start = body.quiet_hours_start;
    if (body.quiet_hours_end) updates.quiet_hours_end = body.quiet_hours_end;
    updates.updated_at = new Date().toISOString();

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      logger.error('notif prefs update failed', { userId }, error);
      throw new Error('Failed to update preferences');
    }
    return ok({ preferences: data });
  });
}

function getDefaultPreferences() {
  return {
    push_enabled: true,
    email_enabled: true,
    sms_enabled: false,
    in_app_enabled: true,
    sound_enabled: true,
    order_updates: true,
    delivery_updates: true,
    promotions: true,
    new_features: true,
    reviews: true,
    payouts: true,
    quiet_hours_enabled: false,
  };
}
