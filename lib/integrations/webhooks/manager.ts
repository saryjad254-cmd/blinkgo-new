/**
 * Webhook Manager
 * ───────────────
 * Manages webhook configurations and event subscription.
 * Stores configs in DB.
 */

import { createServiceClient } from '@/lib/supabase/service';
import type { WebhookConfig } from './dispatcher';

export interface StoredWebhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export class WebhookManager {
  async list(): Promise<StoredWebhook[]> {
    try {
      const db = createServiceClient();
      const { data, error } = await db.from('webhooks').select('*').order('created_at', { ascending: false });
      if (error || !data) return [];
      return data as StoredWebhook[];
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<StoredWebhook | null> {
    try {
      const db = createServiceClient();
      const { data } = await db.from('webhooks').select('*').eq('id', id).single();
      return (data as StoredWebhook) || null;
    } catch {
      return null;
    }
  }

  async create(input: Omit<StoredWebhook, 'id' | 'created_at' | 'updated_at'>): Promise<StoredWebhook | null> {
    try {
      const db = createServiceClient();
      const { data, error } = await db.from('webhooks').insert(input).select().single();
      if (error) return null;
      return data as StoredWebhook;
    } catch {
      return null;
    }
  }

  async update(id: string, updates: Partial<StoredWebhook>): Promise<boolean> {
    try {
      const db = createServiceClient();
      const { error } = await db.from('webhooks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const db = createServiceClient();
      const { error } = await db.from('webhooks').delete().eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Test a webhook by sending a test event.
   */
  async test(id: string): Promise<{ success: boolean; status_code?: number; error?: string }> {
    const wh = await this.get(id);
    if (!wh) return { success: false, error: 'Webhook not found' };
    const { getWebhookDispatcher } = await import('./dispatcher');
    const dispatcher = getWebhookDispatcher();
    const result = await dispatcher.send(
      {
        url: wh.url,
        secret: wh.secret,
        events: wh.events,
        enabled: true,
      },
      'test.ping',
      { message: 'Test webhook from BlinkGo', timestamp: new Date().toISOString() }
    );
    return { success: result.success, status_code: result.status_code, error: result.error };
  }
}

let _manager: WebhookManager | null = null;
export function getWebhookManager(): WebhookManager {
  if (!_manager) _manager = new WebhookManager();
  return _manager;
}
