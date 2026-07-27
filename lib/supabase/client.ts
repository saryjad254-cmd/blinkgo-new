/**
 * Supabase Browser Client
 * ───────────────────────
 * SECURITY: No hardcoded fallback for project URL or anon key. The build
 * will fail if these env vars are missing in production.
 *
 * The Supabase anon key is by design public — it is rate-limited and gated
 * by RLS. Never embed a service-role key in client code.
 */

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'These must be set at build time. Refusing to start with insecure defaults.',
      );
    }
    // Dev: log warning but allow (so type-check passes without env)
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn(
        '[supabase] Missing env vars in dev — using placeholder. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
      );
    }
    return { url: 'https://placeholder.invalid', anon: 'placeholder' };
  }
  return { url, anon };
}

export function createBrowserClient() {
  const { url, anon } = getSupabaseConfig();
  return createSupabaseBrowserClient(url, anon);
}
