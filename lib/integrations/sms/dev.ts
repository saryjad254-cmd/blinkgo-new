/**
 * Dev SMS Provider
 * ────────────────
 * Logs messages to console for development. No actual sending.
 */

import type { SMSProvider, SMSMessage, SMSResult, SMSProviderName } from './types';
import { IntegrationError, readProviderConfig } from '../types';

export class DevSMSProvider implements SMSProvider {
  public readonly name: SMSProviderName = 'sms_dev';
  public readonly enabled: boolean;

  constructor() {
    const cfg = readProviderConfig('SMS');
    // Always enabled if no real provider is configured
    this.enabled = cfg.enabled;
  }

  async send(message: SMSMessage): Promise<SMSResult> {
    if (!this.enabled) {
      throw new IntegrationError('sms_dev', 'NOT_CONFIGURED', 'Dev SMS disabled', { retryable: false });
    }
    console.log('[SMS DEV]', { to: message.to, body: message.body, code: message.verification_code });
    return {
      id: crypto.randomUUID(),
      provider: 'sms_dev',
      success: true,
      to: message.to,
      segments: Math.ceil(message.body.length / 160),
    };
  }

  async healthCheck() {
    return { ok: this.enabled, latency_ms: 0 };
  }
}
