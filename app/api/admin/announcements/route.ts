/**
 * Admin: System Announcements
 * ────────────────────────────
 * GET  /api/admin/announcements - List all (admin only)
 * POST /api/admin/announcements - Create new announcement
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { audit } from '@/lib/services/audit-log';
import { AuthenticationError, AuthorizationError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES = ['info', 'warning', 'success', 'maintenance', 'promo'];
const VALID_AUDIENCES = ['all', 'customers', 'drivers', 'restaurants', 'admins'];

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => listAnnouncements() as any,
  )({} as NextRequest)) as unknown as NextResponse;
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

    // Parse
    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? '').trim().slice(0, 200);
    const message = String(body.message ?? '').trim().slice(0, 2000);
    const type = String(body.type ?? 'info');
    const audience = String(body.audience ?? 'all');
    const linkUrl = typeof body.link_url === 'string' ? body.link_url.slice(0, 500) : null;
    const linkLabel = typeof body.link_label === 'string' ? body.link_label.slice(0, 100) : null;
    const isActive = body.is_active !== false;
    const startsAt = body.starts_at ? new Date(body.starts_at).toISOString() : new Date().toISOString();
    const endsAt = body.ends_at ? new Date(body.ends_at).toISOString() : null;

    if (!title || !message) throw new ValidationError('Title and message are required');
    if (!VALID_TYPES.includes(type)) throw new ValidationError(`Invalid type. Must be: ${VALID_TYPES.join(', ')}`);
    if (!VALID_AUDIENCES.includes(audience)) throw new ValidationError(`Invalid audience. Must be: ${VALID_AUDIENCES.join(', ')}`);

    const svc = createServiceClient();
    const { data, error } = await svc
      .from('system_announcements')
      .insert({
        title,
        message,
        type,
        audience,
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

    return ok({ announcement: data });
  });
}
