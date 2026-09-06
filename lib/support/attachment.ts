import { createHash, randomUUID } from 'node:crypto';
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  type SupportIssueType,
  supportPolicy,
} from '@/lib/support/policy';

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

type AllowedMime = keyof typeof MIME_EXTENSIONS;

export type ParsedSupportAttachment = {
  bytes: Buffer;
  mimeType: AllowedMime;
  originalName: string;
  sha256: string;
  extension: string;
};

function matchesMagic(bytes: Buffer, mimeType: AllowedMime): boolean {
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

export function parseSupportAttachment(
  input: unknown,
  issueType: SupportIssueType,
): ParsedSupportAttachment | null {
  if (input == null) return null;
  if (!supportPolicy(issueType).allowsAttachment) throw new Error('attachment_not_allowed');
  if (typeof input !== 'object') throw new Error('invalid_attachment');

  const candidate = input as Record<string, unknown>;
  const dataUrl = typeof candidate.data_url === 'string' ? candidate.data_url : '';
  const originalName = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 120) : 'support-photo';
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('invalid_attachment');

  const mimeType = match[1] as AllowedMime;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > SUPPORT_ATTACHMENT_MAX_BYTES) throw new Error('attachment_too_large');
  if (!matchesMagic(bytes, mimeType)) throw new Error('attachment_mime_mismatch');

  return {
    bytes,
    mimeType,
    originalName: originalName || 'support-photo',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    extension: MIME_EXTENSIONS[mimeType],
  };
}

export function supportAttachmentPath(ticketId: string, extension: string): string {
  return `${ticketId}/${randomUUID()}.${extension}`;
}
