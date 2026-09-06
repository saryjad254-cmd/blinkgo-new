/**
 * Foundation: Validation Utilities
 * ────────────────────────────────
 * Type guards, sanitizers, and parsers for input validation.
 * Use these BEFORE handing data to the database.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MAX = 100;
const PHONE_REGEX = /^\+?[0-9\s\-()]{6,20}$/;

export function isValidEmail(s: unknown): s is string {
  return typeof s === 'string' && EMAIL_REGEX.test(s) && s.length <= 254;
}

export function sanitizeEmail(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.toLowerCase().trim().slice(0, 254);
}

export function isValidPassword(s: unknown): s is string {
  return typeof s === 'string' && s.length >= PASSWORD_MIN && s.length <= PASSWORD_MAX;
}

export function isValidName(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  return trimmed.length >= 2 && trimmed.length <= NAME_MAX;
}

export function isValidPhone(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  return PHONE_REGEX.test(s) && s.length <= 20;
}

export function isValidOtpCode(s: unknown): s is string {
  return typeof s === 'string' && /^\d{6}$/.test(s);
}

export function isValidRole(s: unknown): s is 'customer' | 'driver' | 'restaurant' | 'admin' {
  return s === 'customer' || s === 'driver' || s === 'restaurant' || s === 'admin';
}

export function sanitizeUrl(s: unknown, allowedProtocols = ['https:', 'http:']): string | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  if (s.length > 2048) return null;
  try {
    const u = new URL(s);
    if (!allowedProtocols.includes(u.protocol)) return null;
    if (/^(javascript|data|vbscript|file):/i.test(s.trim())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function sanitizeText(s: unknown, maxLen = 500): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLen)
    .trim();
}

export function isValidUuid(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function isValidUuidStrict(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (s === '00000000-0000-0000-0000-000000000000') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function toSafeInt(
  s: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  fallback = 0,
): number {
  if (typeof s === 'number' && Number.isFinite(s) && s >= min && s <= max) return s;
  if (typeof s === 'string') {
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n >= min && n <= max) return n;
  }
  return fallback;
}
