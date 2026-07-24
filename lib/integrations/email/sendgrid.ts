/**
 * SendGrid Email Provider
 * ───────────────────────
 * Twilio SendGrid v3 API.
 */

import type { EmailProvider, EmailMessage, EmailResult, EmailProviderName } from './types';
import { IntegrationError, readProviderConfig } from '../types';

export class SendGridProvider implements EmailProvider {
  public readonly name: EmailProviderName = 'sendgrid';
  public readonly enabled: boolean;
  private readonly apiKey: string;

  constructor() {
    const cfg = readProviderConfig('SENDGRID');
    this.apiKey = cfg.secret_key;
    this.enabled = cfg.enabled && !!this.apiKey;
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('sendgrid', 'NOT_CONFIGURED', 'SendGrid is not configured', { retryable: false });
    }
  }

  private parseAddress(addr: string): { email: string; name?: string } {
    const match = addr.match(/^(.+?)\s*<(.+?)>$/);
    if (match) return { name: match[1].trim(), email: match[2] };
    return { email: addr };
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    this.requireEnabled();
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    const from = this.parseAddress(message.from);
    const personalizations: any[] = [
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
    const content: any[] = [];
    if (message.text) content.push({ type: 'text/plain', value: message.text });
    if (message.html) content.push({ type: 'text/html', value: message.html });
    if (content.length === 0) content.push({ type: 'text/plain', value: message.subject });

    const body: any = {
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
    });
    if (!res.ok) {
      const err = await res.json();
      throw new IntegrationError('sendgrid', err?.errors?.[0]?.message || 'API_ERROR', 'SendGrid send failed', {
        retryable: res.status >= 500,
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
