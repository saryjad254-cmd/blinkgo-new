/**
 * SMS Router
 * ──────────
 * Routes SMS to configured provider. Falls back to dev (logging) if no real provider.
 */

import type { SMSProvider, SMSMessage, SMSResult, SMSProviderName } from './types';
import { TwilioProvider } from './twilio';
import { DevSMSProvider } from './dev';
import { IntegrationError } from '../types';

export class SMSRouter {
  private providers: Map<SMSProviderName, SMSProvider> = new Map();

  constructor() {
    this.providers.set('twilio', new TwilioProvider());
    this.providers.set('sms_dev', new DevSMSProvider());
  }

  private getDefault(): SMSProvider {
    const priority: SMSProviderName[] = ['twilio', 'vonage', 'messagebird', 'sms_dev'];
    for (const name of priority) {
      const p = this.providers.get(name);
      if (p?.enabled) return p;
    }
    // Last resort: dev mode is always available
    return this.providers.get('sms_dev')!;
  }

  list() {
    return Array.from(this.providers.entries()).map(([name, p]) => ({ name, enabled: p.enabled }));
  }

  async send(message: SMSMessage): Promise<SMSResult> {
    const provider = this.getDefault();
    return provider.send(message);
  }

  /**
   * High-priority verification code SMS.
   */
  async sendVerificationCode(to: string, code: string): Promise<SMSResult> {
    return this.send({
      to,
      body: `Your BlinkGo verification code is: ${code}. Valid for 10 minutes.`,
      tags: { type: 'verification' },
    });
  }

  /**
   * Order update SMS.
   */
  async sendOrderUpdate(to: string, orderId: string, message: string): Promise<SMSResult> {
    return this.send({
      to,
      body: `[BlinkGo ${orderId}] ${message}`,
      order_id: orderId,
      tags: { type: 'order_update', order_id: orderId },
    });
  }

  /**
   * Emergency alert - highest priority, retries aggressively.
   */
  async sendEmergencyAlert(to: string, message: string): Promise<SMSResult> {
    return this.send({
      to,
      body: `[URGENT] ${message}`,
      emergency: true,
      tags: { type: 'emergency' },
    });
  }
}

let _router: SMSRouter | null = null;
export function getSMSRouter(): SMSRouter {
  if (!_router) _router = new SMSRouter();
  return _router;
}
