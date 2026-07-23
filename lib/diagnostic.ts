/**
 * Diagnostic Logger for OAuth / Login redirect tracing
 * ─────────────────────────────────────────────────────
 * This module emits structured, uniquely-tagged log messages that are
 * easy to grep in Vercel Runtime Logs.
 *
 * Tag format: [BLINKGO_AUTH_TRACE:v77:<source>]
 *
 * NEVER logs:
 *  - access tokens
 *  - refresh tokens
 *  - service role keys
 *  - anon keys
 *  - full cookie values
 *  - authorization headers
 *
 * To disable in production, set LOG_OAUTH_TRACE=false.
 */

const ENABLED = process.env.LOG_OAUTH_TRACE !== 'false'; // default ON for v77 diagnosis

const VERSION = 'v77';

function safeStr(s: unknown, maxLen = 200): string {
  if (s == null) return '';
  const str = String(s);
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function safeCookieName(name: string): string {
  // Just return the cookie name, not the value
  return name;
}

export interface AuthTraceContext {
  source: string;
  reason?: string;
  pathname?: string;
  userId?: string | null;
  hasSession?: boolean;
  hasAuthCookie?: boolean;
  cookieNames?: string[];
  profileFound?: boolean;
  role?: string | null;
  isActive?: boolean | null;
  isVerified?: boolean | null;
  redirectTarget?: string;
  errorCode?: string;
  errorMessage?: string;
  extra?: Record<string, unknown>;
}

export function authTrace(event: string, ctx: AuthTraceContext): void {
  if (!ENABLED) return;

  const tag = `[BLINKGO_AUTH_TRACE:${VERSION}:${ctx.source}]`;

  // Filter out sensitive fields
  const safe: Record<string, unknown> = {
    event,
    reason: ctx.reason,
    pathname: ctx.pathname,
    userId: ctx.userId,
    hasSession: ctx.hasSession,
    hasAuthCookie: ctx.hasAuthCookie,
    cookieNames: ctx.cookieNames?.map(safeCookieName),
    profileFound: ctx.profileFound,
    role: ctx.role,
    isActive: ctx.isActive,
    isVerified: ctx.isVerified,
    redirectTarget: ctx.redirectTarget,
    errorCode: ctx.errorCode,
    errorMessage: ctx.errorMessage ? safeStr(ctx.errorMessage, 300) : undefined,
  };

  // Merge extra fields (filtered)
  if (ctx.extra) {
    for (const [k, v] of Object.entries(ctx.extra)) {
      if (k.match(/token|key|secret|password|authorization/i)) continue;
      safe[k] = v;
    }
  }

  // Remove undefined for cleaner output
  const clean = Object.fromEntries(Object.entries(safe).filter(([_, v]) => v !== undefined));

  // Use console.error so it appears in Vercel Runtime Logs without being
  // swallowed by console.log filters
  console.error(tag, JSON.stringify(clean));
}

/**
 * List of all sources. Keep in sync with the call sites.
 */
export const AUTH_SOURCES = {
  MIDDLEWARE: 'middleware',
  MIDDLEWARE_NO_USER: 'middleware_no_user',
  AUTH_CALLBACK_ENTRY: 'auth_callback_entry',
  AUTH_CALLBACK_NO_CODE: 'auth_callback_no_code',
  AUTH_CALLBACK_EXCHANGE_OK: 'auth_callback_exchange_ok',
  AUTH_CALLBACK_EXCHANGE_FAIL: 'auth_callback_exchange_fail',
  AUTH_CALLBACK_PROFILE_CREATE: 'auth_callback_profile_create',
  AUTH_CALLBACK_PROFILE_FETCH: 'auth_callback_profile_fetch',
  AUTH_CALLBACK_FINAL_REDIRECT: 'auth_callback_final_redirect',
  AUTH_CALLBACK_ERROR_REDIRECT: 'auth_callback_error_redirect',
  REQUIRE_ROLE_AUTH_FAIL: 'require_role_auth_fail',
  REQUIRE_ROLE_NO_PROFILE: 'require_role_no_profile',
  REQUIRE_ROLE_INACTIVE: 'require_role_inactive',
  REQUIRE_ROLE_WRONG_ROLE: 'require_role_wrong_role',
  REQUIRE_ROLE_OK: 'require_role_ok',
  CUSTOMER_LAYOUT: 'customer_layout',
  ROOT_PAGE: 'root_page',
  WELCOME_PAGE: 'welcome_page',
  WELCOME_SCREEN: 'welcome_screen',
  CART_PAGE: 'cart_page',
  DRIVER_SETTINGS: 'driver_settings',
  ADMIN_LAYOUT: 'admin_layout',
  LOGIN_FORM_OAUTH: 'login_form_oauth',
  HOME_PAGE_LOGGED_IN: 'home_page_logged_in',
  HOME_PAGE_NO_SESSION: 'home_page_no_session',
} as const;
