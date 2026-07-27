import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { withSecurity, HandlerContext } from '@/lib/api/security';
import { ok, fail } from '@/lib/api/response';
import { ValidationError } from '@/lib/errors';

export const dynamic = "force-dynamic";

/**
 * v81 SECURITY HARDENING — notifications route
 *
 * Wrapped in withSecurity so the authenticated user is always taken
 * from `ctx.auth.user.id` (server-verified via Supabase JWT signature)
 * and never from any client-supplied field. The `eq('user_id', user.id)`
 * filter on every query is the IDOR guard.
 */
type Notification = Record<string, unknown>;
type NotificationsListResponse = { notifications: Notification[] };

const getHandler = withSecurity<NotificationsListResponse>(
  { roles: ['customer', 'driver', 'restaurant', 'admin', 'super_admin', 'manager'] },
  async (ctx: HandlerContext) => {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', ctx.auth.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return fail(new Error('Failed to load notifications'));
    return ok({ notifications: (data || []) as Notification[] });
  },
);

const patchHandler = withSecurity<{ updated: number }>(
  { roles: ['customer', 'driver', 'restaurant', 'admin', 'super_admin', 'manager'] },
  async (ctx: HandlerContext) => {
    const body = await ctx.req.json().catch(() => ({}));
    const { id, mark_all_read } = body;

    const supabase = createServerClient();
    if (mark_all_read === true) {
      // Mass-ack: only the caller's own notifications.
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', ctx.auth.user.id)
        .is('read_at', null);
      if (error) return fail(new Error('Failed to mark notifications as read'));
      return ok({ updated: 0 });
    }

    if (typeof id === 'string' && id.length > 0) {
      // v81 SECURITY: filter on BOTH `id` and `user_id` so the caller
      // cannot mark another user's notification as read by guessing
      // the row UUID.
      const { error, data } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', ctx.auth.user.id)
        .select('id');
      if (error) return fail(new Error('Failed to mark notification as read'));
      if (!data || data.length === 0) {
        // Either no such notification OR the id belongs to another
        // user. Same 404 either way to avoid existence enumeration.
        return fail(new Error('Notification not found'));
      }
      return ok({ updated: data.length });
    }

    throw new ValidationError('id or mark_all_read required');
  },
);

export async function GET(req: NextRequest) { return getHandler(req); }
export async function PATCH(req: NextRequest) { return patchHandler(req); }
