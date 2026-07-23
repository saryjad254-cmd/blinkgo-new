/**
 * Push Notification Provider Types
 * ─────────────────────────────────
 */

export type PushProviderName = 'fcm' | 'apns';

export interface PushDevice {
  token: string;
  platform: 'ios' | 'android' | 'web';
  user_id?: string;
  app_version?: string;
  locale?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  image?: string;
  badge?: number;
  sound?: string;
  // Silent push (data-only, no UI)
  silent?: boolean;
  // TTL in seconds
  ttl?: number;
  // Scheduled for future delivery (ISO timestamp)
  schedule_at?: string;
  // Collapse key for Android (groups similar notifications)
  collapse_key?: string;
}

export interface PushResult {
  message_id: string;
  provider: PushProviderName;
  success: boolean;
  error?: string;
  invalid_token?: boolean;
}

export interface PushProvider {
  readonly name: PushProviderName;
  readonly enabled: boolean;

  /**
   * Register or update a device token.
   */
  registerDevice(device: PushDevice): Promise<void>;

  /**
   * Remove a device token.
   */
  unregisterDevice(token: string): Promise<void>;

  /**
   * Send to a single device.
   */
  sendToDevice(token: string, payload: PushPayload): Promise<PushResult>;

  /**
   * Send to a topic (broadcast to all subscribers).
   */
  sendToTopic(topic: string, payload: PushPayload): Promise<PushResult>;

  /**
   * Send to a user (all their registered devices).
   */
  sendToUser(user_id: string, payload: PushPayload, devices: PushDevice[]): Promise<PushResult[]>;

  /**
   * Subscribe device to topic.
   */
  subscribeToTopic(token: string, topic: string): Promise<void>;

  /**
   * Unsubscribe device from topic.
   */
  unsubscribeFromTopic(token: string, topic: string): Promise<void>;

  /**
   * Health check.
   */
  healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }>;
}
