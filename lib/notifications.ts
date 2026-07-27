/**
 * Notifications — multi-recipient helper
 * ───────────────────────────────────────
 * Use `createNotification()` to notify a single user.
 * Use `notifyOrderEvent()` to notify all parties (customer/driver/restaurant) in one call.
 *
 * For most new code, prefer the higher-level NotificationService in
 * lib/services/notification-service.ts which adds validation and
 * structured logging.
 */

import { createServiceClient } from '@/lib/supabase/service';

export type NotificationType =
  | 'order_accepted'
  | 'driver_arrived'
  | 'picked_up'
  | 'nearby'
  | 'delivered'
  | 'new_order'
  | 'order_cancelled'
  | 'address_changed';

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  order_id?: string;
}

function mapNotificationType(type: NotificationType): 'order' | 'driver' {
  if (type.startsWith('driver_')) return 'driver';
  return 'order';
}

export async function createNotification(input: CreateNotificationInput): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('notifications').insert({
    user_id: input.user_id,
    type: mapNotificationType(input.type),
    title: input.title,
    body: input.message,
    data: {
      subtype: input.type,
      order_id: input.order_id,
    },
  });
  return !error;
}

export async function notifyOrderEvent(
  order: { id: string; customer_id: string; driver_id?: string | null; restaurant_id: string },
  type: NotificationType,
  titles: { customer?: string; driver?: string; restaurant?: string },
  messages: { customer?: string; driver?: string; restaurant?: string }
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (titles.customer && messages.customer) {
    tasks.push(createNotification({
      user_id: order.customer_id,
      type,
      title: titles.customer,
      message: messages.customer,
      order_id: order.id,
    }));
  }
  if (titles.driver && messages.driver && order.driver_id) {
    tasks.push(createNotification({
      user_id: order.driver_id,
      type,
      title: titles.driver,
      message: messages.driver,
      order_id: order.id,
    }));
  }
  if (titles.restaurant && messages.restaurant) {
    const supabase = createServiceClient();
    const { data: rest } = await supabase.from('restaurants').select('owner_id').eq('id', order.restaurant_id).single();
    if (rest?.owner_id) {
      tasks.push(createNotification({
        user_id: rest.owner_id,
        type,
        title: titles.restaurant,
        message: messages.restaurant,
        order_id: order.id,
      }));
    }
  }

  await Promise.all(tasks);
}

// Re-export the higher-level service for convenience
export { NotificationService, type SendNotificationInput } from './services/notification-service';
