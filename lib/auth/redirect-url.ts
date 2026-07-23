/**
 * Canonical BlinkGo redirect URL — used by ALL auth flows.
 * ─────────────────────────────────────────────────────────
 * Solves: "reset-password link uses localhost"
 * Solves: "open-redirect via Host header"
 *
 * Rules:
 *   1. If `APP_URL` (preferred) or `NEXT_PUBLIC_APP_URL` is set and non-localhost,
 *      use it as the canonical base. CSV values are split and the first NON-localhost
 *      entry wins.
 *   2. If the env var is missing OR every entry is localhost, fall back to:
 *      - Development: the request origin (so tunnels and localhost still work)
 *      - Production: BLOCKS (throws) — never allow open redirect
 *   3. The returned URL is stripped of trailing slashes and validated against
 *      an explicit allowlist (env var `AUTH_ALLOWED_REDIRECT_HOSTS`, comma-separated).
 *      If the host doesn't match, throw.
 *
 * SECURITY:
 *   - We never trust `Host` header for authentication redirects.
 *   - We never use the request origin in production.
 *   - We always validate against a known-good host list.
 */

const ALLOW_DEFAULT = [
  'blinkgo.de',
  'www.blinkgo.de',
  'trycloudflare.com',
  'loca.lt',
  'localhost:3000',
  '127.0.0.1:3000',
];

const isProd = (): boolean => process.env.NODE_ENV === 'production';

function getAllowedHosts(): string[] {
  const fromEnv = (process.env.AUTH_ALLOWED_REDIRECT_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : ALLOW_DEFAULT;
}

function pickCanonicalFromEnv(): string | null {
  const env = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!env) return null;
  // Support CSV: split, filter out localhost, return the first production-looking URL.
  const candidates = env
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  for (const c of candidates) {
    if (
      c.includes('localhost') ||
      c.includes('127.0.0.1') ||
      c.includes('0.0.0.0')
    ) {
      continue;
    }
    return c;
  }
  return null;
}

function isHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return getAllowedHosts().some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

/**
 * Returns the canonical BlinkGo base URL.
 * In production: throws if no env var is set (no silent fallback to request origin).
 * In development: falls back to the request origin so local dev works.
 */
export function getCanonicalBaseUrl(reqOrigin?: string): string {
  const canonical = pickCanonicalFromEnv();
  if (canonical) {
    return canonical.replace(/\/+$/, '');
  }
  if (isProd()) {
    throw new Error(
      '[auth/redirect-url] APP_URL or NEXT_PUBLIC_APP_URL must be set in production. ' +
        'Refusing to fall back to request origin to prevent open-redirect attacks.',
    );
  }
  // Dev only
  if (reqOrigin) return reqOrigin.replace(/\/+$/, '');
  return 'http://localhost:3000';
}

/**
 * Build an absolute URL for an auth redirect path.
 * `path` must start with `/`. Throws on open-redirect.
 */
export function buildAuthUrl(path: string, reqOrigin?: string, search?: URLSearchParams): string {
  if (!path.startsWith('/')) {
    throw new Error(`[auth/redirect-url] path must start with "/", got: ${path}`);
  }
  // Reject protocol-relative and absolute paths
  if (path.startsWith('//') || path.includes('://')) {
    throw new Error(`[auth/redirect-url] open-redirect blocked: ${path}`);
  }
  const base = getCanonicalBaseUrl(reqOrigin);
  const u = new URL(path, base);
  // Validate host is in allowlist
  if (!isHostAllowed(u.host)) {
    throw new Error(
      `[auth/redirect-url] host "${u.host}" not in AUTH_ALLOWED_REDIRECT_HOSTS allowlist. ` +
        'Add it to the env var or fix APP_URL.',
    );
  }
  if (search) {
    search.forEach((v, k) => u.searchParams.append(k, v));
  }
  return u.toString();
}

/**
 * Validate a user-supplied next/redirect URL.
 * Allows only same-origin paths starting with `/` and not `//` or `/\\`.
 */
export function safeNextPath(input: string | null | undefined, fallback: string = '/'): string {
  if (!input) return fallback;
  if (typeof input !== 'string') return fallback;
  if (input.length > 1024) return fallback;
  if (!input.startsWith('/')) return fallback;
  if (input.startsWith('//') || input.startsWith('/\\') || input.startsWith('/%')) {
    return fallback;
  }
  return input;
}
