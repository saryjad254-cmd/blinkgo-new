/**
 * Firebase Cloud Messaging (FCM) Provider
 * ───────────────────────────────────────
 * Server-side push via FCM HTTP v1 API.
 * Requires service account credentials.
 */

import type { PushProvider, PushDevice, PushPayload, PushResult, PushProviderName } from './types';
import { IntegrationError, readProviderConfig } from '../types';
import {
  createGoogleServiceAccountAssertion,
  type GoogleServiceAccountCredentials,
} from './provider-jwt';

const FCM_API_BASE = 'https://fcm.googleapis.com/v1';

function isServiceAccount(value: unknown): value is GoogleServiceAccountCredentials {
  if (!value || typeof value !== 'object') return false;
  const account = value as Record<string, unknown>;
  return typeof account.client_email === 'string'
    && account.client_email.length > 0
    && typeof account.private_key === 'string'
    && account.private_key.includes('BEGIN PRIVATE KEY');
}

function parseServiceAccount(raw: string): GoogleServiceAccountCredentials {
  const candidates = [raw];
  try {
    candidates.push(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    // The raw value may already be JSON.
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isServiceAccount(parsed)) return parsed;
    } catch {
      // Try the next supported representation.
    }
  }

  throw new IntegrationError(
    'fcm',
    'INVALID_SA_KEY',
    'Service account credentials are invalid or incomplete',
    { retryable: false },
  );
}

export class FCMProvider implements PushProvider {
  public readonly name: PushProviderName = 'fcm';
  public readonly enabled: boolean;
  private readonly projectId: string;
  private readonly serviceAccountKey: string;
  private cachedToken: { token: string; expires: number } | null = null;

  constructor() {
    const cfg = readProviderConfig('FCM');
    this.projectId = process.env.FCM_PROJECT_ID || '';
    this.serviceAccountKey = process.env.FCM_SERVICE_ACCOUNT_KEY || cfg.secret_key;
    this.enabled = cfg.enabled && !!this.projectId && !!this.serviceAccountKey;
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new IntegrationError('fcm', 'NOT_CONFIGURED', 'FCM is not configured', { retryable: false });
    }
  }

  /** Get an OAuth2 access token via a standards-compliant service-account JWT. */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expires > Date.now() + 60_000) {
      return this.cachedToken.token;
    }
    if (!this.serviceAccountKey) {
      throw new IntegrationError('fcm', 'NO_SA_KEY', 'Service account key missing', { retryable: false });
    }
    const serviceAccount = parseServiceAccount(this.serviceAccountKey);
    const assertion = createGoogleServiceAccountAssertion(serviceAccount);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new IntegrationError('fcm', 'AUTH_FAILED', `FCM authentication failed (${res.status})`, { retryable: true });
    }
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') {
      throw new IntegrationError('fcm', 'INVALID_AUTH_RESPONSE', 'FCM authentication returned an invalid response', { retryable: true });
    }
    const tokenData = data as Record<string, unknown>;
    if (typeof tokenData.access_token !== 'string' || typeof tokenData.expires_in !== 'number') {
      throw new IntegrationError('fcm', 'INVALID_AUTH_RESPONSE', 'FCM authentication response is incomplete', { retryable: true });
    }
    this.cachedToken = {
      token: tokenData.access_token,
      expires: Date.now() + tokenData.expires_in * 1000,
    };
    return tokenData.access_token;
  }

  async registerDevice(device: PushDevice): Promise<void> {
    // FCM doesn't require explicit device registration server-side;
    // the mobile app handles token generation and sends it to our API.
    // This is a no-op that can be extended to store tokens in DB.
  }

  async unregisterDevice(token: string): Promise<void> {
    // Same as above - app handles unregistration
  }

  async sendToDevice(token: string, payload: PushPayload): Promise<PushResult> {
    this.requireEnabled();
    try {
      const accessToken = await this.getAccessToken();
      const body: any = payload.silent
        ? { data: this.dataOnlyPayload(payload) }
        : {
            notification: {
              title: payload.title,
              body: payload.body,
              image: payload.image,
            },
            data: payload.data,
            android: {
              priority: payload.silent ? 'NORMAL' : 'HIGH',
              ttl: `${payload.ttl || 86400}s`,
              collapse_key: payload.collapse_key,
              notification: {
                sound: payload.sound || 'default',
                click_action: payload.data?.click_action,
              },
            },
          };
      const res = await fetch(`${FCM_API_BASE}/projects/${this.projectId}/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: { token, ...body },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        const invalidToken = err?.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED');
        return {
          message_id: '',
          provider: 'fcm',
          success: false,
          error: err?.error?.message || 'FCM send failed',
          invalid_token: invalidToken,
        };
      }
      const data = await res.json();
      return { message_id: data.name, provider: 'fcm', success: true };
    } catch (e: any) {
      return { message_id: '', provider: 'fcm', success: false, error: e.message };
    }
  }

  async sendToTopic(topic: string, payload: PushPayload): Promise<PushResult> {
    this.requireEnabled();
    try {
      const accessToken = await this.getAccessToken();
      const body: any = payload.silent
        ? { data: this.dataOnlyPayload(payload), topic }
        : {
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: payload.data,
            android: {
              priority: 'HIGH',
              ttl: `${payload.ttl || 86400}s`,
            },
            topic,
          };
      const res = await fetch(`${FCM_API_BASE}/projects/${this.projectId}/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: body }),
      });
      if (!res.ok) {
        const err = await res.json();
        return { message_id: '', provider: 'fcm', success: false, error: err?.error?.message || 'FCM topic failed' };
      }
      const data = await res.json();
      return { message_id: data.name, provider: 'fcm', success: true };
    } catch (e: any) {
      return { message_id: '', provider: 'fcm', success: false, error: e.message };
    }
  }

  async sendToUser(user_id: string, payload: PushPayload, devices: PushDevice[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (const d of devices) {
      const r = await this.sendToDevice(d.token, payload);
      results.push(r);
      if (r.invalid_token) {
        // Auto-cleanup
        await this.unregisterDevice(d.token);
      }
    }
    return results;
  }

  async subscribeToTopic(token: string, topic: string): Promise<void> {
    this.requireEnabled();
    const accessToken = await this.getAccessToken();
    const res = await fetch(`${FCM_API_BASE}/projects/${this.projectId}/subscriptions:batchCreate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topic, tokens: [token] }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new IntegrationError('fcm', 'SUBSCRIBE_FAILED', err?.error?.message || 'FCM subscribe failed', { retryable: true });
    }
  }

  async unsubscribeFromTopic(token: string, topic: string): Promise<void> {
    this.requireEnabled();
    const accessToken = await this.getAccessToken();
    await fetch(`${FCM_API_BASE}/projects/${this.projectId}/subscriptions:batchDelete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topic, tokens: [token] }),
    });
  }

  async healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    if (!this.enabled) return { ok: false, latency_ms: 0, error: 'Not configured' };
    try {
      await this.getAccessToken();
      return { ok: true, latency_ms: 0 };
    } catch (e: any) {
      return { ok: false, latency_ms: 0, error: e.message };
    }
  }

  private dataOnlyPayload(payload: PushPayload): Record<string, string> {
    const out: Record<string, string> = {};
    if (payload.data) Object.assign(out, payload.data);
    out.title = payload.title;
    out.body = payload.body;
    return out;
  }
}
