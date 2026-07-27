/**
 * SMS Provider Types
 * ──────────────────
 */

export type SMSProviderName = 'twilio' | 'vonage' | 'messagebird' | 'sms_dev';

export interface SMSMessage {
  to: string; // E.164 format e.g. +491234567890
  body: string;
  from?: string;
  // For verification codes
  verification_code?: string;
  // For order updates
  order_id?: string;
  // For emergency alerts (high priority)
  emergency?: boolean;
  // Tags for analytics
  tags?: Record<string, string>;
}

export interface SMSResult {
  id: string;
  provider: SMSProviderName;
  success: boolean;
  to: string;
  error?: string;
  cost?: number; // in cents
  segments?: number;
}

export interface SMSProvider {
  readonly name: SMSProviderName;
  readonly enabled: boolean;
  send(message: SMSMessage): Promise<SMSResult>;
  healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }>;
}
