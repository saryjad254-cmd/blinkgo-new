/**
 * Canonical OAuth Callback URL Helper
 * ───────────────────────────────────
 * Solves: "OAuth callback URL doesn't match between LoginForm and Supabase"
 * Solves: "PKCE code_verifier cookie is set on one origin but callback is on another"
 *
 * RULES (v78.2):
 *  1. Production: ALWAYS use a single canonical base URL, derived from
 *     NEXT_PUBLIC_APP_URL (preferred) or APP_URL, with the host allowlist
 *     enforced. NEVER use window.location.origin in production.
 *  2. The canonical production base URL is the VERCEL PRIMARY DOMAIN:
 *       - HTTPS scheme
 *       - Host: `www.blinkgo.de` (Vercel's primary; apex blinkgo.de is
 *         automatically redirected to www by Vercel)
 *       - NOT a Vercel preview domain (*.vercel.app)
 *       - NOT localhost / 127.0.0.1 / 0.0.0.0
 *       - NOT a tunnel (trycloudflare.com, ngrok.io, loca.lt)
 *       - NOT the apex domain (blinkgo.de) — Vercel redirects apex→www
 *  3. Development: fall back to window.location.origin so local dev works
 *     (localhost / tunnels / lvh.me).
 *  4. The returned redirectTo is exactly:
 *       `${baseUrl}/auth/callback?next=${encodeURIComponent('/search')}&lang=${locale}`
 *     so that the PKCE code_verifier cookie (set on the SAME origin where
 *     the OAuth flow starts) is sent to the SAME origin where the callback
 *     lands.
 *
 * REDIRECT CHAIN (one direction only):
 *   blinkgo.de → www.blinko.de  (Vercel auto-redirect, apex → primary)
 *   www.blinko.de → ... → /auth/callback → /search
 *
 * SECURITY:
 *  - We never trust the browser's URL in production.
 *  - The host is always validated against an explicit allowlist.
 *  - If the env var is missing or invalid in production, we throw with a
 *    clear error message (no silent fallback).
 */

const ALLOWED_PRODUCTION_HOSTS = new Set([
  'www.blinkgo.de',  // Vercel's primary production domain
]);

const ALLOWED_DEVELOPMENT_HOSTS = new Set([
  'localhost:3000',
  '127.0.0.1:3000',
  '0.0.0.0:3000',
  'lvh.me:3000',
]);

const FORBIDDEN_HOST_PATTERNS = [
  /\.vercel\.app$/i,            // Vercel preview deployments
  /\.trycloudflare\.com$/i,     // tunnels
  /\.ngrok\.io$/i,
  /\.ngrok-free\.app$/i,
  /\.ngrok\.app$/i,
  /\.loca\.lt$/i,
];

// The apex domain (blinkgo.de) is also FORBIDDEN because Vercel
// auto-redirects apex→www. If the OAuth flow started on apex, the
// PKCE code_verifier cookie would be set on apex but the callback
// would land on www — a cross-origin mismatch. Always use www.
const APEX_DOMAIN = 'blinkgo.de';

export type Locale = 'de' | 'en' | 'ar';

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Returns the host (with port) from a URL string. Throws on invalid URL.
 */
function hostOf(url: string): string {
  // Accept URLs with or without scheme.
  let normalized = url;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = 'https://' + normalized;
  }
  // Trim trailing slash and any path
  const withoutPath = normalized.split('/').slice(0, 3).join('/');
  const u = new URL(withoutPath);
  return u.host.toLowerCase();
}

/**
 * Validate that a host is acceptable for production OAuth.
 */
function isValidProductionHost(host: string): boolean {
  if (ALLOWED_PRODUCTION_HOSTS.has(host)) return true;
  return false;
}

function isValidDevelopmentHost(host: string): boolean {
  // Allow tunnels, lvh.me, etc. for dev. Just reject obviously broken ones.
  if (!host || host === 'null' || host === 'undefined') return false;
  return true;
}

/**
 * Returns the canonical OAuth callback base URL.
 *
 * Production: validated env var (NEXT_PUBLIC_APP_URL > APP_URL), throws if
 *             missing or invalid. Returns `https://www.blinkgo.de`
 *             (Vercel's primary domain; apex blinkgo.de auto-redirects to www).
 * Development: prefers the env var if set, falls back to window.location.origin
 *             or `http://localhost:3000`.
 */
export function getCanonicalOAuthBaseUrl(opts?: { devOrigin?: string }): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

  if (envUrl) {
    // CSV support: take the first valid production-looking entry
    const candidates = envUrl.split(',').map(s => s.trim()).filter(Boolean);
    for (const candidate of candidates) {
      const host = hostOf(candidate);
      if (isProd()) {
        if (FORBIDDEN_HOST_PATTERNS.some(p => p.test(host))) continue;
        if (!isValidProductionHost(host)) continue;
        return candidate.replace(/\/+$/, '');
      } else {
        if (!isValidDevelopmentHost(host)) continue;
        return candidate.replace(/\/+$/, '');
      }
    }
    // No valid env-var candidate
    if (isProd()) {
      throw new Error(
        '[oauth/canonical-callback] No valid production URL found in NEXT_PUBLIC_APP_URL or APP_URL. ' +
        'Production OAuth requires a single canonical base URL pointing to `www.blinkgo.de` ' +
        '(Vercel primary; no apex, no Vercel preview, no tunnel). ' +
        `Got: ${envUrl}`
      );
    }
  }

  if (isProd()) {
    throw new Error(
      '[oauth/canonical-callback] NEXT_PUBLIC_APP_URL or APP_URL must be set in production. ' +
      'Refusing to use window.location.origin in production to prevent cross-domain OAuth failures.'
    );
  }

  // Development fallback
  if (opts?.devOrigin) {
    return opts.devOrigin.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

/**
 * Build the canonical OAuth callback URL for a given locale.
 *
 * ALWAYS returns:
 *   `<canonicalBase>/auth/callback?next=%2Fsearch&lang=<locale>`
 *
 * This guarantees that:
 *  - The PKCE code_verifier cookie is set on `<canonicalBase>` (via the
 *    browser's signInWithOAuth call).
 *  - The browser returns to `<canonicalBase>/auth/callback` after Google
 *    grants consent.
 *  - The cookies are on the SAME origin throughout the flow.
 */
export function buildCanonicalOAuthRedirectTo(
  locale: Locale,
  opts?: { devOrigin?: string; next?: string }
): { baseUrl: string; redirectTo: string } {
  const baseUrl = getCanonicalOAuthBaseUrl(opts);
  const next = opts?.next ?? '/search';
  const redirectTo = `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}&lang=${encodeURIComponent(locale)}`;
  return { baseUrl, redirectTo };
}

/**
 * Validate that a URL is safe to use as an OAuth redirectTo target in
 * production. Returns null if safe, or an error message if not.
 */
export function validateProductionRedirectTo(redirectTo: string): string | null {
  if (!isProd()) return null;
  try {
    const u = new URL(redirectTo);
    if (u.protocol !== 'https:') return `Insecure scheme: ${u.protocol}`;
    if (FORBIDDEN_HOST_PATTERNS.some(p => p.test(u.host))) {
      return `Forbidden host pattern: ${u.host}`;
    }
    if (u.host === APEX_DOMAIN || u.host === `www.${APEX_DOMAIN}` && !ALLOWED_PRODUCTION_HOSTS.has(u.host)) {
      return `Apex domain ${u.host} is forbidden in production (Vercel redirects apex → www; ` +
        `use ${Array.from(ALLOWED_PRODUCTION_HOSTS).join(', ')} to keep the OAuth flow on a single origin)`;
    }
    if (!isValidProductionHost(u.host)) {
      return `Host not in production allowlist: ${u.host}`;
    }
    if (u.pathname !== '/auth/callback') {
      return `Path must be /auth/callback, got: ${u.pathname}`;
    }
    return null;
  } catch (e: any) {
    return `Invalid URL: ${e?.message}`;
  }
}
