/**
 * Data Layer: Supabase Client Factories
 * ─────────────────────────────────────
 * Single source of truth for Supabase client creation.
 * Replaces the legacy lib/supabase/{client,server,service}.ts.
 *
 * Three clients:
 *  - createBrowserClient()  → for client components (RLS-gated, anon key)
 *  - createServerClient()   → for server components / route handlers (RLS-gated, anon key, JWT from cookies)
 *  - createServiceClient() → for trusted server-side code (bypasses RLS, service-role key)
 *
 * The service-role client uses Foundation logging on all errors.
 *
 * Why a data layer?
 *  - Hides the supabase-js quirks (sb_secret_ format, JWT key handling)
 *  - One place to change client configuration
 *  - Easy to mock for tests
 *  - Easy to swap to a different backend
 */

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import { createServerClient as createSupabaseServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { log } from '@/lib/foundation';

// ── Constants ─────────────────────────────────────────────────
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key-for-build-time-only';
const NEW_KEY_PREFIX = 'sb_secret_';
const JWT_KEY_PREFIX = 'eyJ';

// ── Environment helpers ──────────────────────────────────────
function readSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing required env vars: ${missing.join(', ')}. ` +
      `These must be set in production. Refusing to start with insecure defaults.`,
    );
  }

  return { url, anonKey, serviceKey };
}

// ── Browser client (client components only) ───────────────────
export function createBrowserClient() {
  const { url, anonKey } = readSupabaseEnv();
  return createSupabaseBrowserClient(url, anonKey);
}

// ── Server client (server components + route handlers) ───────
export async function createServerClient() {
  const { url, anonKey } = readSupabaseEnv();
  const cookieStore = await cookies();

  return createSupabaseServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components cannot modify cookies — silent ignore
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Same as set
        }
      },
    },
  });
}

// ── Service client (admin operations, bypasses RLS) ──────────
function isLegacyJwtKey(key: string): boolean {
  return key.startsWith(JWT_KEY_PREFIX);
}

function isNewSecretKey(key: string): boolean {
  return key.startsWith(NEW_KEY_PREFIX);
}

/**
 * Custom fetch wrapper that handles both legacy JWT and new sb_secret_ keys.
 * - PostgREST (/rest/v1, /storage/v1, /realtime/v1, /functions/v1):
 *   For new keys, strips Authorization to avoid the "unrecognized JWT kid" error.
 * - GoTrue (/auth/v1):
 *   REQUIRES Authorization: Bearer for admin operations.
 */
function makeServiceFetch(key: string): typeof fetch {
  const isNewKey = isNewSecretKey(key) && !isLegacyJwtKey(key);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers || {});

    // Always set apikey
    headers.set('apikey', key);

    const url = typeof input === 'string' ? input : (input as URL).toString();
    const isGoTrue = url.includes('/auth/v1');
    const isPostgRest =
      url.includes('/rest/v1') ||
      url.includes('/storage/v1') ||
      url.includes('/realtime/v1') ||
      url.includes('/functions/v1');

    if (isNewKey) {
      if (isGoTrue) {
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${key}`);
        }
      } else {
        headers.delete('Authorization');
      }
    } else {
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
  const { url, serviceKey } = readSupabaseEnv();

  if (!serviceKey) {
    throw new Error('createServiceClient: SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  const customFetch = makeServiceFetch(serviceKey);

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: customFetch,
      headers: {
        'X-Client-Info': 'blinkgo-service-role',
      },
    },
  });
}

// ── Backwards compatibility shims (re-exports) ────────────────
// These keep existing imports working: `import { createBrowserClient } from '@/lib/supabase/client'`
export { createBrowserClient as _createBrowserClient } from '@/lib/supabase/client';
export { createServerClient as _createServerClient } from '@/lib/supabase/server';
export { createServiceClient as _createServiceClient } from '@/lib/supabase/service';

// ── Public exports of client types for type-safe repositories ─
export type SupabaseBrowser = ReturnType<typeof createBrowserClient>;
export type SupabaseServer = Awaited<ReturnType<typeof createServerClient>>;
export type SupabaseService = ReturnType<typeof createServiceClient>;

/** Generic Supabase client (union of all three) */
export type SupabaseClient = SupabaseBrowser | SupabaseServer | SupabaseService;

// ── Re-export for Foundation logger to access data layer ────
export { log as dataLog };
