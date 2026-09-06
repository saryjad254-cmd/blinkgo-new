/**
 * Foundation: Client-side error message extractor
 * ─────────────────────────────────────────────
 * Normalizes API error shapes into a human-readable string.
 */

export function extractErrorMessage(data: unknown, fallback = 'An error occurred'): string {
  if (typeof data === 'string') return normalizeString(data, fallback);
  if (data instanceof Error) return normalizeString(data.message, fallback);
  if (!isRecord(data)) return fallback;

  const nested = data.error;
  if (typeof nested === 'string') return normalizeString(nested, fallback);
  if (isRecord(nested)) {
    if (typeof nested.message === 'string') return normalizeString(nested.message, fallback);
    if (typeof nested.code === 'string') return humanizeCode(nested.code);
    if (isRecord(nested.details) && typeof nested.details.message === 'string') {
      return normalizeString(nested.details.message, fallback);
    }
  }

  if (typeof data.message === 'string') return normalizeString(data.message, fallback);
  if (typeof data.code === 'string') return humanizeCode(data.code);
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: string, fallback: string): string {
  const message = value.trim();
  if (!message) return fallback;
  if (/^[A-Z][A-Z0-9_]+$/.test(message)) return humanizeCode(message);
  return message;
}

function humanizeCode(code: string): string {
  const map: Record<string, string> = {
    INVALID_CREDENTIALS: 'Invalid email or password',
    UNAUTHORIZED: 'Please sign in to continue',
    FORBIDDEN: 'You don\'t have permission to do that',
    NOT_FOUND: 'Resource not found',
    VALIDATION_ERROR: 'Please check your input',
    CSRF: 'Security check failed. Please refresh the page.',
    RATE_LIMITED: 'Too many attempts. Please try again later.',
    PAYLOAD_TOO_LARGE: 'Request too large',
    INTERNAL_ERROR: 'Something went wrong. Please try again.',
    NO_RESTAURANT: 'Restaurant not found',
    NOT_RESTAURANT: 'This action is for restaurant accounts only',
    NOT_ADMIN: 'This action is for administrators only',
    NOT_DRIVER: 'This action is for drivers only',
    INVALID_TRANSITION: 'That action is not allowed in the current state',
    CANCEL_TOO_LATE: 'Order can no longer be cancelled',
    ORDER_NOT_FOUND: 'Order not found',
    INVALID_RESTAURANT_ID: 'Invalid restaurant',
    INVALID_PRODUCT_ID: 'Invalid product',
    OTP_INVALID: 'Invalid or expired code',
    OTP_EXPIRED: 'Code has expired. Please request a new one.',
    EMAIL_TAKEN: 'An account with this email already exists',
    WEAK_PASSWORD: 'Password is too weak. Use at least 8 characters with a number and a letter.',
  };

  if (map[code]) return map[code];

  return code
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
