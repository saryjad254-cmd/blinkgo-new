/**
 * Durable, owner-scoped support API.
 * GET lists or reads a ticket, POST creates/replies, PATCH is staff-only
 * workflow control. Sensitive attachments stay in a private bucket.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { AuthenticationError, ValidationError, NotFoundError, AuthorizationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { audit } from '@/lib/services/audit-log';
import {
  SUPPORT_ATTACHMENT_BUCKET,
  SUPPORT_ATTACHMENT_RETENTION_DAYS,
  isSupportIssueType,
  supportPolicy,
  supportReference,
  supportSlaDueAt,
  type SupportIssueType,
} from '@/lib/support/policy';
import { parseSupportAttachment, supportAttachmentPath, type ParsedSupportAttachment } from '@/lib/support/attachment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['admin', 'super_admin', 'manager']);
const VALID_STATUSES = new Set(['open', 'in_progress', 'waiting_user', 'resolved', 'closed']);
const VALID_NEXT_ACTIONS = new Set(['waiting_support', 'waiting_customer', 'refund_review', 'merchant_review', 'driver_review', 'resolved']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

type AuthUser = { id: string; role: string };
type SupportAttachmentRow = {
  id: string;
  original_name: string;
  mime_type: string;
  byte_size: number;
  reply_id: string | null;
  created_at: string;
};

function publicAttachment(row: SupportAttachmentRow) {
  return {
    id: row.id,
    name: row.original_name,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    reply_id: row.reply_id,
    created_at: row.created_at,
  };
}

async function uploadAttachment(
  ticketId: string,
  replyId: string | null,
  uploaderId: string,
  attachment: ParsedSupportAttachment,
) {
  const service = createServiceClient();
  const path = supportAttachmentPath(ticketId, attachment.extension);
  const { error: uploadError } = await service.storage
    .from(SUPPORT_ATTACHMENT_BUCKET)
    .upload(path, attachment.bytes, { contentType: attachment.mimeType, cacheControl: '0', upsert: false });
  if (uploadError) throw new Error(`support_attachment_upload_failed:${uploadError.message}`);

  const expiresAt = new Date(Date.now() + SUPPORT_ATTACHMENT_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await service
    .from('support_ticket_attachments')
    .insert({
      ticket_id: ticketId,
      reply_id: replyId,
      uploader_id: uploaderId,
      storage_path: path,
      original_name: attachment.originalName,
      mime_type: attachment.mimeType,
      byte_size: attachment.bytes.length,
      sha256: attachment.sha256,
      expires_at: expiresAt,
    })
    .select('id,original_name,mime_type,byte_size,reply_id,created_at')
    .single();

  if (error || !data) {
    await service.storage.from(SUPPORT_ATTACHMENT_BUCKET).remove([path]);
    throw new Error(`support_attachment_metadata_failed:${error?.message ?? 'missing row'}`);
  }
  return publicAttachment(data as SupportAttachmentRow);
}

async function currentUser(): Promise<{ user: { id: string; email?: string }; role: string; restaurantId: string | null }> {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) throw new AuthenticationError();
  const service = createServiceClient();
  const { data: profile } = await service.from('users').select('role,restaurant_id').eq('id', user.id).maybeSingle();
  return { user: { id: user.id, email: user.email }, role: String(profile?.role ?? 'customer'), restaurantId: profile?.restaurant_id ?? null };
}

async function assertOrderAccess(orderId: string, userId: string, role: string, restaurantId: string | null) {
  const service = createServiceClient();
  const { data: order } = await service
    .from('orders')
    .select('id,customer_id,driver_id,restaurant_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) throw new NotFoundError('Order not found');
  const allowed = STAFF_ROLES.has(role)
    || (role === 'customer' && order.customer_id === userId)
    || (role === 'driver' && order.driver_id === userId)
    || (role === 'restaurant' && restaurantId && order.restaurant_id === restaurantId);
  if (!allowed) throw new AuthorizationError('You can only request support for an order assigned to your account');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate', ['customer', 'driver', 'restaurant', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => listSupport(ctx.auth.user, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function listSupport(user: AuthUser, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const service = createServiceClient();
    const ticketId = new URL(req.url).searchParams.get('id');

    if (ticketId) {
      const { data: ticket } = await service.from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
      if (!ticket) throw new NotFoundError('Ticket not found');
      if (ticket.user_id !== user.id && !STAFF_ROLES.has(user.role)) throw new AuthorizationError('Access denied');

      let repliesQuery = service
        .from('support_ticket_replies')
        .select('*, users!support_ticket_replies_user_id_fkey(name, role)')
        .eq('ticket_id', ticketId);
      if (!STAFF_ROLES.has(user.role)) repliesQuery = repliesQuery.eq('is_internal', false);
      const [{ data: replies }, { data: attachments }] = await Promise.all([
        repliesQuery.order('created_at', { ascending: true }),
        service.from('support_ticket_attachments')
          .select('id,original_name,mime_type,byte_size,reply_id,created_at')
          .eq('ticket_id', ticketId)
          .is('deleted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: true }),
      ]);
      return ok({ ticket, replies: replies ?? [], attachments: (attachments ?? []).map((row) => publicAttachment(row as SupportAttachmentRow)) });
    }

    const query = service.from('support_tickets').select('*').order('updated_at', { ascending: false });
    const { data, error } = STAFF_ROLES.has(user.role) ? await query : await query.eq('user_id', user.id);
    if (error) {
      logger.warn('tickets fetch failed', { userId: user.id }, error);
      return ok({ tickets: [] });
    }
    return ok({ tickets: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const { user, role, restaurantId } = await currentUser();
    const service = createServiceClient();
    const ticketIdParam = new URL(req.url).searchParams.get('id');
    const body = await req.json().catch(() => ({}));

    if (ticketIdParam) {
      const message = String(body.message ?? '').trim().slice(0, 5000);
      if (!message) throw new ValidationError('Message is required');
      const { data: ticket } = await service
        .from('support_tickets')
        .select('id,user_id,issue_type,reference_code,status')
        .eq('id', ticketIdParam)
        .maybeSingle();
      if (!ticket) throw new NotFoundError('Ticket not found');
      const isStaff = STAFF_ROLES.has(role);
      if (ticket.user_id !== user.id && !isStaff) throw new AuthorizationError('Access denied');
      if (ticket.status === 'closed' || ticket.status === 'resolved') throw new ValidationError('Resolved tickets cannot receive replies');

      const issueType = isSupportIssueType(ticket.issue_type) ? ticket.issue_type : 'other';
      let attachment: ParsedSupportAttachment | null;
      try {
        attachment = parseSupportAttachment(body.attachment, issueType);
      } catch (error) {
        throw new ValidationError(error instanceof Error ? error.message : 'invalid_attachment');
      }

      const replyId = randomUUID();
      const { data: reply, error: replyError } = await service
        .from('support_ticket_replies')
        .insert({ id: replyId, ticket_id: ticketIdParam, user_id: user.id, message, is_internal: isStaff && body.is_internal === true })
        .select()
        .single();
      if (replyError || !reply) throw new Error('Failed to add reply');

      let storedAttachment = null;
      try {
        if (attachment) storedAttachment = await uploadAttachment(ticketIdParam, replyId, user.id, attachment);
      } catch (error) {
        await service.from('support_ticket_replies').delete().eq('id', replyId);
        throw error;
      }

      const now = new Date().toISOString();
      const updates = isStaff
        ? { status: 'waiting_user', next_action: 'waiting_customer', first_response_at: now, updated_at: now }
        : { status: 'in_progress', next_action: 'waiting_support', updated_at: now };
      if (isStaff) {
        const { data: existing } = await service.from('support_tickets').select('first_response_at').eq('id', ticketIdParam).single();
        if (existing?.first_response_at) delete (updates as { first_response_at?: string }).first_response_at;
      }
      await service.from('support_tickets').update(updates).eq('id', ticketIdParam);
      await audit('SUPPORT_TICKET_REPLIED', { userId: user.id, userRole: role, resource: 'support_ticket', resourceId: ticketIdParam, metadata: { internal: isStaff && body.is_internal === true } });
      return ok({ reply, attachment: storedAttachment });
    }

    const subject = String(body.subject ?? '').trim().slice(0, 200);
    const message = String(body.message ?? '').trim().slice(0, 5000);
    const orderId = typeof body.order_id === 'string' && body.order_id.trim() ? body.order_id.trim().slice(0, 80) : null;
    const issueType: SupportIssueType = isSupportIssueType(body.issue_type) ? body.issue_type : 'other';
    const policy = supportPolicy(issueType);
    if (!subject || !message) throw new ValidationError('Subject and message are required');
    if (policy.requiresOrder && !orderId) throw new ValidationError('This issue type requires a related order');
    if (orderId) await assertOrderAccess(orderId, user.id, role, restaurantId);

    let attachment: ParsedSupportAttachment | null;
    try {
      attachment = parseSupportAttachment(body.attachment, issueType);
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'invalid_attachment');
    }

    const ticketId = randomUUID();
    const createdAt = new Date();
    const ticketRow = {
      id: ticketId,
      reference_code: supportReference(ticketId),
      user_id: user.id,
      user_role: role,
      category: policy.category,
      issue_type: issueType,
      subject,
      message,
      priority: policy.priority,
      order_id: orderId,
      status: 'open',
      next_action: policy.nextAction,
      sla_due_at: supportSlaDueAt(issueType, createdAt),
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
    };
    const { data: ticket, error } = await service.from('support_tickets').insert(ticketRow).select().single();
    if (error || !ticket) throw new Error('Failed to create ticket');

    let storedAttachment = null;
    try {
      if (attachment) storedAttachment = await uploadAttachment(ticketId, null, user.id, attachment);
    } catch (error) {
      await service.from('support_tickets').delete().eq('id', ticketId);
      throw error;
    }

    await audit('SUPPORT_TICKET_CREATED', { userId: user.id, userRole: role, resource: 'support_ticket', resourceId: ticketId, metadata: { issue_type: issueType, reference_code: ticket.reference_code } });
    return ok({ ticket, attachment: storedAttachment });
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const { user, role } = await currentUser();
    if (!STAFF_ROLES.has(role)) throw new AuthorizationError('Support staff access required');
    const ticketId = new URL(req.url).searchParams.get('id');
    if (!ticketId) throw new ValidationError('Ticket id is required');
    const body = await req.json().catch(() => ({}));
    const service = createServiceClient();
    const { data: current } = await service.from('support_tickets').select('id,status').eq('id', ticketId).maybeSingle();
    if (!current) throw new NotFoundError('Ticket not found');

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status != null) {
      const status = String(body.status);
      if (!VALID_STATUSES.has(status)) throw new ValidationError('Invalid status');
      patch.status = status;
      if (status === 'resolved' || status === 'closed') {
        const summary = String(body.resolution_summary ?? '').trim().slice(0, 2000);
        if (!summary) throw new ValidationError('Resolution summary is required');
        patch.resolution_summary = summary;
        patch.resolved_at = new Date().toISOString();
        patch.next_action = 'resolved';
        if (status === 'closed') patch.closed_at = new Date().toISOString();
      }
    }
    if (body.next_action != null && patch.next_action == null) {
      const nextAction = String(body.next_action);
      if (!VALID_NEXT_ACTIONS.has(nextAction)) throw new ValidationError('Invalid next action');
      patch.next_action = nextAction;
    }
    if (body.priority != null) {
      const priority = String(body.priority);
      if (!VALID_PRIORITIES.has(priority)) throw new ValidationError('Invalid priority');
      patch.priority = priority;
    }
    if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to || null;

    const { data: ticket, error } = await service.from('support_tickets').update(patch).eq('id', ticketId).select().single();
    if (error || !ticket) throw new Error('Failed to update ticket');
    await audit('SUPPORT_TICKET_UPDATED', { userId: user.id, userRole: role, resource: 'support_ticket', resourceId: ticketId, metadata: { previous_status: current.status, status: ticket.status, next_action: ticket.next_action } });
    return ok({ ticket });
  });
}
