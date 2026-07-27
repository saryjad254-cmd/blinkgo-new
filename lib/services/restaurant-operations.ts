/**
 * Restaurant Operations Service
 * ──────────────────────────────
 * Admin controls for restaurant availability and configuration.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { logAuditEvent } from './audit-service';

export async function setRestaurantPaused(
  restaurantId: string,
  paused: boolean,
  adminId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const svc = createServiceClient();

    const { data: restaurant, error: restErr } = await svc
      .from('restaurants')
      .select('id, name, is_paused')
      .eq('id', restaurantId)
      .single();

    if (restErr || !restaurant) {
      return { ok: false, error: 'Restaurant not found' };
    }

    const { error: updateErr } = await svc
      .from('restaurants')
      .update({
        is_paused: paused,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurantId);

    if (updateErr) {
      logger.error('Failed to update restaurant pause state', {
        restaurantId,
        error: updateErr.message,
      });
      return { ok: false, error: 'Failed to update restaurant' };
    }

    await logAuditEvent({
      actorId: adminId,
      action: paused ? 'restaurant.paused' : 'restaurant.unpaused',
      resourceType: 'restaurant',
      resourceId: restaurantId,
      metadata: { restaurant_name: restaurant.name, previous_state: restaurant.is_paused },
    });

    return { ok: true };
  } catch (e) {
    logger.error('setRestaurantPaused failed', {
      restaurantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: 'Internal error' };
  }
}
