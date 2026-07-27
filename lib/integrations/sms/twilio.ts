/**
 * Twilio SMS Provider
 * ───────────────────
 * World's most popular SMS API.
 */

import type { SMSProvider, SMSMessage, SMSResult, SMSProviderName } from './types';
import { IntegrationError, readProviderConfig } from '../types';

export class TwilioProvider implements SMSProvider {
  public readonly name: SMSProviderName = 'twilio';
  public readonly enabled: boolean;
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor() {
    const cfg = readProviderConfig('TWILIO');
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || cfg.public_key;
    this.authToken = cfg.secret_key;
    this.fromNumber = process.env.TWILIO_FROM || '';
    this.enabled = cfg.enabled && !!this.accountSid && !!this.authToken && !!this.fromNumber;
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('twilio', 'NOT_CONFIGURED', 'Twilio is not configured', { retryable: false });
    }
  }

  async send(message: SMSMessage): Promise<SMSResult> {
    this.requireEnabled();
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', message.to);
    params.append('From', message.from || this.fromNumber);
    params.append('Body', message.body);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new IntegrationError('twilio', data.code?.toString() || 'API_ERROR', data.message || 'Twilio send failed', {
        retryable: res.status >= 500,
      });
    }
    return {
      id: data.sid,
      provider: 'twilio',
      success: true,
      to: message.to,
      cost: data.price ? Math.abs(parseInt(data.price, 10) * 100) : undefined,
      segments: data.num_segments ? parseInt(data.num_segments, 10) : undefined,
    };
  }

  async healthCheck() {
    if (!this.enabled) return { ok: false, latency_ms: 0, error: 'Not configured' };
    return { ok: true, latency_ms: 0 };
  }
}
