/**
 * Resend Email Provider
 * ─────────────────────
 * Modern email API. https://resend.com
 */

import type { EmailProvider, EmailMessage, EmailResult, EmailProviderName } from './types';
import { IntegrationError, readProviderConfig } from '../types';

export class ResendProvider implements EmailProvider {
  public readonly name: EmailProviderName = 'resend';
  public readonly enabled: boolean;
  private readonly apiKey: string;

  constructor() {
    const cfg = readProviderConfig('RESEND');
    this.apiKey = cfg.secret_key;
    this.enabled = cfg.enabled && !!this.apiKey;
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('resend', 'NOT_CONFIGURED', 'Resend is not configured', { retryable: false });
    }
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    this.requireEnabled();
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    const body: any = {
      from: message.from,
      to: recipients,
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: message.reply_to,
      tags: Object.entries(message.tags || {}).map(([name, value]) => ({ name, value })),
    };
    if (message.cc) body.cc = Array.isArray(message.cc) ? message.cc : [message.cc];
    if (message.bcc) body.bcc = Array.isArray(message.bcc) ? message.bcc : [message.bcc];
    if (message.attachments) body.attachments = message.attachments;
    if (message.schedule_at) body.scheduled_at = message.schedule_at;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('resend', data.statusCode?.toString() || 'API_ERROR', data.message || 'Resend send failed', {
        retryable: res.status >= 500,
      });
    }
    return {
      id: data.id,
      provider: 'resend',
      success: true,
      accepted: recipients,
      rejected: [],
    };
  }

  async healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    if (!this.enabled) return { ok: false, latency_ms: 0, error: 'Not configured' };
    const start = Date.now();
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return { ok: res.ok, latency_ms: Date.now() - start };
    } catch (e: any) {
      return { ok: false, latency_ms: Date.now() - start, error: e.message };
    }
  }
}
