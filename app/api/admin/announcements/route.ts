/**
 * Admin: System Announcements
 * ────────────────────────────
 * GET  /api/admin/announcements - List all (admin only)
 * POST /api/admin/announcements - Create new announcement
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { audit } from '@/lib/services/audit-log';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { NotificationService } from '@/lib/services/notification-service';
import { parseAnnouncementInput } from '@/lib/admin/announcement-input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => listAnnouncements() as any,
  )(req)) as unknown as NextResponse;
}

async function listAnnouncements(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin', 'manager']);
    if (!user) throw new AuthenticationError();

    const svc = createServiceClient();
    const { data, error } = await svc
      .from('system_announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn('announcements fetch failed', { userId: user.id }, error);
      return ok({ announcements: [] });
    }
    return ok({ announcements: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => createAnnouncement(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function createAnnouncement(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin']);
    if (!user) throw new AuthorizationError('Admin access required');

    const body = parseAnnouncementInput(await req.json().catch(() => ({})));
    const { title, message, type, audience, link_url: linkUrl, link_label: linkLabel,
      is_active: isActive, starts_at: startsAt, ends_at: endsAt } = body;

    const svc = createServiceClient();
    const { data, error } = await svc
      .from('system_announcements')
      .insert({
        title: title!,
        message: message!,
        type: type!,
        audience: audience!,
        link_url: linkUrl,
        link_label: linkLabel,
        is_active: isActive,
        starts_at: startsAt,
        ends_at: endsAt,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !data) {
      logger.error('announcement create failed', { userId: user.id }, error);
      throw new Error('Failed to create announcement');
    }

    await audit('ADMIN_CONFIG_CHANGED', {
      severity: 'info',
      userId: user.id,
      userRole: user.role,
      resource: 'announcement',
      resourceId: data.id,
      metadata: { title, type, audience },
    });

    const now = Date.now();
    const startsNow = new Date(startsAt!).getTime() <= now;
    const notExpired = !endsAt || new Date(endsAt).getTime() > now;
    if (isActive && startsNow && notExpired) {
      try {
        await NotificationService.broadcast({
          audience: audience!,
          title: title!,
          body: message!,
          type: 'admin_announcement',
          data: { announcement_id: data.id, url: linkUrl?.startsWith('/') ? linkUrl : '/notifications' },
        });
      } catch (notificationError) {
        // The announcement remains durable even if a downstream push provider
        // is temporarily unavailable; operators can see the failure in logs.
        logger.warn('announcement notification fan-out failed', { announcementId: data.id, audience }, notificationError);
      }
    }

    return ok({ announcement: data });
  });
}
