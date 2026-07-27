/**
 * Apple Push Notification Service (APNs) Provider
 * ────────────────────────────────────────────────
 * Server-side push via APNs HTTP/2.
 * Requires: key_id, team_id, bundle_id, private key.
 */

import type { PushProvider, PushDevice, PushPayload, PushResult, PushProviderName } from './types';
import { IntegrationError, readProviderConfig } from '../types';

export class APNsProvider implements PushProvider {
  public readonly name: PushProviderName = 'apns';
  public readonly enabled: boolean;
  private readonly keyId: string;
  private readonly teamId: string;
  private readonly bundleId: string;
  private readonly privateKey: string;
  private readonly environment: 'sandbox' | 'production';
  private cachedToken: { token: string; expires: number } | null = null;

  constructor() {
    const cfg = readProviderConfig('APNS');
    this.keyId = process.env.APNS_KEY_ID || '';
    this.teamId = process.env.APNS_TEAM_ID || '';
    this.bundleId = process.env.APNS_BUNDLE_ID || '';
    this.privateKey = process.env.APNS_PRIVATE_KEY || cfg.secret_key;
    this.environment = (cfg.environment as 'sandbox' | 'production') || 'production';
    this.enabled = cfg.enabled && !!this.keyId && !!this.teamId && !!this.bundleId && !!this.privateKey;
  }

  private get host(): string {
    return this.environment === 'sandbox'
      ? 'api.sandbox.push.apple.com'
      : 'api.push.apple.com';
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('apns', 'NOT_CONFIGURED', 'APNs is not configured', { retryable: false });
    }
  }

  private async getAuthToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expires > Date.now() + 60_000) {
      return this.cachedToken.token;
    }
    const crypto = await import('node:crypto');
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: this.keyId };
    const payload = { iss: this.teamId, iat: now };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = headerB64 + '.' + payloadB64;
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    const signature = sign.sign(this.privateKey, 'base64url');
    const token = data + '.' + signature;
    this.cachedToken = { token, expires: Date.now() + 50 * 60 * 1000 };
    return token;
  }

  async registerDevice(device: PushDevice): Promise<void> {
    // No-op
  }

  async unregisterDevice(token: string): Promise<void> {
    // No-op
  }

  async sendToDevice(token: string, payload: PushPayload): Promise<PushResult> {
    this.requireEnabled();
    try {
      const authToken = await this.getAuthToken();
      const aps: Record<string, unknown> = payload.silent
        ? { 'content-available': 1 }
        : {
            alert: { title: payload.title, body: payload.body },
            sound: payload.sound || 'default',
            badge: payload.badge,
            'mutable-content': 1,
          };
      const body: Record<string, unknown> = { aps };
      if (payload.data) Object.assign(body, payload.data);
      const url = 'https://' + this.host + '/3/device/' + token;
      const init: RequestInit = {
        method: 'POST',
        headers: {
          authorization: 'bearer ' + authToken,
          'apns-topic': this.bundleId,
          'apns-priority': payload.silent ? '5' : '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + (payload.ttl || 86400)),
          'apns-collapse-id': payload.collapse_key || '',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      };
      const res = await fetch(url, init);
      if (res.status === 410) {
        return { message_id: '', provider: 'apns', success: false, error: 'Token unregistered', invalid_token: true };
      }
      if (!res.ok) {
        const err = await res.text();
        return { message_id: '', provider: 'apns', success: false, error: err };
      }
      return { message_id: res.headers.get('apns-id') || '', provider: 'apns', success: true };
    } catch (e: any) {
      return { message_id: '', provider: 'apns', success: false, error: e.message };
    }
  }

  async sendToTopic(topic: string, payload: PushPayload): Promise<PushResult> {
    return { message_id: '', provider: 'apns', success: false, error: 'APNs requires device tokens, not topics' };
  }

  async sendToUser(user_id: string, payload: PushPayload, devices: PushDevice[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (const d of devices) {
      if (d.platform !== 'ios') continue;
      const r = await this.sendToDevice(d.token, payload);
      results.push(r);
      if (r.invalid_token) {
        await this.unregisterDevice(d.token);
      }
    }
    return results;
  }

  async subscribeToTopic(token: string, topic: string): Promise<void> {
    // APNs has no native topic subscriptions
  }

  async unsubscribeFromTopic(token: string, topic: string): Promise<void> {
    // No-op
  }

  async healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    if (!this.enabled) return { ok: false, latency_ms: 0, error: 'Not configured' };
    try {
      await this.getAuthToken();
      return { ok: true, latency_ms: 0 };
    } catch (e: any) {
      return { ok: false, latency_ms: 0, error: e.message };
    }
  }
}
