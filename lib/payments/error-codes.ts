/**
 * Payment error codes — stable, language-independent identifiers.
 *
 * WHY THIS EXISTS
 * ---------------
 * The checkout previously rendered `result.error.message` from Stripe and
 * `e.message` from thrown exceptions straight into the UI. That leaked raw,
 * English-only Stripe copy (and potentially internal details) to customers in
 * all three locales. The API likewise returned `e.message` to the client.
 *
 * Now: the server returns a stable `code`, the client maps that code to a
 * translated string, and raw provider/exception text is never rendered.
 * Server logs stay in English and keep the original detail.
 *
 * This module is pure mapping — it contains no payment logic.
 */

export const PAYMENT_ERROR_CODES = {
  INIT_FAILED: 'PAYMENT_INIT_FAILED',
  DECLINED: 'PAYMENT_DECLINED',
  INVALID_CARD: 'PAYMENT_INVALID_CARD',
  CANCELLED: 'PAYMENT_CANCELLED',
  ALREADY_COMPLETED: 'PAYMENT_ALREADY_COMPLETED',
  CONFIG_MISSING: 'PAYMENT_CONFIG_MISSING',
  NETWORK: 'PAYMENT_NETWORK_ERROR',
  FAILED: 'PAYMENT_FAILED',
} as const;

export type PaymentErrorCode =
  (typeof PAYMENT_ERROR_CODES)[keyof typeof PAYMENT_ERROR_CODES];

/** Stable code → key inside the `payments` section of the locale files. */
const CODE_TO_KEY: Record<string, string> = {
  [PAYMENT_ERROR_CODES.INIT_FAILED]: 'initFailed',
  [PAYMENT_ERROR_CODES.DECLINED]: 'declined',
  [PAYMENT_ERROR_CODES.INVALID_CARD]: 'invalidCard',
  [PAYMENT_ERROR_CODES.CANCELLED]: 'cancelled',
  [PAYMENT_ERROR_CODES.ALREADY_COMPLETED]: 'alreadyCompleted',
  [PAYMENT_ERROR_CODES.CONFIG_MISSING]: 'configMissing',
  [PAYMENT_ERROR_CODES.NETWORK]: 'networkError',
  [PAYMENT_ERROR_CODES.FAILED]: 'genericFailed',
};

/**
 * Translate a stable code using the `payments` section of the active locale
 * dictionary. Falls back to the generic failure message — never to raw text.
 */
export function paymentErrorMessage(t: unknown, code?: string | null): string {
  const section = (t as any)?.payments ?? {};
  const key = (code && CODE_TO_KEY[code]) || 'genericFailed';
  return section[key] ?? section.genericFailed ?? '';
}

/**
 * Map a Stripe.js error object to one of our stable codes.
 * Only the code/type is inspected — the provider's message is discarded so it
 * can never reach the customer.
 */
export function stripeErrorToCode(err: {
  type?: string;
  code?: string;
  decline_code?: string;
} | null | undefined): PaymentErrorCode {
  if (!err) return PAYMENT_ERROR_CODES.FAILED;

  const code = err.code ?? '';

  if (code === 'card_declined' || err.decline_code) return PAYMENT_ERROR_CODES.DECLINED;
  if (
    code === 'incorrect_number' ||
    code === 'invalid_number' ||
    code === 'invalid_expiry_month' ||
    code === 'invalid_expiry_year' ||
    code === 'invalid_cvc' ||
    code === 'incorrect_cvc' ||
    code === 'expired_card' ||
    code === 'incomplete_number' ||
    code === 'incomplete_cvc' ||
    code === 'incomplete_expiry' ||
    err.type === 'validation_error'
  ) {
    return PAYMENT_ERROR_CODES.INVALID_CARD;
  }
  if (code === 'payment_intent_authentication_failure') return PAYMENT_ERROR_CODES.DECLINED;
  if (err.type === 'api_connection_error') return PAYMENT_ERROR_CODES.NETWORK;

  return PAYMENT_ERROR_CODES.FAILED;
}
