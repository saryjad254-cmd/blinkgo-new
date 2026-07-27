/**
 * Supabase Storage Provider
 * ─────────────────────────
 */

import type { StorageProvider, UploadInput, UploadResult, StorageProviderName, SignedUrlOptions } from './types';
import { IntegrationError, readProviderConfig } from '../types';
import { createServiceClient } from '@/lib/supabase/service';

export class SupabaseStorageProvider implements StorageProvider {
  public readonly name: StorageProviderName = 'supabase';
  public readonly enabled: boolean;
  private readonly bucket: string;

  constructor() {
    const cfg = readProviderConfig('SUPABASE');
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'public';
    this.enabled = cfg.enabled !== false; // default on
  }

  private requireEnabled() {
    if (!this.enabled) {
      throw new IntegrationError('supabase_storage', 'NOT_CONFIGURED', 'Supabase storage disabled', { retryable: false });
    }
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    this.requireEnabled();
    const db = createServiceClient();
    const content = typeof input.content === 'string'
      ? Buffer.from(input.content, 'base64')
      : input.content;
    const { data, error } = await db.storage.from(this.bucket).upload(input.path, content, {
      contentType: input.contentType,
      upsert: true,
      metadata: input.metadata,
    });
    if (error) {
      throw new IntegrationError('supabase_storage', 'UPLOAD_FAILED', error.message, { retryable: true });
    }
    const { data: pub } = db.storage.from(this.bucket).getPublicUrl(input.path);
    return {
      path: data.path,
      url: pub.publicUrl,
      size: content.length,
      content_type: input.contentType || 'application/octet-stream',
      provider: 'supabase',
      public: input.public ?? true,
    };
  }

  async getPublicUrl(path: string): Promise<string> {
    const db = createServiceClient();
    const { data } = db.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async getSignedUrl(path: string, options: SignedUrlOptions): Promise<string> {
    const db = createServiceClient();
    const { data, error } = await db.storage.from(this.bucket).createSignedUrl(path, options.expiresIn);
    if (error || !data) {
      throw new IntegrationError('supabase_storage', 'SIGNED_URL_FAILED', error?.message || 'Failed to sign', { retryable: false });
    }
    return data.signedUrl;
  }

  async delete(path: string): Promise<void> {
    const db = createServiceClient();
    await db.storage.from(this.bucket).remove([path]);
  }

  async list(prefix: string): Promise<{ path: string; size: number; updated_at: string }[]> {
    const db = createServiceClient();
    const { data, error } = await db.storage.from(this.bucket).list(prefix);
    if (error) return [];
    return (data || []).map((d) => ({
      path: `${prefix}/${d.name}`,
      size: d.metadata?.size || 0,
      updated_at: d.updated_at || "",
    }));
  }

  async healthCheck() {
    return { ok: this.enabled, latency_ms: 0 };
  }
}
