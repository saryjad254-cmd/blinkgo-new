import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { getPaymentRouter } from '@/lib/integrations/payments/router';
import { getPushRouter } from '@/lib/integrations/notifications/router';
import { getEmailRouter } from '@/lib/integrations/email/router';
import { getSMSRouter } from '@/lib/integrations/sms/router';
import { getStorageRouter } from '@/lib/integrations/storage/router';
import { getWebhookDispatcher } from '@/lib/integrations/webhooks/dispatcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const paymentsList = getPaymentRouter().list();
  const pushList = getPushRouter().list();
  const emailList = getEmailRouter().list();
  const smsList = getSMSRouter().list();
  const storageList = getStorageRouter().list();

  const webhookDeliveries = getWebhookDispatcher().getDeliveries(10);
  const deadLetters = getWebhookDispatcher().getDeadLetter(10);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
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
