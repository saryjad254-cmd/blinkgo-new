/**
 * Input Sanitization — XSS / Injection Prevention
 * ───────────────────────────────────────────────
 * Defense in depth against:
 *  - XSS (cross-site scripting)
 *  - HTML injection
 *  - Script injection
 *  - SQL injection (in string fields)
 *
 * NOTE: This is belt-and-suspenders. Primary defense is
 * parameterised queries (Supabase client) and React's
 * auto-escaping. This is for edge cases.
 */

const DANGEROUS_TAGS = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const DANGEROUS_ATTRS = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_URL = /javascript\s*:/gi;
const DATA_URL = /data\s*:\s*text\/html/gi;

export function sanitizeText(input: string | null | undefined, maxLength = 1000): string {
  if (!input) return '';
  return String(input)
    .slice(0, maxLength)
    .replace(DANGEROUS_TAGS, '')
    .replace(DANGEROUS_ATTRS, '')
    .replace(JAVASCRIPT_URL, '')
    .replace(DATA_URL, '')
    .trim();
}

export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = String(url).trim().slice(0, 2048);
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function sanitizeFilename(filename: string | null | undefined): string {
  if (!filename) return '';
  return String(filename)
    .split(/[/\\]/)
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 255) || '';
}

export function hasSqlInjectionPattern(input: string): boolean {
  const patterns = [
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bDROP\b.*\bTABLE\b)/i,
    /(\bINSERT\b.*\bINTO\b)/i,
    /(\bDELETE\b.*\bFROM\b)/i,
    /(\bUPDATE\b.*\bSET\b)/i,
    /;\s*(DROP|TRUNCATE|ALTER)/i,
    /'\s*OR\s*'?\d+'?\s*=\s*'?\d+/i,
    /'\s*;\s*--/,
    /\bexec\b\s*\(/i,
  ];
  return patterns.some((p) => p.test(input));
}

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_REGEX.test(value);
}

export function sanitizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/[^\d+\-() ]/g, '').slice(0, 30);
}
