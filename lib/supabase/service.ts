/**
 * Service-role Supabase client (bypasses RLS).
 * ONLY use on the server for system-level operations (driver location writes,
 * notification creation, admin tasks).
 * NEVER expose to the browser.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Service-role key format compatibility
 * ──────────────────────────────────────────────────────────────────────
 * Supabase ships two service-role key formats:
 *
 * 1. **Legacy JWT** — starts with `eyJ` (a signed JWT, e.g. ES256).
 *    PostgREST expects this as `Authorization: Bearer <jwt>` AND `apikey: <jwt>`.
 *
 * 2. **New secret** — starts with `sb_secret_` (opaque secret, not a JWT).
 *    PostgREST accepts this as `apikey: <secret>` but, depending on the
 *    PostgREST / platform version, may try to verify it as a JWT when it
 *    arrives in `Authorization: Bearer …`, returning
 *    `invalid JWT: unable to parse or verify signature, token is
 *    unverifiable: error while executing keyfunc: unrecognized JWT kid
 *    <nil> for algorithm ES256`.
 *
 *    On Supabase projects where this error surfaces, the new key MUST NOT
 *    be sent as `Authorization: Bearer`. Sending it only via `apikey`
 *    works on every PostgREST version.
 *
 * The `createClient` wrapper in @supabase/supabase-js installs a
 * `fetchWithAuth` middleware that RE-INSERTS `Authorization: Bearer <key>`
 * on every request if it is missing. A simple fetch override that
 * *deletes* `Authorization` does not help — the middleware will add it
 * back.
 *
 * The only reliable fix is to provide a `getAccessToken` callback that
 * returns a non-JWT placeholder (such as the apikey itself) and a custom
 * `fetch` that:
 *   - always sets `apikey: <key>`,
 *   - for legacy JWT keys, leaves the `Authorization: Bearer` that the
 *     middleware sets,
 *   - for new `sb_secret_*` keys, **removes** the `Authorization` header
 *     AFTER the middleware has set it (by running as a wrapping fetch
 *     around the middleware's output).
 *
 * In practice the simplest working approach is:
 *   1. For new keys, hand the lib a dummy `getAccessToken` that returns
 *      a short opaque string (e.g. the key itself).
 *   2. Wrap the `fetch` such that it always strips `Authorization` when
 *      the key is in the new format.
 *
 * Because supabase-js calls `fetchWithAuth` first and then forwards to
 * the user-supplied `global.fetch`, we can intercept at that point: the
 * custom `fetch` we pass in is the LAST function on the chain, so by the
 * time it runs the middleware has already merged its headers into the
 * `Request` we receive. We simply drop the offending header there.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const NEW_KEY_PREFIX = 'sb_secret_';
const JWT_KEY_PREFIX = 'eyJ';

function isLegacyJwtKey(key: string): boolean {
  return key.startsWith(JWT_KEY_PREFIX);
}

function isNewSecretKey(key: string): boolean {
  return key.startsWith(NEW_KEY_PREFIX);
}

/**
 * Build a fetch wrapper that:
 *  - sends `apikey: <key>` (mandatory for PostgREST),
 *  - sends `Authorization: Bearer <key>` only for legacy JWT keys,
 *  - REMOVES the `Authorization` header entirely for new `sb_secret_*`
 *    keys so PostgREST does not try to verify it as a JWT.
 *
 * The wrapper is installed as the user's `global.fetch`, which supabase-js
 * calls via its internal `fetchWithAuth` chain. The middleware sets
 * `Authorization: Bearer <key>` first; this wrapper strips it on the
 * final hop if the key is in the new format.
 */
function makeServiceFetch(key: string): typeof fetch {
  const isNewKey = isNewSecretKey(key) && !isLegacyJwtKey(key);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers || {});

    // Always set apikey
    headers.set('apikey', key);

    // Different Supabase endpoints have different requirements:
    //   - PostgREST (/rest/v1, /storage/v1, /realtime/v1, /functions/v1):
    //     accepts apikey OR Authorization. But new sb_secret_* keys sent
    //     as Authorization: Bearer fail with "unrecognized JWT kid".
    //   - GoTrue (/auth/v1): REQUIRES Authorization: Bearer for admin
    //     endpoints. Returns "invalid JWT" if only apikey is sent.
    //
    // Strategy: only strip Authorization for PostgREST/storage/etc.
    // For GoTrue, keep it.
    const url = typeof input === 'string' ? input : (input as URL).toString();
    const isGoTrue = url.includes('/auth/v1');
    const isPostgRest =
      url.includes('/rest/v1') ||
      url.includes('/storage/v1') ||
      url.includes('/realtime/v1') ||
      url.includes('/functions/v1');

    if (isNewKey) {
      if (isGoTrue) {
        // GoTrue REQUIRES Authorization: Bearer for admin operations.
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${key}`);
        }
      } else {
        // PostgREST with new secret key: strip Authorization to avoid
        // the "unrecognized JWT kid" error.
        headers.delete('Authorization');
      }
    } else {
      // Legacy JWT keys: ensure Authorization is present.
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${key}`);
      }
    }

    if (!headers.has('X-Client-Info')) {
      headers.set('X-Client-Info', 'blinkgo-service-role');
    }

    return fetch(input, { ...init, headers });
  };
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url) {
    throw new Error('createServiceClient: NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  if (!key) {
    throw new Error('createServiceClient: SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  const customFetch = makeServiceFetch(key);

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: customFetch,
      headers: {
        'X-Client-Info': 'blinkgo-service-role',
      },
    },
  });
}
