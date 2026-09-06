import { ValidationError } from '@/lib/errors';

export const PUBLIC_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PublicImageMimeType = (typeof PUBLIC_IMAGE_MIME_TYPES)[number];

const EXTENSION: Record<PublicImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validatePublicImage(file: File, maxBytes: number) {
  if (file.size <= 0) throw new ValidationError('An image file is required');
  if (file.size > maxBytes) throw new ValidationError(`Image must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller`);
  if (!PUBLIC_IMAGE_MIME_TYPES.includes(file.type as PublicImageMimeType)) {
    throw new ValidationError('Only JPG, PNG and WebP images are allowed');
  }
}

export async function readValidatedPublicImage(file: File, maxBytes: number) {
  validatePublicImage(file, maxBytes);
  const mimeType = file.type as PublicImageMimeType;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = mimeType === 'image/jpeg'
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === 'image/png'
      ? bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
      : bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!valid) throw new ValidationError('Image content does not match its declared format');
  return { bytes, mimeType, extension: EXTENSION[mimeType] };
}

export function storageObjectPath(publicUrl: unknown, bucket: string) {
  if (typeof publicUrl !== 'string' || !publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    const encoded = url.pathname.slice(index + marker.length);
    const path = decodeURIComponent(encoded);
    return path && !path.includes('..') ? path : null;
  } catch {
    return null;
  }
}
