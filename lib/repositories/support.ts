/**
 * Support Repository
 * ─────────────────
 * Canonical data access for the `support_tickets` and `support_messages` tables.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { NotFoundError } from '@/lib/foundation';

export interface SupportTicketRow {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assigned_to: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string | null;
  closed_at: string | null;
}

const COLUMNS = 'id, user_id, subject, category, priority, status, assigned_to, order_id, created_at, updated_at, closed_at';

export async function findById(id: string): Promise<SupportTicketRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from('support_tickets').select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'support.findById' },
  );
  if (error) throw error;
  return data as SupportTicketRow | null;
}

export interface ListTicketsOptions {
  userId?: string;
  status?: SupportTicketRow['status'];
  assignedTo?: string;
  pagination?: Pagination;
}

export async function listTickets(opts: ListTicketsOptions = {}): Promise<PaginatedResult<SupportTicketRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<SupportTicketRow>(svc.from('support_tickets'), { label: 'support.listTickets' });
  q.select(COLUMNS, { count: 'exact' });
  if (opts.userId) q.eq('user_id', opts.userId);
  if (opts.status) q.eq('status', opts.status);
  if (opts.assignedTo) q.eq('assigned_to', opts.assignedTo);
  q.orderBy('created_at', 'desc');
  if (opts.pagination) q.paginate(opts.pagination);
  else q.limit(50);
  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

export async function createTicket(input: Partial<SupportTicketRow>): Promise<SupportTicketRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('support_tickets')
        .insert({
          ...input,
          status: input.status ?? 'open',
          priority: input.priority ?? 'normal',
          created_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single(),
    { label: 'support.createTicket' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Support ticket');
  return data as SupportTicketRow;
}

export async function updateTicketStatus(id: string, status: SupportTicketRow['status']): Promise<SupportTicketRow> {
  const svc = createServiceClient();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'closed' || status === 'resolved') patch.closed_at = new Date().toISOString();
  const { data, error } = await dbCall(
    () => svc.from('support_tickets').update(patch).eq('id', id).select(COLUMNS).single(),
    { label: 'support.updateTicketStatus' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Support ticket');
  return data as SupportTicketRow;
}

export interface SupportMessageRow {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  attachments: unknown[] | null;
  created_at: string;
}

export async function listMessages(ticketId: string): Promise<SupportMessageRow[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('support_messages')
        .select('id, ticket_id, user_id, message, attachments, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true }),
    { label: 'support.listMessages' },
  );
  if (error) throw error;
  return (data ?? []) as SupportMessageRow[];
}

export async function addMessage(ticketId: string, userId: string, message: string, attachments: unknown[] = []): Promise<SupportMessageRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('support_messages')
        .insert({
          ticket_id: ticketId,
          user_id: userId,
          message,
          attachments,
          created_at: new Date().toISOString(),
        })
        .select('id, ticket_id, user_id, message, attachments, created_at')
        .single(),
    { label: 'support.addMessage' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Support message');
  return data as SupportMessageRow;
}
