import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import {
  canReportDriverIssue,
  driverIssuePriority,
  isDriverIssueCode,
  shouldEscalateDriverIssue,
  shouldNotifyCustomerAboutIssue,
} from '@/lib/driver/issue-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  return (await withSecurity(
    secureRoute('moderate', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, request) => reportIssue(ctx, request as NextRequest, id) as any,
  )(req)) as unknown as NextResponse;
}

async function reportIssue(
  ctx: { auth: { user: { id: string; role: string } } },
  req: NextRequest,
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const body = await req.json().catch(() => null);
    if (!isDriverIssueCode(body?.code)) throw new ValidationError('Invalid driver issue code');
    const code = body.code;
    const details = typeof body.details === 'string' ? body.details.trim().slice(0, 500) : '';
    if (code === 'unsafe_situation' && details.length < 5) {
      throw new ValidationError('Please briefly describe the unsafe situation');
    }

    const svc = createServiceClient();
    const { data: order, error: orderError } = await svc
      .from('orders')
      .select('id, order_number, status, driver_id, customer_id')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError || !order) throw new NotFoundError('Order');
    if (order.driver_id !== ctx.auth.user.id && !['admin', 'super_admin', 'manager'].includes(ctx.auth.user.role)) {
      throw new AuthorizationError('You are not the assigned driver');
    }
    if (!canReportDriverIssue(code, String(order.status))) {
      throw new ConflictError(`This issue is not valid in status: ${order.status}`, {
        code: 'INVALID_DRIVER_ISSUE_STAGE', current_status: order.status,
      });
    }

    const { data: recentEvents } = await svc
      .from('order_tracking_events')
      .select('id, created_at, metadata')
      .eq('order_id', orderId)
      .eq('event_type', 'driver_issue_reported')
      .order('created_at', { ascending: false })
      .limit(20);
    const duplicate = (recentEvents ?? []).find((event) => {
      const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata as Record<string, unknown> : {};
      return metadata.code === code && Date.now() - new Date(event.created_at).getTime() < DEDUPE_WINDOW_MS;
    });
    if (duplicate) return ok({ report: duplicate, code, duplicate: true, escalated: false });

    const priority = driverIssuePriority(code);
    const now = new Date().toISOString();
    const { data: report, error: reportError } = await svc.from('order_tracking_events').insert({
      order_id: orderId,
      driver_id: order.driver_id,
      event_type: 'driver_issue_reported',
      status: order.status,
      metadata: { code, details: details || null, priority, source: 'driver_cockpit' },
      created_at: now,
    }).select('id, created_at, event_type, metadata').single();
    if (reportError || !report) throw new Error('Failed to record driver issue');

    let ticket: { id: string } | null = null;
    if (shouldEscalateDriverIssue(code)) {
      const { data, error } = await svc.from('support_tickets').insert({
        user_id: order.driver_id,
        user_role: 'driver',
        category: 'order_issue',
        subject: `Driver issue: ${code}`,
        message: details || `Driver reported ${code} for order #${order.order_number || order.id}.`,
        priority,
        order_id: orderId,
        status: 'open',
        created_at: now,
        updated_at: now,
      }).select('id').single();
      if (error) logger.warn('Driver issue escalation failed', { orderId, code, error: error.message });
      else ticket = data;
    }

    if (order.customer_id && shouldNotifyCustomerAboutIssue(code)) {
      const { error } = await svc.from('notifications').insert({
        user_id: order.customer_id,
        type: 'order_delayed',
        title: 'Update zu Ihrer Lieferung',
        body: customerNotificationBody(code, order.order_number),
        data: { order_id: orderId, order_number: order.order_number, issue_code: code },
        is_read: false,
      });
      if (error) logger.warn('Driver issue customer notification failed', { orderId, code, error: error.message });
    }

    await audit('DRIVER_REPORTED_ISSUE', {
      severity: priority === 'urgent' ? 'critical' : priority === 'high' ? 'warn' : 'info',
      userId: ctx.auth.user.id,
      userRole: ctx.auth.user.role,
      resource: 'order',
      resourceId: orderId,
      metadata: { code, priority, escalated: Boolean(ticket) },
    });

    return ok({ report, code, duplicate: false, escalated: Boolean(ticket), ticket_id: ticket?.id ?? null });
  });
}

function customerNotificationBody(code: string, orderNumber: string | null): string {
  const reference = orderNumber ? ` #${orderNumber}` : '';
  if (code === 'restaurant_delay' || code === 'order_not_ready') return `Bestellung${reference} benötigt im Restaurant etwas mehr Zeit. Die Live-Anzeige bleibt aktuell.`;
  if (code === 'customer_unreachable') return `Der Fahrer von Bestellung${reference} versucht Sie zu erreichen. Bitte prüfen Sie Ihr Telefon.`;
  return `Für Bestellung${reference} gibt es eine wichtige Lieferaktualisierung. BlinkGo Support wurde informiert.`;
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
