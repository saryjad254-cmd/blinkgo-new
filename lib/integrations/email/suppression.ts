import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { IntegrationError } from '@/lib/integrations/types';

function hashRecipient(email: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(email).digest('hex');
}

export async function rejectSuppressedRecipients(recipients: string[]): Promise<void> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return;

  const hashes = recipients.map((email) => hashRecipient(email, secret));
  const { data, error } = await createServiceClient()
    .from('email_suppressions')
    .select('recipient_hash')
    .in('recipient_hash', hashes)
    .limit(1);

  if (error) {
    throw new IntegrationError('email', 'SUPPRESSION_CHECK_FAILED', 'Email suppression check failed', {
      retryable: true,
    });
  }
  if (data && data.length > 0) {
    throw new IntegrationError('email', 'RECIPIENT_SUPPRESSED', 'Recipient is suppressed', {
      retryable: false,
    });
  }
}
