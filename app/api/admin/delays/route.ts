import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ok, withErrorHandling } from '@/lib/api/response';
import { audit } from '@/lib/services/audit-log';
import { logger } from '@/lib/logging';
import { delaySeverity, normalizeDelayReviewPolicy, recommendedDelayCreditCents } from '@/lib/admin/delay-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const POLICY_KEY = 'delivery_delay_review_policy';
const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering', 'on_the_way']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => getDelays() as any,
  )(req)) as unknown as NextResponse;
}

async function getDelays(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const svc = createServiceClient();
    const [policyResult, eventsResult] = await Promise.all([
      svc.from('config').select('value').eq('key', POLICY_KEY).maybeSingle(),
      svc.from('order_tracking_events')
        .select('id, order_id, driver_id, event_type, status, metadata, created_at')
        .in('event_type', ['driver_arrived_pickup', 'driver_picked_up', 'driver_issue_reported', 'driver_arrived_dropoff'])
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    const policy = normalizeDelayReviewPolicy(policyResult.data?.value);
    if (eventsResult.error) logger.warn('Admin delay events fetch failed', { error: eventsResult.error.message });
    const events = eventsResult.data ?? [];
    const orderIds = [...new Set(events.map((event) => String(event.order_id || '')).filter(Boolean))];
    if (!orderIds.length) return ok({ policy, incidents: [], summary: { total: 0, warning: 0, critical: 0, reviewEligible: 0 } });

    const { data: orders, error: ordersError } = await svc.from('orders')
      .select('id, order_number, status, total, restaurant_id, driver_id, customer_id, created_at, updated_at')
      .in('id', orderIds);
    if (ordersError) logger.warn('Admin delay orders fetch failed', { error: ordersError.message });
    const restaurantIds = [...new Set((orders ?? []).map((order) => String(order.restaurant_id || '')).filter(Boolean))];
    const { data: restaurants } = restaurantIds.length
      ? await svc.from('restaurants').select('id, name').in('id', restaurantIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const restaurantNames = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant.name]));

    const incidents = (orders ?? []).map((order) => {
      const orderEvents = events.filter((event) => event.order_id === order.id);
      const issue = orderEvents.find((event) => event.event_type === 'driver_issue_reported') ?? null;
      const arrival = orderEvents.find((event) => event.event_type === 'driver_arrived_pickup') ?? null;
      const pickup = orderEvents.find((event) => event.event_type === 'driver_picked_up') ?? null;
      const issueMetadata = issue?.metadata && typeof issue.metadata === 'object' ? issue.metadata as Record<string, unknown> : {};
      const issueCode = typeof issueMetadata.code === 'string' ? issueMetadata.code : null;
      const waitEnd = pickup?.created_at ? new Date(pickup.created_at).getTime() : Date.now();
      const waitMinutes = arrival?.created_at ? Math.max(0, Math.floor((waitEnd - new Date(arrival.created_at).getTime()) / 60_000)) : 0;
      const severity = delaySeverity(waitMinutes, issueCode, policy);
      return {
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        total: Number(order.total ?? 0),
        restaurant_name: restaurantNames.get(order.restaurant_id) ?? null,
        driver_id: order.driver_id,
        issue_code: issueCode,
        issue_reported_at: issue?.created_at ?? null,
        restaurant_wait_minutes: waitMinutes,
        wait_active: Boolean(arrival && !pickup && ACTIVE_STATUSES.has(String(order.status))),
        severity,
        recommended_credit_cents: recommendedDelayCreditCents(waitMinutes, policy),
        active: ACTIVE_STATUSES.has(String(order.status)),
        updated_at: issue?.created_at ?? order.updated_at ?? order.created_at,
      };
    }).filter((item) => item.issue_code || item.restaurant_wait_minutes >= Math.min(10, policy.reviewAfterMinutes))
      .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || right.restaurant_wait_minutes - left.restaurant_wait_minutes);

    return ok({
      policy,
      incidents,
      summary: {
        total: incidents.length,
        warning: incidents.filter((item) => item.severity === 'warning').length,
        critical: incidents.filter((item) => item.severity === 'critical').length,
        reviewEligible: incidents.filter((item) => item.recommended_credit_cents !== null).length,
      },
    });
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, request) => savePolicy(ctx, request as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function savePolicy(ctx: { auth: { user: { id: string; role: string } } }, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const policy = normalizeDelayReviewPolicy(await req.json().catch(() => ({})));
    const svc = createServiceClient();
    const { error } = await svc.from('config').upsert({
      key: POLICY_KEY,
      value: policy,
      description: 'Admin review thresholds and credit recommendation ceiling for delayed deliveries. Never issues credit automatically.',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (error) throw new Error('Failed to save delay review policy');
    await audit('ADMIN_CONFIG_CHANGED', { severity: 'warn', userId: ctx.auth.user.id, userRole: ctx.auth.user.role, resource: 'config', resourceId: POLICY_KEY, metadata: { policy } });
    return ok({ policy, updated: true });
  });
}

function severityRank(value: string): number {
  return value === 'critical' ? 2 : value === 'warning' ? 1 : 0;
}
