import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { AuthenticationError, AuthorizationError, NotFoundError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/api/response';
import { SUPPORT_ATTACHMENT_BUCKET } from '@/lib/support/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['admin', 'super_admin', 'manager']);

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const { id } = await context.params;
    const auth = await createServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) throw new AuthenticationError();
    const service = createServiceClient();
    const [{ data: profile }, { data: attachment }] = await Promise.all([
      service.from('users').select('role').eq('id', user.id).maybeSingle(),
      service.from('support_ticket_attachments')
        .select('id,ticket_id,storage_path,original_name,mime_type,byte_size,expires_at,deleted_at')
        .eq('id', id)
        .maybeSingle(),
    ]);
    if (!attachment || attachment.deleted_at || new Date(attachment.expires_at).getTime() <= Date.now()) {
      throw new NotFoundError('Attachment not found');
    }
    const { data: ticket } = await service.from('support_tickets').select('user_id').eq('id', attachment.ticket_id).maybeSingle();
    if (!ticket) throw new NotFoundError('Ticket not found');
    const role = String(profile?.role ?? 'customer');
    if (ticket.user_id !== user.id && !STAFF_ROLES.has(role)) throw new AuthorizationError('Access denied');

    const { data, error } = await service.storage.from(SUPPORT_ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 60);
    if (error || !data?.signedUrl) throw new NotFoundError('Attachment not found');
    return NextResponse.json({
      ok: true,
      data: {
        attachment: {
          id: attachment.id,
          name: attachment.original_name,
          mime_type: attachment.mime_type,
          byte_size: attachment.byte_size,
          url: data.signedUrl,
          url_expires_in_seconds: 60,
          retained_until: attachment.expires_at,
        },
      },
    }, { headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  });
}
