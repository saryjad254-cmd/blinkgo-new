/**
 * Server-side safe error mapper (F7 / qa-1)
 * ──────────────────────────────────────────
 * When an API route catches an unexpected error and needs to surface a
 * public message, the raw `error.message` from a database driver or
 * third-party library often leaks internal column names, constraint
 * identifiers, or schema details. This helper normalizes that into a
 * curated, locale-aware string and never forwards the raw text.
 *
 * Usage:
 *   return NextResponse.json(
 *     { ok: false, error: safeError(err, acceptLang) },
 *     { status: 500 }
 *   );
 *
 * Curated by language for the most common error categories. Anything
 * unrecognized falls back to a generic "Something went wrong" string
 * (translated) so internal details never reach the client.
 */

export type SafeLang = 'de' | 'ar' | 'en';

function pickLang(acceptLang: string | null | undefined): SafeLang {
  if (!acceptLang) return 'en';
  const v = acceptLang.toLowerCase();
  if (v.startsWith('ar')) return 'ar';
  if (v.startsWith('de')) return 'de';
  return 'en';
}

const MESSAGES: Record<string, Record<SafeLang, string>> = {
  duplicate: {
    de: 'Ressource existiert bereits.',
    en: 'Resource already exists.',
    ar: 'هذا المورد موجود مسبقاً.',
  },
  foreign_key: {
    de: 'Verknüpfte Ressource nicht gefunden.',
    en: 'Referenced resource not found.',
    ar: 'المورد المرتبط غير موجود.',
  },
  permission: {
    de: 'Vorgang nicht erlaubt.',
    en: 'Operation not permitted.',
    ar: 'العملية غير مسموح بها.',
  },
  connection: {
    de: 'Dienst vorübergehend nicht verfügbar.',
    en: 'Service temporarily unavailable.',
    ar: 'الخدمة غير متاحة مؤقتاً.',
  },
  schema: {
    de: 'Ungültige Anfrage.',
    en: 'Invalid request.',
    ar: 'طلب غير صالح.',
  },
  rate_limit: {
    de: 'Zu viele Anfragen. Bitte später erneut versuchen.',
    en: 'Too many requests. Please try again later.',
    ar: 'عدد كبير جداً من الطلبات. يرجى المحاولة لاحقاً.',
  },
  unauthorized: {
    de: 'Anmeldung erforderlich.',
    en: 'Please sign in to continue.',
    ar: 'يرجى تسجيل الدخول للمتابعة.',
  },
  not_found: {
    de: 'Ressource nicht gefunden.',
    en: 'Resource not found.',
    ar: 'المورد غير موجود.',
  },
  generic: {
    de: 'Ein unerwarteter Fehler ist aufgetreten.',
    en: 'An unexpected error occurred.',
    ar: 'حدث خطأ غير متوقع.',
  },
};

type Category = keyof typeof MESSAGES;

const PATTERNS: Array<{ cat: Category; re: RegExp }> = [
  { cat: 'duplicate', re: /duplicate key|unique constraint|already exists/i },
  { cat: 'foreign_key', re: /foreign key|violates foreign key/i },
  { cat: 'permission', re: /permission denied|insufficient_privilege|row-level security|RLS/i },
  { cat: 'connection', re: /connection|timeout|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i },
  { cat: 'schema', re: /column .* does not exist|relation .* does not exist|schema cache/i },
  { cat: 'rate_limit', re: /rate limit|too many requests|429/i },
  { cat: 'unauthorized', re: /jwt|invalid token|expired token|not authenticated|unauthorized/i },
  { cat: 'not_found', re: /not found|404|no rows/i },
];

function categorize(err: unknown): Category {
  const raw =
    err instanceof Error
      ? err.message || ''
      : typeof err === 'string'
      ? err
      : '';
  if (!raw) return 'generic';
  for (const { cat, re } of PATTERNS) {
    if (re.test(raw)) return cat;
  }
  return 'generic';
}

/**
 * Map an unknown error to a public-safe, locale-aware string.
 * @param err   The caught error (or its message).
 * @param acceptLang  Request's Accept-Language header (e.g. "de-DE,de;q=0.9").
 * @returns A user-safe message in the requested locale.
 */
export function safeError(err: unknown, acceptLang?: string | null): string {
  const lang = pickLang(acceptLang);
  const cat = categorize(err);
  return MESSAGES[cat][lang];
}

/**
 * Alias for `safeError` with the single-arg signature that the v80 plan
 * documented in the canonical pattern. Use this when you don't have
 * (or don't care about) the request's Accept-Language header and just
 * want a generic-English safe message:
 *
 *   import { safeErrorMessage } from '@/lib/api/safe-error';
 *   catch (e) { return fail(safeErrorMessage(e), 500); }
 */
export function safeErrorMessage(err: unknown): string {
  return safeError(err, null);
}

/**
 * Convenience: build a `{ ok: false, error: string }` body with the
 * localized message. Always log the raw error via the provided logger.
 * Logger is typed as `any` to be compatible with the project's @/lib/logging
 * (which has a strict `error(message, context, err)` shape) and any plain
 * `{ error(msg) }` helper.
 */
export function safeErrorBody(
  err: unknown,
  acceptLang: string | null | undefined,
  logger?: any,
): { ok: false; error: string } {
  if (logger && typeof logger.error === 'function') {
    try {
      logger.error('safe-error: suppressed raw message', {
        category: categorize(err),
        raw: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Never let logging crash the request
    }
  }
  return { ok: false, error: safeError(err, acceptLang) };
}
