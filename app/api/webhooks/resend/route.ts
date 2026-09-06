import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/service';
import { assertEmailAddress } from '@/lib/integrations/email/safety';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 256 * 1024;
const SUPPRESSION_EVENTS = new Map([
  ['email.bounced', 'bounced'],
  ['email.complained', 'complained'],
  ['email.suppressed', 'suppressed'],
  ['email.failed', 'failed'],
] as const);

function recipientHash(email: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(assertEmailAddress(email)).digest('hex');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET || '';
  const apiKey = process.env.RESEND_API_KEY || '';
  if (!webhookSecret || !apiKey) {
    return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 503 });
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }
  const payload = await request.text();
  if (Buffer.byteLength(payload) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }

  const eventId = request.headers.get('svix-id') || '';
  const timestamp = request.headers.get('svix-timestamp') || '';
  const signature = request.headers.get('svix-signature') || '';
  if (!eventId || !timestamp || !signature) {
    return NextResponse.json({ ok: false, error: 'Missing signature headers' }, { status: 400 });
  }

  let event: ReturnType<Resend['webhooks']['verify']>;
  try {
    event = new Resend(apiKey).webhooks.verify({
      payload,
      headers: { id: eventId, timestamp, signature },
      webhookSecret,
    });
  } catch {
    logger.warn('resend.webhook.signature_invalid', { event_id: eventId });
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  if (!event.type.startsWith('email.') || !('to' in event.data) || !('email_id' in event.data)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const emailData = event.data as { to: string[]; email_id: string };
  const recipientHashes = emailData.to.map((email) => recipientHash(email, webhookSecret));
  const db = createServiceClient();
  const { error: eventError } = await db.from('email_delivery_events').upsert({
    provider_event_id: eventId,
    provider_email_id: emailData.email_id,
    event_type: event.type,
    recipient_hashes: recipientHashes,
    provider_created_at: event.created_at,
    received_at: new Date().toISOString(),
  }, { onConflict: 'provider_event_id', ignoreDuplicates: true });
  if (eventError) {
    logger.error('resend.webhook.persist_failed', { event_id: eventId, error_code: eventError.code });
    return NextResponse.json({ ok: false, error: 'Persistence failed' }, { status: 500 });
  }

  const suppressionReason = SUPPRESSION_EVENTS.get(event.type as 'email.bounced' | 'email.complained' | 'email.suppressed' | 'email.failed');
  if (suppressionReason && recipientHashes.length > 0) {
    const now = new Date().toISOString();
    const { error: suppressionError } = await db.from('email_suppressions').upsert(
      recipientHashes.map((hash) => ({
        recipient_hash: hash,
        reason: suppressionReason,
        provider_email_id: emailData.email_id,
        updated_at: now,
      })),
      { onConflict: 'recipient_hash' },
    );
    if (suppressionError) {
      logger.error('resend.webhook.suppression_failed', { event_id: eventId, error_code: suppressionError.code });
      return NextResponse.json({ ok: false, error: 'Suppression persistence failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
