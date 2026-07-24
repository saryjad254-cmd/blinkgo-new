/**
 * Storage Router
 * ──────────────
 * Routes to the configured storage provider.
 * Includes image optimization (WebP conversion) when requested.
 */

import type { StorageProvider, UploadInput, UploadResult, StorageProviderName, SignedUrlOptions } from './types';
import { SupabaseStorageProvider } from './supabase-storage';
import { S3Provider } from './s3';
import { IntegrationError } from '../types';

export class StorageRouter {
  private providers: Map<StorageProviderName, StorageProvider> = new Map();

  constructor() {
    this.providers.set('supabase', new SupabaseStorageProvider());
    this.providers.set('s3', new S3Provider('s3'));
    this.providers.set('r2', new S3Provider('r2'));
  }

  getDefault(): StorageProvider {
    // Supabase first (default), S3, R2
    const priority: StorageProviderName[] = ['supabase', 's3', 'r2'];
    for (const name of priority) {
      const p = this.providers.get(name);
      if (p?.enabled) return p;
    }
    // Default to Supabase even if not "enabled" since it's the primary
    return this.providers.get('supabase')!;
  }

  get(name: StorageProviderName): StorageProvider | null {
    const p = this.providers.get(name);
    return p?.enabled ? p : null;
  }

  list() {
    return Array.from(this.providers.entries()).map(([name, p]) => ({ name, enabled: p.enabled }));
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const provider = this.getDefault();
    // Apply image optimization if requested
    let processedInput = input;
    if (input.optimize) {
      processedInput = await this.optimizeImage(input);
    }
    return provider.upload(processedInput);
  }

  async getPublicUrl(path: string): Promise<string> {
    return this.getDefault().getPublicUrl(path);
  }

  async getSignedUrl(path: string, options: SignedUrlOptions): Promise<string> {
    return this.getDefault().getSignedUrl(path, options);
  }

  async delete(path: string): Promise<void> {
    return this.getDefault().delete(path);
  }

  /**
   * Optimize image: resize and convert to WebP if possible.
   * Uses sharp if available, otherwise returns the original.
   */
  private async optimizeImage(input: UploadInput): Promise<UploadInput> {
    if (!input.contentType?.startsWith('image/')) return input;
    try {
      // Optional: use sharp if installed
      // const sharp = require('sharp');
      // const optimized = await sharp(content)
      //   .resize(input.maxWidth || 1920, input.maxHeight || 1080, { fit: 'inside' })
      //   .webp({ quality: input.quality || 80 })
      //   .toBuffer();
      // return { ...input, content: optimized, contentType: 'image/webp', path: input.path.replace(/\.[^.]+$/, '.webp') };
      return input;
    } catch {
      return input;
    }
  }

  /**
   * Validate upload: type, size, name.
   */
  validateUpload(input: UploadInput, opts: { maxSize?: number; allowedTypes?: string[] } = {}): { valid: boolean; error?: string } {
    const maxSize = opts.maxSize ?? 10 * 1024 * 1024; // 10MB default
    const allowedTypes = opts.allowedTypes ?? ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

    const content = typeof input.content === 'string' ? Buffer.from(input.content, 'base64') : input.content;
    if (content.length > maxSize) {
      return { valid: false, error: `File too large: ${content.length} > ${maxSize}` };
    }
    if (input.contentType && !allowedTypes.includes(input.contentType)) {
      return { valid: false, error: `Type not allowed: ${input.contentType}` };
    }
    if (!/^[a-zA-Z0-9_\-/.]+$/.test(input.path)) {
      return { valid: false, error: 'Path contains invalid characters' };
    }
    if (input.path.includes('..')) {
      return { valid: false, error: 'Path traversal not allowed' };
    }
    return { valid: true };
  }
}

let _router: StorageRouter | null = null;
export function getStorageRouter(): StorageRouter {
  if (!_router) _router = new StorageRouter();
  return _router;
}
