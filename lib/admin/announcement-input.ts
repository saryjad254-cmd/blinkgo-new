import { ValidationError } from '@/lib/errors';

export const ANNOUNCEMENT_TYPES = ['info', 'warning', 'success', 'maintenance', 'promo'] as const;
export const ANNOUNCEMENT_AUDIENCES = ['all', 'customers', 'drivers', 'restaurants', 'admins'] as const;

type AnnouncementPatch = {
  title?: string;
  message?: string;
  type?: (typeof ANNOUNCEMENT_TYPES)[number];
  audience?: (typeof ANNOUNCEMENT_AUDIENCES)[number];
  link_url?: string | null;
  link_label?: string | null;
  is_active?: boolean;
  starts_at?: string;
  ends_at?: string | null;
};

function internalLink(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError('Link must be a relative application path');
  const link = value.trim().slice(0, 500);
  if (!link.startsWith('/') || link.startsWith('//') || link.includes('\\')) {
    throw new ValidationError('Link must be a relative application path');
  }
  return link;
}

function isoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} must be a valid date`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${field} must be a valid date`);
  return parsed.toISOString();
}

export function parseAnnouncementInput(input: unknown, partial = false): AnnouncementPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('Invalid request body');
  const body = input as Record<string, unknown>;
  const result: AnnouncementPatch = {};

  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    if (!title) throw new ValidationError('Title is required');
    result.title = title;
  }
  if (!partial || body.message !== undefined) {
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    if (!message) throw new ValidationError('Message is required');
    result.message = message;
  }
  if (!partial || body.type !== undefined) {
    const type = String(body.type ?? 'info') as AnnouncementPatch['type'];
    if (!ANNOUNCEMENT_TYPES.includes(type!)) throw new ValidationError('Invalid announcement type');
    result.type = type;
  }
  if (!partial || body.audience !== undefined) {
    const audience = String(body.audience ?? 'all') as AnnouncementPatch['audience'];
    if (!ANNOUNCEMENT_AUDIENCES.includes(audience!)) throw new ValidationError('Invalid announcement audience');
    result.audience = audience;
  }
  if (!partial || body.link_url !== undefined) result.link_url = internalLink(body.link_url);
  if (!partial || body.link_label !== undefined) {
    result.link_label = typeof body.link_label === 'string' && body.link_label.trim()
      ? body.link_label.trim().slice(0, 100)
      : null;
  }
  if (!partial || body.is_active !== undefined) {
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') throw new ValidationError('is_active must be boolean');
    result.is_active = body.is_active !== false;
  }
  if (!partial || body.starts_at !== undefined) {
    result.starts_at = body.starts_at === undefined ? new Date().toISOString() : isoDate(body.starts_at, 'starts_at');
  }
  if (!partial || body.ends_at !== undefined) {
    result.ends_at = body.ends_at === null || body.ends_at === '' || body.ends_at === undefined
      ? null
      : isoDate(body.ends_at, 'ends_at');
  }

  const startsAt = result.starts_at ? new Date(result.starts_at).getTime() : null;
  const endsAt = result.ends_at ? new Date(result.ends_at).getTime() : null;
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
    throw new ValidationError('ends_at must be after starts_at');
  }
  if (partial && Object.keys(result).length === 0) throw new ValidationError('No updatable fields');
  return result;
}
