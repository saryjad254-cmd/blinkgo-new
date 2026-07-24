/**
 * Push Notification Router
 * ────────────────────────
 * Routes push notifications to FCM (Android/Web) or APNs (iOS).
 * Includes a retry queue for failed deliveries.
 */

import type { PushProvider, PushDevice, PushPayload, PushResult, PushProviderName } from './types';
import { FCMProvider } from './fcm';
import { APNsProvider } from './apns';
import { IntegrationError, computeRetryDelay, DEFAULT_RETRY_POLICY, RetryPolicy } from '../types';

interface QueuedNotification {
  id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  payload: PushPayload;
  attempts: number;
  next_attempt_at: number;
  last_error?: string;
  created_at: string;
}

export class PushRouter {
  private providers: Map<PushProviderName, PushProvider> = new Map();
  private retryQueue: QueuedNotification[] = [];
  private maxQueueSize = 10000;
  private retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY;

  constructor() {
    this.providers.set('fcm', new FCMProvider());
    this.providers.set('apns', new APNsProvider());
  }

  get(name: PushProviderName): PushProvider | null {
    const p = this.providers.get(name);
    if (!p || !p.enabled) return null;
    return p;
  }

  /**
   * Route to correct provider based on device platform.
   */
  private providerFor(platform: 'ios' | 'android' | 'web'): PushProvider {
    if (platform === 'ios') {
      const p = this.get('apns');
      if (p) return p;
    }
    const fcm = this.get('fcm');
    if (fcm) return fcm;
    throw new IntegrationError('push', 'NO_PROVIDER', 'No push provider enabled', { retryable: false });
  }

  async sendToDevice(device: PushDevice, payload: PushPayload): Promise<PushResult> {
    const provider = this.providerFor(device.platform);
    const result = await provider.sendToDevice(device.token, payload);
    if (!result.success && !result.invalid_token && this.isRetryable(result.error)) {
      this.enqueueRetry(device, payload, result.error);
    }
    return result;
  }

  async sendToUser(user_id: string, payload: PushPayload, devices: PushDevice[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (const d of devices) {
      const r = await this.sendToDevice(d, payload);
      results.push(r);
    }
    return results;
  }

  async sendToTopic(topic: string, payload: PushPayload): Promise<PushResult> {
    // Use FCM for topics (Android)
    const fcm = this.get('fcm');
    if (fcm) return fcm.sendToTopic(topic, payload);
    throw new IntegrationError('push', 'NO_PROVIDER', 'No push provider supports topics', { retryable: false });
  }

  list(): { name: PushProviderName; enabled: boolean }[] {
    return Array.from(this.providers.entries()).map(([name, p]) => ({ name, enabled: p.enabled }));
  }

  /**
   * Enqueue a failed delivery for retry.
   */
  private enqueueRetry(device: PushDevice, payload: PushPayload, error?: string): void {
    if (this.retryQueue.length >= this.maxQueueSize) {
      this.retryQueue.shift(); // drop oldest
    }
    this.retryQueue.push({
      id: crypto.randomUUID(),
      token: device.token,
      platform: device.platform,
      payload,
      attempts: 0,
      next_attempt_at: Date.now() + computeRetryDelay(0, this.retryPolicy),
      last_error: error,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Process retry queue. Call this from a cron job.
   */
  async processRetryQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const now = Date.now();
    const toProcess = this.retryQueue.filter((q) => q.next_attempt_at <= now);
    let succeeded = 0;
    let failed = 0;
    for (const q of toProcess) {
      q.attempts += 1;
      if (q.attempts > this.retryPolicy.maxAttempts) {
        // Dead-letter - remove
        this.retryQueue = this.retryQueue.filter((x) => x.id !== q.id);
        failed += 1;
        continue;
      }
      try {
        const provider = this.providerFor(q.platform);
        const result = await provider.sendToDevice(q.token, q.payload);
        if (result.success) {
          this.retryQueue = this.retryQueue.filter((x) => x.id !== q.id);
          succeeded += 1;
        } else if (result.invalid_token || !this.isRetryable(result.error)) {
          this.retryQueue = this.retryQueue.filter((x) => x.id !== q.id);
          failed += 1;
        } else {
          q.next_attempt_at = Date.now() + computeRetryDelay(q.attempts, this.retryPolicy);
          q.last_error = result.error;
        }
      } catch {
        q.next_attempt_at = Date.now() + computeRetryDelay(q.attempts, this.retryPolicy);
      }
    }
    return { processed: toProcess.length, succeeded, failed };
  }

  getQueueSize(): number {
    return this.retryQueue.length;
  }

  private isRetryable(error?: string): boolean {
    if (!error) return true;
    const lower = error.toLowerCase();
    if (lower.includes('invalid') || lower.includes('not found') || lower.includes('unauthorized')) return false;
    return true;
  }
}

let _router: PushRouter | null = null;
export function getPushRouter(): PushRouter {
  if (!_router) _router = new PushRouter();
  return _router;
}
