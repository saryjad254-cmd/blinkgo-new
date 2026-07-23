// Input validation helpers for API routes
// Provides type-safe, sanitized input extraction

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

/**
 * Sanitize a free-text input by stripping control chars and limiting length.
 * Use for notes, addresses, etc. where HTML injection is a concern.
 */
export function sanitizeUrl(s: unknown, allowedProtocols = ['https:', 'http:']): string | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  if (s.length > 2048) return null;
  try {
    const u = new URL(s);
    if (!allowedProtocols.includes(u.protocol)) return null;
    // Block javascript: and data: even if they sneak in via URL parsing
    if (/^(javascript|data|vbscript|file):/i.test(s.trim())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function sanitizeText(s: unknown, maxLen = 500): string {
  if (typeof s !== 'string') return '';
  // Strip control chars except newlines/tabs
  return s
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLen)
    .trim();
}

/**
 * Parse a safe integer from an unknown value.
 */
export function isValidUuid(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  // Accept standard RFC 4122 UUIDs OR all-numeric UUIDs (used in seed data).
  // Strict: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  // Lenient: any 8-4-4-4-12 hex.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * isValidUuidStrict — same as isValidUuid but rejects the nil UUID
 * (00000000-0000-0000-0000-000000000000). Use this for authorization checks
 * where a nil UUID would be a security risk.
 */
export function isValidUuidStrict(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (s === '00000000-0000-0000-0000-000000000000') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function toSafeInt(s: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0): number {
  if (typeof s === 'number' && Number.isFinite(s) && s >= min && s <= max) return s;
  if (typeof s === 'string') {
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n >= min && n <= max) return n;
  }
  return fallback;
}
