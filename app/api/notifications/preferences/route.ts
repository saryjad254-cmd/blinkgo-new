/**
 * Notification Preferences API
 * ────────────────────────────
 * GET  /api/notifications/preferences - Get user's preferences
 * POST /api/notifications/preferences - Update preferences
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_BOOL_FIELDS = [
  'push_enabled', 'email_enabled', 'sms_enabled', 'in_app_enabled', 'sound_enabled',
  'order_updates', 'delivery_updates', 'promotions', 'new_features', 'reviews', 'payouts',
  'quiet_hours_enabled',
];
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await withSecurity(
    secureRoute('lenient', ['customer', 'driver', 'restaurant', 'manager', 'admin', 'super_admin']),
    async (ctx) => getPrefs(ctx.auth.user.id),
  )(req) as NextResponse;
}

async function getPrefs(userId: string) {
  const supabase = await createServerClient();
  const result = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  let data = result.data;
  const error = result.error;

  if (error) {
    logger.warn('notif prefs fetch failed', { userId }, error);
    return ok({ preferences: getDefaultPreferences() });
  }

  // Auto-create if missing
  if (!data) {
    const { data: created, error: createError } = await supabase
      .from('notification_preferences')
      .insert({ user_id: userId })
      .select()
      .single();
    if (createError) {
      logger.warn('notif prefs create failed', { userId }, createError);
      return ok({ preferences: getDefaultPreferences() });
    }
    data = created;
  }

  return ok({ preferences: data ?? getDefaultPreferences() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await withSecurity(
    secureRoute('moderate', ['customer', 'driver', 'restaurant', 'manager', 'admin', 'super_admin']),
    async (ctx, request) => updatePrefs(ctx.auth.user.id, request),
  )(req) as NextResponse;
}

async function updatePrefs(userId: string, req: NextRequest) {
  const rawBody: unknown = await req.json().catch(() => ({}));
  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
    ? rawBody as Record<string, unknown>
    : {};
  const updates: Record<string, boolean | string> = {};

  for (const field of VALID_BOOL_FIELDS) {
    if (typeof body[field] === 'boolean') updates[field] = body[field];
  }
  for (const field of ['quiet_hours_start', 'quiet_hours_end'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || !TIME_PATTERN.test(body[field])) {
        throw new ValidationError(`${field} must use HH:mm format`);
      }
      updates[field] = body[field];
    }
  }
  if (Object.keys(updates).length === 0) throw new ValidationError('No valid preference fields provided');
  updates.updated_at = new Date().toISOString();

  const supabase = await createServerClient();
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
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
  };
}
