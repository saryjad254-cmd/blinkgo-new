/**
 * Admin: Manual Order Assignment
 * ───────────────────────────────
 * POST /api/admin/orders/[id]/assign
 * Body: { driver_id: string }
 *
 * Manually assign a driver to an order (override auto-dispatch).
 * Admin-only operation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { assertCanReadOrder } from '@/lib/api/ownership';
import { audit } from '@/lib/services/audit-log';
import { AuthorizationError, ValidationError, NotFoundError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => assignDriver(r as NextRequest, ctx, params.id) as any,
  )(req)) as unknown as NextResponse;
}

async function assignDriver(
  req: NextRequest,
  ctx: { auth: { user: { id: string; role: string } } },
  orderId: string,
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin', 'manager']);
    if (!user) throw new AuthorizationError('Admin access required');

    // Verify the order exists (ownership helper throws 404 if not)
    await assertCanReadOrder(ctx.auth.user, orderId);

    const body = await req.json().catch(() => ({}));
    const driverId = String(body.driver_id ?? '');
    if (!driverId) throw new ValidationError('driver_id is required');

    const svc = createServiceClient();
    const { data: driver, error: driverErr } = await svc
      .from('driver_status')
      .select('is_online, last_location_lat, last_location_lng')
      .eq('driver_id', driverId)
      .single();

    if (driverErr || !driver) {
      throw new NotFoundError('Driver not found or not registered');
    }
    if (!driver.is_online) {
      throw new ValidationError('Driver is offline and cannot accept orders');
    }

    // v82 BLOCKER fix: collapse the SELECT-then-UPDATE pattern into a
    // single atomic UPDATE with a WHERE clause that enforces both the
    // valid state AND the not-yet-assigned precondition. Two admins
    // clicking "Assign" at the same time can no longer both win — the
    // second update returns zero rows and gets a clean 409.
    const { data: updated, error: updateErr } = await svc
      .from('orders')
      .update({
        driver_id: driverId,
        accepted_at: new Date().toISOString(),
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .is('driver_id', null)
      .in('status', ['pending', 'confirmed'])
      .select('id, status, driver_id, order_number')
      .maybeSingle();

    if (updateErr) {
      logger.error('Manual order assign failed', { orderId, driverId }, updateErr);
      throw new Error('Failed to assign driver');
    }
    if (!updated) {
      // Either order doesn't exist, or it was already assigned by someone
      // else, or it has progressed past the assignable state. Re-read once
      // to give the admin a useful error message.
      const { data: current } = await svc
        .from('orders')
        .select('id, status, driver_id')
        .eq('id', orderId)
        .maybeSingle();
      if (!current) throw new NotFoundError('Order not found');
      if (current.driver_id && current.driver_id !== driverId) {
        throw new ConflictError('Order is already assigned to a different driver', {
          current_driver_id: current.driver_id,
        });
      }
      if (current.driver_id === driverId) {
        // Idempotent re-click: driver was already assigned. Return success.
        return ok({ assigned: true, driver_id: driverId, idempotent: true });
      }
      throw new ValidationError(`Cannot assign order in status: ${current.status}`);
    }

    try {
      await svc.from('notifications').insert({
        user_id: driverId,
        type: 'order_assigned',
        title: 'Neue Bestellung zugewiesen',
        body: `Bestellung #${updated.id.slice(0, 8)} wurde dir manuell zugewiesen`,
        data: { order_id: updated.id, order_number: updated.order_number, assigned_by_admin: true },
      });
    } catch (e) {
      logger.warn('Failed to notify driver of manual assignment', { orderId, driverId, error: (e as Error).message });
    }

    await audit('ADMIN_CONFIG_CHANGED', {
      severity: 'warn',
      userId: user.id,
      userRole: user.role,
      resource: 'order',
      resourceId: orderId,
      metadata: { action: 'manual_assign', driver_id: driverId },
    });

    return ok({ assigned: true, driver_id: driverId });
  });
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
