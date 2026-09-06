/**
 * API Layer: File Upload Helpers
 * ─────────────────────────────
 * Canonical file upload handling for API routes.
 *
 * Use case: user uploads an image (avatar, product photo, document).
 * Standardizes:
 *   - MIME type validation
 *   - File size validation
 *   - File hash (SHA-256) for dedup
 *   - Streaming upload to storage
 */

import { ValidationError } from '@/lib/foundation/errors';
import { z } from '@/lib/foundation/zod-mini';

// ── Types ────────────────────────────────────────────────────
export interface UploadedFile {
  readonly name: string;
  readonly type: string;          // MIME type
  readonly size: number;          // bytes
  readonly buffer: ArrayBuffer;   // raw bytes
  readonly hash?: string;         // SHA-256 (computed lazily)
  readonly extension?: string;    // file extension (lowercase, no dot)
}

export interface UploadOptions {
  /** Max file size in bytes (default: 10 MB) */
  maxSize?: number;
  /** Allowed MIME types (e.g. ['image/jpeg', 'image/png']) */
  allowedTypes?: string[];
  /** Allowed extensions (e.g. ['jpg', 'png']) */
  allowedExtensions?: string[];
  /** Required field name in form data */
  fieldName?: string;
  /** Max number of files (default: 1) */
  maxFiles?: number;
  /** Compute SHA-256 hash (default: true) */
  computeHash?: boolean;
}

// ── Hash computation ────────────────────────────────────────
async function sha256(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.substring(idx + 1).toLowerCase();
}

// ── Parse uploaded file from FormData ────────────────────────
export async function parseUploadedFile(
  req: Request,
  options: UploadOptions = {},
): Promise<UploadedFile> {
  const {
    maxSize = 10 * 1024 * 1024,
    allowedTypes,
    allowedExtensions,
    fieldName,
    computeHash = true,
  } = options;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new ValidationError('Invalid multipart form data');
  }

  // Find the file
  let file: File | null = null;
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (fieldName && key !== fieldName) continue;
      if (!file) file = value;
    }
  }
  if (!file) {
    throw new ValidationError(
      fieldName ? `Missing file in field '${fieldName}'` : 'No file uploaded',
    );
  }

  // Size check
  if (file.size > maxSize) {
    throw new ValidationError(
      `File too large: ${file.size} bytes (max ${maxSize})`,
    );
  }

  // Type check
  if (allowedTypes && !allowedTypes.includes(file.type)) {
    throw new ValidationError(
      `Invalid file type: ${file.type} (allowed: ${allowedTypes.join(', ')})`,
    );
  }

  // Extension check
  const ext = getExtension(file.name);
  if (allowedExtensions && !allowedExtensions.includes(ext)) {
    throw new ValidationError(
      `Invalid file extension: .${ext} (allowed: ${allowedExtensions.join(', ')})`,
    );
  }

  // Read the buffer
  const buffer = await file.arrayBuffer();

  // Compute hash
  const hash = computeHash ? await sha256(buffer) : undefined;

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    buffer,
    hash,
    extension: ext,
  };
}

export async function parseUploadedFiles(
  req: Request,
  options: UploadOptions = {},
): Promise<UploadedFile[]> {
  const {
    maxSize = 10 * 1024 * 1024,
    maxFiles = 1,
    allowedTypes,
    allowedExtensions,
    computeHash = true,
  } = options;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new ValidationError('Invalid multipart form data');
  }

  const files: UploadedFile[] = [];
  for (const [, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    if (files.length >= maxFiles) {
      throw new ValidationError(`Too many files (max ${maxFiles})`);
    }
    if (value.size > maxSize) {
      throw new ValidationError(`File too large: ${value.size} bytes`);
    }
    if (allowedTypes && !allowedTypes.includes(value.type)) {
      throw new ValidationError(`Invalid file type: ${value.type}`);
    }
    const ext = getExtension(value.name);
    if (allowedExtensions && !allowedExtensions.includes(ext)) {
      throw new ValidationError(`Invalid extension: .${ext}`);
    }
    const buffer = await value.arrayBuffer();
    const hash = computeHash ? await sha256(buffer) : undefined;
    files.push({
      name: value.name,
      type: value.type,
      size: value.size,
      buffer,
      hash,
      extension: ext,
    });
  }
  return files;
}

// ── Image validation helpers ─────────────────────────────────
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] as const;

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx'] as const;

// ── Zod schema for upload metadata ───────────────────────────
export const UploadedFileMetaSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(127),
  size: z.number(),
  hash: z.string().optional(),
  extension: z.string().optional(),
});
