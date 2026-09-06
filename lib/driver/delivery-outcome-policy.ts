import type { DeliveryHandoff } from '@/lib/delivery-preferences';

export const DELIVERY_PROOF_BUCKET = 'delivery-proofs';
export const DELIVERY_PROOF_MAX_BYTES = 3 * 1024 * 1024;
export const DELIVERY_PROOF_RETENTION_DAYS = 30;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ParsedDeliveryPhoto {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

export const FAILED_DELIVERY_REASONS = [
  'customer_unreachable',
  'cannot_find_address',
  'unsafe_location',
  'recipient_refused',
  'damaged_order',
  'other',
] as const;

export type FailedDeliveryReason = (typeof FAILED_DELIVERY_REASONS)[number];

export function isFailedDeliveryReason(value: unknown): value is FailedDeliveryReason {
  return typeof value === 'string' && FAILED_DELIVERY_REASONS.includes(value as FailedDeliveryReason);
}

export function deliveryEvidencePolicy(handoff: DeliveryHandoff, arrivedAtDropoff: boolean) {
  return {
    arrivalRequired: true,
    pinRequired: arrivedAtDropoff && handoff === 'hand_to_me',
    photoRequired: arrivedAtDropoff && handoff === 'leave_at_door',
  };
}

export function parseDeliveryPhoto(dataUrl: unknown): ParsedDeliveryPhoto | null {
  if (typeof dataUrl !== 'string' || !dataUrl) return null;
  if (dataUrl.length > Math.ceil(DELIVERY_PROOF_MAX_BYTES * 1.38) + 128) {
    throw new Error('DELIVERY_PHOTO_TOO_LARGE');
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match || !ALLOWED_IMAGE_TYPES.has(match[1].toLowerCase())) {
    throw new Error('DELIVERY_PHOTO_INVALID_TYPE');
  }
  const mimeType = match[1].toLowerCase() as ParsedDeliveryPhoto['mimeType'];
  const bytes = Uint8Array.from(Buffer.from(match[2], 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > DELIVERY_PROOF_MAX_BYTES) {
    throw new Error('DELIVERY_PHOTO_TOO_LARGE');
  }
  const validMagic = mimeType === 'image/png'
    ? bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    : mimeType === 'image/jpeg'
      ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!validMagic) throw new Error('DELIVERY_PHOTO_CONTENT_MISMATCH');
  return {
    bytes,
    mimeType,
    extension: mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp',
  };
}
