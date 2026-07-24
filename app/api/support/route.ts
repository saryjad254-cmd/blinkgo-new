/**
 * Support Tickets API
 * ───────────────────
 * GET  /api/support          - List user's tickets
 * POST /api/support          - Create new ticket
 * GET  /api/support?id=X     - Get ticket detail
 * POST /api/support?id=X     - Reply to ticket
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, ValidationError, NotFoundError, AuthorizationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = ['order_issue', 'payment', 'account', 'technical', 'feature_request', 'other'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const url = new URL(req.url);
    const ticketId = url.searchParams.get('id');

    const supabase = createServerClient();

    // Get single ticket with replies
    if (ticketId) {
      const { data: ticket, error: tErr } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (tErr || !ticket) throw new NotFoundError('Ticket not found');
      if (ticket.user_id !== user.id) {
        // Check admin
        const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
          throw new AuthorizationError('Access denied');
        }
      }

      const { data: replies } = await supabase
        .from('support_ticket_replies')
        .select('*, users!support_ticket_replies_user_id_fkey(name, role)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      return ok({ ticket, replies: replies ?? [] });
    }

    // List user's tickets
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      logger.warn('tickets fetch failed', { userId: user.id }, error);
      return ok({ tickets: [] });
    }
    return ok({ tickets: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const url = new URL(req.url);
    const ticketId = url.searchParams.get('id');
    const body = await req.json().catch(() => ({}));

    const supabase = createServerClient();

    // Reply to existing ticket
    if (ticketId) {
      const message = String(body.message ?? '').trim();
      if (!message) throw new ValidationError('Message is required');

      // Verify access
      const { data: ticket } = await supabase
        .from('support_tickets')
        .select('user_id')
        .eq('id', ticketId)
        .single();

      if (!ticket) throw new NotFoundError('Ticket not found');

      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
      const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role);
      if (ticket.user_id !== user.id && !isAdmin) {
        throw new AuthorizationError('Access denied');
      }

      const { data: reply, error: rErr } = await supabase
        .from('support_ticket_replies')
        .insert({
          ticket_id: ticketId,
          user_id: user.id,
          message,
          is_internal: isAdmin && body.is_internal === true,
        })
        .select()
        .single();

      if (rErr || !reply) {
        logger.error('reply creation failed', { ticketId }, rErr);
        throw new Error('Failed to add reply');
      }

      // Update ticket status and timestamp
      const newStatus = isAdmin ? 'waiting_user' : 'in_progress';
      await supabase
        .from('support_tickets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', ticketId);

      return ok({ reply });
    }

    // Create new ticket
    const category = String(body.category ?? 'other');
    const subject = String(body.subject ?? '').trim().slice(0, 200);
    const message = String(body.message ?? '').trim().slice(0, 5000);
    const priority = String(body.priority ?? 'normal');
    const orderId = typeof body.order_id === 'string' ? body.order_id : null;

    if (!VALID_CATEGORIES.includes(category)) throw new ValidationError('Invalid category');
    if (!VALID_PRIORITIES.includes(priority)) throw new ValidationError('Invalid priority');
    if (!subject || !message) throw new ValidationError('Subject and message are required');

    // Get user role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        user_role: (profile?.role as any) ?? 'customer',
        category,
        subject,
        message,
        priority,
        order_id: orderId,
        status: 'open',
      })
      .select()
      .single();

    if (error || !ticket) {
      logger.error('ticket creation failed', { userId: user.id }, error);
      throw new Error('Failed to create ticket');
    }

    return ok({ ticket });
  });
}
