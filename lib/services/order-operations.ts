/**
 * Order Operations Service
 * ────────────────────────
 * Admin and restaurant manual order interventions.
 * All functions include audit logging and proper authorization.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { logAuditEvent } from './audit-service';
import { NotificationService } from './notification-service';

// ─────────────────────────────────────────────────────────────
// Manual order reassignment (admin only)
// ─────────────────────────────────────────────────────────────

export async function reassignOrderToDriver(
  orderId: string,
  driverId: string,
  adminId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const svc = createServiceClient();

    // Verify driver exists and is online
    const { data: driver, error: driverErr } = await svc
      .from('driver_status')
      .select('driver_id, is_online')
      .eq('driver_id', driverId)
      .single();

    if (driverErr || !driver) {
      return { ok: false, error: 'Driver not found' };
    }
    if (!driver.is_online) {
      return { ok: false, error: 'Driver is offline' };
    }

    // Verify order exists
    const { data: order, error: orderErr } = await svc
      .from('orders')
      .select('id, status, restaurant_id, customer_id, driver_id, order_number')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return { ok: false, error: 'Order not found' };
    }

    // Update order
    const { error: updateErr } = await svc
      .from('orders')
      .update({
        driver_id: driverId,
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateErr) {
      logger.error('Failed to reassign order', { orderId, error: updateErr.message });
      return { ok: false, error: 'Failed to reassign order' };
    }

    // Notify driver
    try {
      await NotificationService.send({
        userId: driverId,
        type: 'order',
        title: 'New order assigned',
        body: `Order ${order.order_number} has been assigned to you by admin`,
        data: { order_id: orderId, order_number: order.order_number },
      });
    } catch (e) {
      logger.warn('Failed to notify driver of assignment', {
        orderId,
        driverId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Audit
    await logAuditEvent({
      actorId: adminId,
      action: 'order.reassigned',
      resourceType: 'order',
      resourceId: orderId,
      metadata: { from_driver_id: order.driver_id, to_driver_id: driverId },
    });

    return { ok: true };
  } catch (e) {
    logger.error('reassignOrderToDriver failed', {
      orderId,
      driverId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: 'Internal error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Emergency order cancellation (admin only)
// ─────────────────────────────────────────────────────────────

export async function emergencyCancelOrder(
  orderId: string,
  adminId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  if (!reason || reason.length < 5) {
    return { ok: false, error: 'Reason required (min 5 chars)' };
  }

  try {
    const svc = createServiceClient();

    const { data: order, error: orderErr } = await svc
      .from('orders')
      .select('id, status, customer_id, driver_id, restaurant_id, order_number')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return { ok: false, error: 'Order not found' };
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      return { ok: false, error: `Order already ${order.status}` };
    }

    const { error: updateErr } = await svc
      .from('orders')
      .update({
        status: 'cancelled',
        cancellation_reason: `EMERGENCY: ${reason}`,
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateErr) {
      logger.error('Failed to emergency-cancel order', { orderId, error: updateErr.message });
      return { ok: false, error: 'Failed to cancel order' };
    }

    // Notify customer
    try {
      await NotificationService.send({
        userId: order.customer_id,
        type: 'order_cancelled',
        title: 'Order cancelled',
        body: `Order ${order.order_number} has been cancelled. Reason: ${reason}`,
        data: { order_id: orderId, reason },
      });
    } catch {
      // best-effort
    }

    // Audit
    await logAuditEvent({
      actorId: adminId,
      action: 'order.emergency_cancelled',
      resourceType: 'order',
      resourceId: orderId,
      metadata: { reason, previous_status: order.status },
    });

    return { ok: true };
  } catch (e) {
    logger.error('emergencyCancelOrder failed', {
      orderId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: 'Internal error' };
  }
}
