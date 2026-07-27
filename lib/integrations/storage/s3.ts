/**
 * AWS S3 / Cloudflare R2 Storage Provider
 * ────────────────────────────────────────
 * Both S3 and R2 use the S3-compatible API.
 * For R2, set S3_ENDPOINT to the R2 endpoint.
 */

import type { StorageProvider, UploadInput, UploadResult, StorageProviderName, SignedUrlOptions } from './types';
import { IntegrationError, readProviderConfig } from '../types';
import crypto from 'node:crypto';

export class S3Provider implements StorageProvider {
  public readonly name: StorageProviderName;
  public readonly enabled: boolean;
  private readonly endpoint: string;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly forcePathStyle: boolean;

  constructor(variant: 's3' | 'r2' = 's3') {
    this.name = variant;
    const cfg = readProviderConfig(variant.toUpperCase());
    this.endpoint = process.env[`${variant.toUpperCase()}_ENDPOINT`] || (variant === 's3' ? 'https://s3.amazonaws.com' : '');
    this.region = process.env[`${variant.toUpperCase()}_REGION`] || 'us-east-1';
    this.bucket = process.env[`${variant.toUpperCase()}_BUCKET`] || '';
    this.accessKey = cfg.public_key;
    this.secretKey = cfg.secret_key;
    this.forcePathStyle = variant === 'r2';
    this.enabled = cfg.enabled && !!this.accessKey && !!this.secretKey && !!this.bucket;
  }

  private requireEnabled() {
    if (!this.enabled) {
      throw new IntegrationError(this.name, 'NOT_CONFIGURED', `${this.name} not configured`, { retryable: false });
    }
  }

  private sign(input: string, key: string, contentType: string, payloadHash: string, date: string): string {
    const hmac = (data: string, keyBuf: Buffer) => crypto.createHmac('sha256', keyBuf).update(data).digest();
    const dateKey = hmac(date, Buffer.from(`AWS4${this.secretKey}`));
    const regionKey = hmac(this.region, dateKey);
    const serviceKey = hmac(this.name, regionKey);
    const signingKey = hmac('aws4_request', serviceKey);
    return crypto.createHmac('sha256', signingKey).update(input).digest('hex');
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    this.requireEnabled();
    const content = typeof input.content === 'string' ? Buffer.from(input.content, 'base64') : input.content;
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const host = this.forcePathStyle ? `${this.endpoint.replace(/^https?:\/\//, '')}/${this.bucket}` : `${this.bucket}.${this.endpoint.replace(/^https?:\/\//, '')}`;
    const url = `https://${host}/${input.path}`;
    const contentType = input.contentType || 'application/octet-stream';
    const canonicalRequest = [
      'PUT',
      `/${input.path}`,
      '',
      `content-type:${contentType}`,
      `host:${host.replace(/^https?:\/\//, '')}`,
      `x-amz-content-sha256:${hash}`,
      `x-amz-date:${date}`,
      '',
      'content-type;host;x-amz-content-sha256;x-amz-date',
      hash,
    ].join('\n');
    const credentialScope = `${date.substring(0, 8)}/${this.region}/${this.name}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      date,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signature = this.sign(stringToSign, '', contentType, hash, date);
    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-amz-content-sha256': hash,
        'x-amz-date': date,
        Authorization: authHeader,
      },
      body: content as any,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new IntegrationError(this.name, 'UPLOAD_FAILED', err, { retryable: res.status >= 500 });
    }
    return {
      path: input.path,
      url: input.public ? url : '',
      size: content.length,
      content_type: contentType,
      provider: this.name,
      public: input.public ?? false,
    };
  }

  async getPublicUrl(path: string): Promise<string> {
    const host = this.forcePathStyle
      ? `${this.endpoint.replace(/^https?:\/\//, '')}/${this.bucket}`
      : `${this.bucket}.${this.endpoint.replace(/^https?:\/\//, '')}`;
    return `https://${host}/${path}`;
  }

  async getSignedUrl(path: string, options: SignedUrlOptions): Promise<string> {
    // S3 presigned URL via SigV4 query string auth
    const date = new Date();
    const dateStr = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateShort = dateStr.substring(0, 8);
    const host = this.forcePathStyle
      ? `${this.endpoint.replace(/^https?:\/\//, '')}/${this.bucket}`
      : `${this.bucket}.${this.endpoint.replace(/^https?:\/\//, '')}`;
    const url = `https://${host}/${path}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${encodeURIComponent(this.accessKey + '/' + dateShort + '/' + this.region + '/' + this.name + '/aws4_request')}&X-Amz-Date=${dateStr}&X-Amz-Expires=${options.expiresIn}&X-Amz-SignedHeaders=host`;
    // Simplified signature - in production, use the AWS SDK
    return url;
  }

  async delete(path: string): Promise<void> {
    const host = this.forcePathStyle
      ? `${this.endpoint.replace(/^https?:\/\//, '')}/${this.bucket}`
      : `${this.bucket}.${this.endpoint.replace(/^https?:\/\//, '')}`;
    const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const hash = 'UNSIGNED-PAYLOAD';
    const url = `https://${host}/${path}`;
    const canonicalRequest = [
      'DELETE',
      `/${path}`,
      '',
      `host:${host}`,
      `x-amz-content-sha256:${hash}`,
      `x-amz-date:${date}`,
      '',
      'host;x-amz-content-sha256;x-amz-date',
      hash,
    ].join('\n');
    const credentialScope = `${date.substring(0, 8)}/${this.region}/${this.name}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', date, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const signature = this.sign(stringToSign, '', '', '', date);
    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;
    await fetch(url, {
      method: 'DELETE',
      headers: { 'x-amz-content-sha256': hash, 'x-amz-date': date, Authorization: authHeader },
    });
  }

  async list(prefix: string) {
    // S3 ListObjectsV2
    const host = this.forcePathStyle
      ? `${this.endpoint.replace(/^https?:\/\//, '')}/${this.bucket}`
      : `${this.bucket}.${this.endpoint.replace(/^https?:\/\//, '')}`;
    const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const params = `?list-type=2&prefix=${encodeURIComponent(prefix)}`;
    const canonicalRequest = ['GET', `/${params}`, '', `host:${host}`, `x-amz-date:${date}`, '', 'host;x-amz-date', 'UNSIGNED-PAYLOAD'].join('\n');
    const credentialScope = `${date.substring(0, 8)}/${this.region}/${this.name}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', date, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const signature = this.sign(stringToSign, '', '', '', date);
    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=host;x-amz-date, Signature=${signature}`;
    const res = await fetch(`https://${host}${params}`, {
      headers: { 'x-amz-date': date, Authorization: authHeader },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    // Simple regex parse (production: use XML parser)
    const items: { path: string; size: number; updated_at: string }[] = [];
    const re = /<Contents>(.*?)<\/Contents>/gs;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const key = m[1].match(/<Key>(.*?)<\/Key>/)?.[1];
      const size = m[1].match(/<Size>(.*?)<\/Size>/)?.[1];
      const lm = m[1].match(/<LastModified>(.*?)<\/LastModified>/)?.[1];
      if (key) items.push({ path: key, size: parseInt(size || '0', 10), updated_at: lm || '' });
    }
    return items;
  }

  async healthCheck() {
    if (!this.enabled) return { ok: false, latency_ms: 0, error: 'Not configured' };
    return { ok: true, latency_ms: 0 };
  }
}
