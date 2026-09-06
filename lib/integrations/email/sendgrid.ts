/**
 * SendGrid Email Provider
 * ───────────────────────
 * Twilio SendGrid v3 API.
 */

import type { EmailProvider, EmailMessage, EmailResult, EmailProviderName } from './types';
import { IntegrationError, readProviderConfig } from '../types';
import { assertEmailAddress, assertEmailAddresses } from './safety';
import { rejectSuppressedRecipients } from './suppression';

type SendGridAddress = { email: string; name?: string };
type SendGridPersonalization = { to: SendGridAddress[]; subject: string; cc?: SendGridAddress[]; bcc?: SendGridAddress[] };

export class SendGridProvider implements EmailProvider {
  public readonly name: EmailProviderName = 'sendgrid';
  public readonly enabled: boolean;
  private readonly apiKey: string;

  constructor() {
    const cfg = readProviderConfig('SENDGRID');
    this.apiKey = process.env.SENDGRID_API_KEY || String(cfg.secret_key || '');
    this.enabled = Boolean(this.apiKey);
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('sendgrid', 'NOT_CONFIGURED', 'SendGrid is not configured', { retryable: false });
    }
  }

  private parseAddress(addr: string): { email: string; name?: string } {
    const match = addr.match(/^(.+?)\s*<(.+?)>$/);
    if (match) return { name: match[1].trim(), email: assertEmailAddress(match[2]) };
    return { email: assertEmailAddress(addr) };
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    this.requireEnabled();
    const recipients = assertEmailAddresses(message.to);
    await rejectSuppressedRecipients(recipients);
    const from = this.parseAddress(message.from);
    const personalizations: SendGridPersonalization[] = [
      {
        to: recipients.map((r) => this.parseAddress(r)),
        subject: message.subject,
      },
    ];
    if (message.cc) {
      personalizations[0].cc = (Array.isArray(message.cc) ? message.cc : [message.cc]).map((r) => this.parseAddress(r));
    }
    if (message.bcc) {
      personalizations[0].bcc = (Array.isArray(message.bcc) ? message.bcc : [message.bcc]).map((r) => this.parseAddress(r));
    }
    const content: Array<{ type: string; value: string }> = [];
    if (message.text) content.push({ type: 'text/plain', value: message.text });
    if (message.html) content.push({ type: 'text/html', value: message.html });
    if (content.length === 0) content.push({ type: 'text/plain', value: message.subject });

    const body: Record<string, unknown> = {
      personalizations,
      from,
      content,
      reply_to: message.reply_to ? this.parseAddress(message.reply_to) : undefined,
    };
    if (message.attachments) {
      body.attachments = message.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        type: a.type,
        disposition: a.disposition,
        content_id: a.content_id,
      }));
    }
    if (message.schedule_at) {
      body.send_at = Math.floor(new Date(message.schedule_at).getTime() / 1000);
    }
    if (message.tags) {
      body.categories = Object.values(message.tags);
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = await res.json() as { errors?: Array<{ message?: string }> };
      throw new IntegrationError('sendgrid', err.errors?.[0]?.message || 'API_ERROR', 'SendGrid send failed', {
        retryable: res.status === 408 || res.status === 429 || res.status >= 500,
      });
    }
    return {
      id: res.headers.get('x-message-id') || crypto.randomUUID(),
      provider: 'sendgrid',
      success: true,
      accepted: recipients,
      rejected: [],
    };
  }

  async healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    if (!this.enabled) return { ok: false, latency_ms: 0, error: 'Not configured' };
    return { ok: true, latency_ms: 0 };
  }
}
