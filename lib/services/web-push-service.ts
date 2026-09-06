import webPush, { WebPushError, type PushSubscription } from 'web-push';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { validateWebhookUrl } from '@/lib/security/outbound-url';

type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export interface WebPushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  notificationId?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export interface WebPushDeliveryResult {
  configured: boolean;
  attempted: number;
  delivered: number;
  failed: number;
  expiredRemoved: number;
}

export function getWebPushConfiguration() {
  const publicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY ?? '').trim();
  const subject = String(process.env.VAPID_SUBJECT ?? '').trim();
  const subjectValid = subject.startsWith('mailto:') || subject.startsWith('https://');
  return {
    configured: publicKey.length >= 40 && privateKey.length >= 20 && subjectValid,
    publicKey,
    privateKey,
    subject,
  };
}

function notificationUrl(data?: Record<string, unknown>): string {
  if (typeof data?.url === 'string' && data.url.startsWith('/')) return data.url;
  const orderId = typeof data?.order_id === 'string' ? data.order_id : null;
  return orderId ? `/orders/${orderId}` : '/notifications';
}

function errorStatus(error: unknown): number | null {
  if (error instanceof WebPushError) return error.statusCode;
  if (typeof error === 'object' && error && 'statusCode' in error) {
    const status = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

export async function sendWebPushToUser(
  userId: string,
  message: WebPushMessage,
): Promise<WebPushDeliveryResult> {
  const config = getWebPushConfiguration();
  const empty = { configured: config.configured, attempted: 0, delivered: 0, failed: 0, expiredRemoved: 0 };
  if (!config.configured) return empty;

  const service = createServiceClient();
  const { data, error } = await service
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(20);
  if (error) {
    logger.warn('Web push subscriptions could not be loaded', { userId, code: error.code });
    return empty;
  }

  const subscriptions = (data ?? []) as PushRow[];
  if (!subscriptions.length) return empty;
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    icon: '/brand/blinkgo-app-icon-192-v2.png',
    badge: '/brand/blinkgo-notification-badge-96-v2.png',
    tag: message.tag ?? (message.notificationId ? `blinkgo-${message.notificationId}` : 'blinkgo-notification'),
    requireInteraction: message.requireInteraction ?? false,
    data: { ...(message.data ?? {}), url: notificationUrl(message.data) },
  });

  const result: WebPushDeliveryResult = { ...empty, attempted: subscriptions.length };
  await Promise.all(subscriptions.map(async (row) => {
    try {
      const subscription: PushSubscription = {
        // Validate again immediately before the outbound request. Subscription
        // endpoints are user-controlled and must never become an SSRF primitive.
        endpoint: await validateWebhookUrl(row.endpoint),
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      await webPush.sendNotification(subscription, payload, {
        TTL: 5 * 60,
        timeout: 7_000,
        urgency: 'high',
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
      });
      result.delivered += 1;
      await service.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
      if (message.notificationId) {
        await service.from('notification_delivery_log').insert({
          notification_id: message.notificationId,
          channel: 'web_push',
          success: true,
        });
      }
    } catch (error) {
      result.failed += 1;
      const status = errorStatus(error);
      if (status === 404 || status === 410) {
        result.expiredRemoved += 1;
        await service.from('push_subscriptions').delete().eq('id', row.id).eq('user_id', userId);
      } else {
        logger.warn('Web push delivery failed', { userId, subscriptionId: row.id, status });
      }
      if (message.notificationId) {
        await service.from('notification_delivery_log').insert({
          notification_id: message.notificationId,
          channel: 'web_push',
          success: false,
          error: status ? `HTTP ${status}` : 'Push delivery failed',
        });
      }
    }
  }));
  return result;
}

export async function sendWebPushToUsers(
  userIds: string[],
  message: Omit<WebPushMessage, 'notificationId'>,
): Promise<WebPushDeliveryResult> {
  const total: WebPushDeliveryResult = {
    configured: getWebPushConfiguration().configured,
    attempted: 0,
    delivered: 0,
    failed: 0,
    expiredRemoved: 0,
  };
  if (!total.configured || userIds.length === 0) return total;

  // Keep outbound fan-out bounded. This prevents an administrator broadcast
  // from opening an unbounded number of sockets in one serverless instance.
  for (let index = 0; index < userIds.length; index += 10) {
    const batch = await Promise.all(
      userIds.slice(index, index + 10).map((userId) => sendWebPushToUser(userId, message)),
    );
    for (const result of batch) {
      total.attempted += result.attempted;
      total.delivered += result.delivered;
      total.failed += result.failed;
      total.expiredRemoved += result.expiredRemoved;
    }
  }
  return total;
}
