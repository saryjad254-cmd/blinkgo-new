/**
 * Email Provider Types
 * ────────────────────
 */

export type EmailProviderName = 'resend' | 'sendgrid';

export interface EmailMessage {
  from: string; // email or "Name <email>"
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  attachments?: EmailAttachment[];
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
  // Template ID (if provider supports templates)
  template_id?: string;
  template_data?: Record<string, any>;
  // Scheduling (ISO timestamp)
  schedule_at?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64
  type?: string; // MIME type
  disposition?: 'attachment' | 'inline';
  content_id?: string;
}

export interface EmailResult {
  id: string;
  provider: EmailProviderName;
  success: boolean;
  error?: string;
  accepted: string[]; // recipients accepted
  rejected: string[];
}

export interface EmailProvider {
  readonly name: EmailProviderName;
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<EmailResult>;
  healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }>;
}
