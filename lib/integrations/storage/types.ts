/**
 * Storage Provider Types
 * ──────────────────────
 * Unified storage abstraction.
 */

export type StorageProviderName = 'supabase' | 's3' | 'r2';

export interface UploadInput {
  path: string; // e.g., "restaurants/abc/menu/pizza.jpg"
  content: Buffer | string; // buffer or base64
  contentType?: string;
  metadata?: Record<string, string>;
  // Public access
  public?: boolean;
  // For image optimization
  optimize?: boolean;
  // Max dimensions for image optimization
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface UploadResult {
  path: string;
  url: string; // public or signed URL
  size: number;
  content_type: string;
  provider: StorageProviderName;
  public: boolean;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  expiresIn: number; // seconds
  download?: boolean;
  contentType?: string;
}

export interface StorageProvider {
  readonly name: StorageProviderName;
  readonly enabled: boolean;
  upload(input: UploadInput): Promise<UploadResult>;
  getPublicUrl(path: string): Promise<string>;
  getSignedUrl(path: string, options: SignedUrlOptions): Promise<string>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<{ path: string; size: number; updated_at: string }[]>;
  healthCheck(): Promise<{ ok: boolean; latency_ms: number; error?: string }>;
}
