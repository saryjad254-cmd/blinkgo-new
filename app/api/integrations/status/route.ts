import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { getPaymentRouter } from '@/lib/integrations/payments/router';
import { getPushRouter } from '@/lib/integrations/notifications/router';
import { getEmailRouter } from '@/lib/integrations/email/router';
import { getSMSRouter } from '@/lib/integrations/sms/router';
import { getStorageRouter } from '@/lib/integrations/storage/router';
import { getWebhookDispatcher } from '@/lib/integrations/webhooks/dispatcher';
import { getDeploymentReadiness } from '@/lib/config/deployment-readiness';
import { getWebPushConfiguration } from '@/lib/services/web-push-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const paymentsList = getPaymentRouter().list();
  const nativePushList = getPushRouter().list().filter((provider) => provider.enabled);
  const emailList = getEmailRouter().list();
  const smsList = getSMSRouter().list();
  const storageList = getStorageRouter().list();

  const webhookDispatcher = getWebhookDispatcher();
  const [webhookDeliveries, deadLetters] = await Promise.all([
    webhookDispatcher.listDeliveries(10),
    webhookDispatcher.listDeliveries(10, 'dead_letter'),
  ]);
  const deployment = getDeploymentReadiness();
  const webPush = getWebPushConfiguration();
  const supabaseReady = deployment.items
    .filter((item) => ['supabase_url', 'supabase_anon', 'supabase_service'].includes(item.id))
    .every((item) => item.status === 'ready');
  const pushList = [
    {
      name: 'supabase_realtime',
      enabled: supabaseReady,
      status: supabaseReady ? 'In-app notifications active' : 'Supabase configuration incomplete',
    },
    {
      name: 'web_push_vapid',
      enabled: webPush.configured,
      status: webPush.configured ? 'Background browser push active' : 'Optional VAPID keys not configured',
    },
    // Native mobile providers are optional and only appear when explicitly
    // enabled. BlinkGo's PWA does not require Firebase or APNs.
    ...nativePushList.map((provider) => ({
      ...provider,
      status: 'Optional native mobile channel',
    })),
  ];

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    deployment,
    categories: {
      payments: {
        providers: paymentsList,
        configured: paymentsList.filter((p) => p.enabled).length,
      },
      push: {
        providers: pushList,
        configured: pushList.filter((p) => p.enabled).length,
      },
      email: {
        providers: emailList,
        configured: emailList.filter((p) => p.enabled).length,
      },
      sms: {
        providers: smsList,
        configured: smsList.filter((p) => p.enabled).length,
      },
      storage: {
        providers: storageList,
        configured: storageList.filter((p) => p.enabled).length,
      },
    },
    webhooks: {
      recent_deliveries: webhookDeliveries,
      dead_letter_count: deadLetters.length,
    },
  });
}
