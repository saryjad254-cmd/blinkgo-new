/**
 * Client-side error message extractor
 * ────────────────────────────────────
 * API responses return errors in one of these shapes:
 *   { ok: false, error: "string" }
 *   { ok: false, error: { code, message, statusCode } }
 *   { ok: false, error: "INVALID_CREDENTIALS" }  ← sometimes codes, not messages
 *
 * The frontend needs a human-readable string for display.
 * This helper normalizes all those shapes into a safe string.
 */

export function extractErrorMessage(data: any, fallback = 'An error occurred'): string {
  if (!data) return fallback;

  // 1) Direct string error
  if (typeof data === 'string') return data;

  // 2) Object error { code, message, statusCode }
  if (typeof data.error === 'object' && data.error !== null) {
    if (data.error.message) return data.error.message;
    if (data.error.code) return humanizeCode(data.error.code);
  }

  // 3) String error field
  if (typeof data.error === 'string') {
    // Some APIs return error codes (UPPER_SNAKE_CASE) without descriptive messages
    if (data.error.includes('_') && data.error === data.error.toUpperCase()) {
      return humanizeCode(data.error);
    }
    return data.error;
  }

  // 4) Top-level message
  if (data.message) return data.message;

  return fallback;
}

/**
 * Convert a UPPER_SNAKE_CASE code to a human-readable message.
 * Falls back to a cleaned-up version of the code itself.
 */
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

  // Generic: convert UPPER_SNAKE to "Title Case"
  return code
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
